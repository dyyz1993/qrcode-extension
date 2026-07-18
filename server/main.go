// Package main: qrcode-server
// 一个极简的短链服务：接收文本 -> 存 JSON -> 返回短码 -> /s/:code 展示页面
// 零第三方依赖，只用标准库。7 天过期自动清理。
package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ===== 配置（通过环境变量注入）=====

var (
	port      = envOrDefault("PORT", "3031")
	authToken = envOrDefault("AUTH_TOKEN", "")
	dataDir   = envOrDefault("DATA_DIR", "./data")
	dataFile  = "" // 在 main 里初始化
	baseURL   = envOrDefault("BASE_URL", "") // e.g. https://qrcode.shanbox.19930810.xyz
)

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ===== 数据模型 =====

type Link struct {
	Content string    `json:"content"`           // 文本内容（kind=text）
	Kind    string    `json:"kind,omitempty"`    // "text" | "image"（空 = text，向后兼容）
	MIME    string    `json:"mime,omitempty"`    // 图片 MIME (image/png 等)
	Size    int64     `json:"size,omitempty"`    // 图片字节数
	Created time.Time `json:"created"`
	Expires time.Time `json:"expires"`
}

type Store struct {
	mu   sync.RWMutex
	data map[string]Link
}

func newStore() *Store {
	return &Store{data: make(map[string]Link)}
}

// ===== 全局存储 =====

var store = newStore()

// ===== 持久化 =====

func loadFromDisk() {
	dataFile = filepath.Join(dataDir, "links.json")
	store.mu.Lock()
	defer store.mu.Unlock()

	b, err := os.ReadFile(dataFile)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[WARN] 读取数据文件失败: %v", err)
		}
		return // 文件不存在是正常的
	}
	if err := json.Unmarshal(b, &store.data); err != nil {
		log.Printf("[WARN] 解析数据文件失败: %v，将从头开始", err)
		store.data = make(map[string]Link)
	}
	log.Printf("[INFO] 已加载 %d 条记录", len(store.data))
}

// save 把内存数据整体写入磁盘（数据量小，整体覆盖可接受）
func save() error {
	store.mu.RLock()
	defer store.mu.RUnlock()
	b, err := json.MarshalIndent(store.data, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}
	tmp := dataFile + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, dataFile) // 原子替换
}

// ===== 过期清理 =====

func pruneExpired() int {
	store.mu.Lock()
	// 先在锁内收集要删的图片文件清单，文件 IO 放到锁外做
	type toRemove struct{ code, mime string }
	var imgs []toRemove
	now := time.Now()
	removed := 0
	for code, link := range store.data {
		if now.After(link.Expires) {
			if link.Kind == "image" {
				imgs = append(imgs, toRemove{code, link.MIME})
			}
			delete(store.data, code)
			removed++
		}
	}
	store.mu.Unlock()
	for _, im := range imgs {
		removeImageFile(im.code, im.mime)
	}
	if removed > 0 {
		log.Printf("[INFO] 清理了 %d 条过期记录（其中图片 %d）", removed, len(imgs))
	}
	return removed
}

func startPruneLoop() {
	go func() {
		// 启动时先清一遍
		removed := pruneExpired()
		if removed > 0 {
			_ = save()
		}
		// 每小时清一次
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if pruneExpired() > 0 {
				_ = save()
			}
		}
	}()
}

// ===== 短码生成 =====

const codeAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const codeLen = 6

// genCode 生成 6 位 base62 短码，碰撞则重试最多 5 次
func genCode() string {
	for attempt := 0; attempt < 5; attempt++ {
		buf := make([]byte, codeLen)
		randBytes := make([]byte, codeLen)
		if _, err := rand.Read(randBytes); err != nil {
			continue
		}
		for i := 0; i < codeLen; i++ {
			buf[i] = codeAlphabet[int(randBytes[i])%len(codeAlphabet)]
		}
		code := string(buf)
		store.mu.RLock()
		_, exists := store.data[code]
		store.mu.RUnlock()
		if !exists {
			return code
		}
	}
	// 极端情况：重试都碰撞，用时间戳兜底
	return fmt.Sprintf("%x", time.Now().UnixNano())[0:6]
}

// ===== 频率限制（内存，每 IP 每分钟 N 次）=====

var (
	rateMu    sync.Mutex
	rateMap   = make(map[string][]time.Time)
	rateLimit = 10 // 每 IP 每分钟
)

func rateAllow(ip string) bool {
	rateMu.Lock()
	defer rateMu.Unlock()
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	hits := rateMap[ip]
	// 清掉一分钟外的
	pruned := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	if len(pruned) >= rateLimit {
		rateMap[ip] = pruned
		return false
	}
	pruned = append(pruned, now)
	rateMap[ip] = pruned
	return true
}

// ===== HTTP 中间件 =====

func clientIP(r *http.Request) string {
	// 优先取 X-Forwarded-For（经 shanbox 代理时）
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	// 去掉端口
	idx := strings.LastIndex(r.RemoteAddr, ":")
	if idx > 0 {
		return r.RemoteAddr[:idx]
	}
	return r.RemoteAddr
}

// ===== 路由处理 =====

const maxContentLen = 64 * 1024    // 文本上限 64KB
const maxImageSize = 5 * 1024 * 1024 // 图片上限 5MB
const imageRateLimit = 5            // 图片上传每 IP 每分钟 5 次（省磁盘）

// mimeToExt 把 MIME 类型映射成文件扩展名
func mimeToExt(mime string) string {
	switch mime {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	default:
		return ".bin"
	}
}

// imagePath 返回图片在磁盘上的绝对路径
func imagePath(code, mime string) string {
	return filepath.Join(dataDir, "images", code+mimeToExt(mime))
}

// isImageMIME 判断是否为支持的图片类型
func isImageMIME(mime string) bool {
	switch mime {
	case "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp":
		return true
	}
	return false
}

// removeImageFile 删除图片文件（忽略错误，文件可能已不存在）
func removeImageFile(code, mime string) {
	if mime == "" {
		return
	}
	// 兜底：尝试所有可能的扩展名（万一 MIME 变过）
	for _, ext := range []string{mimeToExt(mime), ".jpg", ".png", ".gif", ".webp", ".bmp", ".bin"} {
		p := filepath.Join(dataDir, "images", code+ext)
		if _, err := os.Stat(p); err == nil {
			os.Remove(p)
		}
	}
}

// imageRateAllow 图片上传频率限制（独立计数，避免和文本混）
var (
	imageRateMu  sync.Mutex
	imageRateMap = make(map[string][]time.Time)
)

func imageRateAllow(ip string) bool {
	imageRateMu.Lock()
	defer imageRateMu.Unlock()
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	hits := imageRateMap[ip]
	pruned := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	if len(pruned) >= imageRateLimit {
		imageRateMap[ip] = pruned
		return false
	}
	pruned = append(pruned, now)
	imageRateMap[ip] = pruned
	return true
}

// POST /api/shorten
func handleShorten(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	ip := clientIP(r)

	// 鉴权
	if authToken != "" {
		provided := r.Header.Get("X-Auth-Token")
		if provided != authToken {
			writeJSON(w, 401, map[string]any{"error": "unauthorized"})
			return
		}
	}

	// 频率限制
	if !rateAllow(ip) {
		writeJSON(w, 429, map[string]any{"error": "rate_limited", "message": "请求太频繁，请稍后再试"})
		return
	}

	// 只接受 POST
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "method_not_allowed"})
		return
	}

	// 读 body
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxContentLen+1024))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "body_too_large", "message": "内容过长（上限 64KB）"})
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": "bad_json", "message": err.Error()})
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		writeJSON(w, 400, map[string]any{"error": "empty_content"})
		return
	}
	if len(content) > maxContentLen {
		writeJSON(w, 400, map[string]any{"error": "content_too_long", "message": "内容过长（上限 64KB）"})
		return
	}

	// 生成短码并存
	code := genCode()
	now := time.Now()
	link := Link{
		Content: content,
		Created: now,
		Expires: now.Add(7 * 24 * time.Hour),
	}
	store.mu.Lock()
	store.data[code] = link
	store.mu.Unlock()

	if err := save(); err != nil {
		log.Printf("[ERROR] 保存失败: %v", err)
		writeJSON(w, 500, map[string]any{"error": "persist_failed"})
		return
	}

	shortURL := buildShortURL(code)
	log.Printf("[INFO] 创建短链 code=%s ip=%s len=%d", code, ip, len(content))
	writeJSON(w, 200, map[string]any{
		"code": code,
		"url":  shortURL,
	})
}

func buildShortURL(code string) string {
	if baseURL != "" {
		return strings.TrimRight(baseURL, "/") + "/s/" + code
	}
	return "/s/" + code
}

// POST /api/upload —— multipart 图片上传
func handleUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	ip := clientIP(r)

	// 鉴权
	if authToken != "" {
		if r.Header.Get("X-Auth-Token") != authToken {
			writeJSON(w, 401, map[string]any{"error": "unauthorized"})
			return
		}
	}

	// 图片上传独立频率限制
	if !imageRateAllow(ip) {
		writeJSON(w, 429, map[string]any{"error": "rate_limited", "message": "上传太频繁，请稍后再试"})
		return
	}

	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "method_not_allowed"})
		return
	}

	// 限制整体请求体大小
	r.Body = http.MaxBytesReader(w, r.Body, maxImageSize+1024)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeJSON(w, 400, map[string]any{"error": "parse_failed", "message": "图片解析失败或过大（上限 5MB）：" + err.Error()})
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "no_file", "message": "未找到 image 字段：" + err.Error()})
		return
	}
	defer file.Close()

	if header.Size > maxImageSize {
		writeJSON(w, 400, map[string]any{"error": "image_too_large", "message": "图片过大（上限 5MB）"})
		return
	}

	// 嗅探真实 MIME（防伪造扩展名）：读前 512 字节
	head := make([]byte, 512)
	n, _ := file.Read(head)
	head = head[:n]
	mime := http.DetectContentType(head)
	if !isImageMIME(mime) {
		writeJSON(w, 400, map[string]any{"error": "not_image", "message": "不支持的图片类型：" + mime})
		return
	}
	// 把读指针拨回开头
	if seeker, ok := file.(io.Seeker); ok {
		seeker.Seek(0, io.SeekStart)
	}

	// 生成短码
	code := genCode()
	imgDir := filepath.Join(dataDir, "images")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		writeJSON(w, 500, map[string]any{"error": "mkdir_failed"})
		return
	}

	// 原子写入图片文件
	finalPath := imagePath(code, mime)
	tmpPath := finalPath + ".tmp"
	out, err := os.Create(tmpPath)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "create_failed"})
		return
	}
	written, err := io.Copy(out, file)
	out.Close()
	if err != nil {
		os.Remove(tmpPath)
		writeJSON(w, 500, map[string]any{"error": "write_failed"})
		return
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		os.Remove(tmpPath)
		writeJSON(w, 500, map[string]any{"error": "rename_failed"})
		return
	}

	// 存元数据
	now := time.Now()
	link := Link{
		Kind:    "image",
		MIME:    mime,
		Size:    written,
		Created: now,
		Expires: now.Add(7 * 24 * time.Hour),
	}
	store.mu.Lock()
	store.data[code] = link
	store.mu.Unlock()

	if err := save(); err != nil {
		removeImageFile(code, mime)
		log.Printf("[ERROR] 保存元数据失败: %v", err)
		writeJSON(w, 500, map[string]any{"error": "persist_failed"})
		return
	}

	shortURL := buildShortURL(code)
	log.Printf("[INFO] 上传图片 code=%s ip=%s mime=%s size=%d", code, ip, mime, written)
	writeJSON(w, 200, map[string]any{
		"code": code,
		"url":  shortURL,
		"size": written,
		"mime": mime,
	})
}

// GET /img/:code -> 返回原始图片二进制
func handleImg(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimPrefix(r.URL.Path, "/img/")
	if code == "" || len(code) > 16 || !isValidCode(code) {
		http.NotFound(w, r)
		return
	}

	store.mu.RLock()
	link, ok := store.data[code]
	store.mu.RUnlock()

	if !ok || link.Kind != "image" {
		http.NotFound(w, r)
		return
	}

	if time.Now().After(link.Expires) {
		// 惰性清理
		store.mu.Lock()
		delete(store.data, code)
		store.mu.Unlock()
		removeImageFile(code, link.MIME)
		_ = save()
		http.NotFound(w, r)
		return
	}

	p := imagePath(code, link.MIME)
	f, err := os.Open(p)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", link.MIME)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", link.Size))
	io.Copy(w, f)
}

// GET /s/:code -> 返回展示页面
func handleView(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimPrefix(r.URL.Path, "/s/")
	if code == "" || len(code) > 16 || !isValidCode(code) {
		http.NotFound(w, r)
		return
	}

	store.mu.RLock()
	link, ok := store.data[code]
	store.mu.RUnlock()

	if !ok {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(404)
		w.Write([]byte(viewPage("", "", true, false)))
		return
	}

	if time.Now().After(link.Expires) {
		// 惰性删除（图片还要删文件）
		store.mu.Lock()
		delete(store.data, code)
		store.mu.Unlock()
		if link.Kind == "image" {
			removeImageFile(code, link.MIME)
		}
		_ = save()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(404)
		w.Write([]byte(viewPage("", "", true, false)))
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if link.Kind == "image" {
		w.Write([]byte(viewImagePage(code, link.MIME, link.Size, link.Created)))
		return
	}
	w.Write([]byte(viewPage(link.Content, code, false, true)))
}

func isValidCode(code string) bool {
	for _, c := range code {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
			return false
		}
	}
	return true
}

// GET /api/health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	store.mu.RLock()
	count := len(store.data)
	store.mu.RUnlock()
	writeJSON(w, 200, map[string]any{
		"ok":     true,
		"count":  count,
		"uptime": int(time.Since(startTime).Seconds()),
	})
}

var startTime = time.Now()

// ===== 展示页面 HTML =====

func viewPage(content, code string, notFound, withCopy bool) string {
	if notFound {
		return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>二维码短链</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.box{text-align:center;max-width:400px}
.icon{font-size:56px;margin-bottom:12px}
h1{font-size:18px;font-weight:600;margin-bottom:8px}
p{color:#888;font-size:14px;line-height:1.6}
</style></head><body><div class="box"><div class="icon">🗑️</div><h1>内容不存在或已过期</h1><p>短链保留 7 天，可能已被清理。<br>请重新生成二维码。</p></div></body></html>`
	}

	createdStr := time.Now().Format("2006-01-02 15:04")
	_ = code
	// 把内容做 HTML 转义后塞进 <pre>，再用 JSON 注入给 JS 复制用
	contentJSON, _ := json.Marshal(content)
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>扫码内容</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1a1a1a;padding:20px;min-height:100vh}
.wrap{max-width:600px;margin:0 auto}
.head{text-align:center;padding:16px 0 20px}
.head .ic{font-size:40px;margin-bottom:8px}
.head h1{font-size:17px;font-weight:600;color:#333;padding:0 110px}
.content-box{background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px}
pre{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:14px;line-height:1.65;color:#222;max-height:50vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
.btn{position:fixed;top:16px;right:16px;z-index:100;padding:10px 16px;background:#4a90d9;color:#fff;border:none;border-radius:999px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(74,144,217,0.35);transition:transform .1s,background .15s;-webkit-tap-highlight-color:transparent;user-select:none}
.btn:active{transform:scale(0.95)}
.btn.done{background:#34a853;box-shadow:0 4px 12px rgba(52,168,83,0.35)}
.foot{text-align:center;color:#bbb;font-size:11px;margin-top:16px}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="ic">📋</div>
    <h1>扫码获得以下内容</h1>
  </div>
  <button class="btn" id="copyBtn" onclick="doCopy()">📋 复制</button>
  <div class="content-box">
    <pre id="content"></pre>
  </div>
  <div class="foot">生成于 ` + createdStr + ` · 7 天后过期</div>
</div>
<script>
var CONTENT = ` + string(contentJSON) + `;
document.getElementById('content').textContent = CONTENT;
function doCopy(){
  var btn = document.getElementById('copyBtn');
  var done = function(){ btn.textContent='✅ 已复制'; btn.classList.add('done'); setTimeout(function(){ btn.textContent='📋 一键复制'; btn.classList.remove('done'); },2000); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(CONTENT).then(done).catch(function(){ fallbackCopy(done); });
  } else { fallbackCopy(done); }
}
function fallbackCopy(done){
  var ta=document.createElement('textarea');
  ta.value=CONTENT;
  ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);
  ta.select();
  try{document.execCommand('copy');done();}catch(e){alert('复制失败，请长按内容手动复制');}
  document.body.removeChild(ta);
}
</script>
</body>
</html>`
}

// viewImagePage 返回图片展示页 HTML
func viewImagePage(code, mime string, size int64, created time.Time) string {
	createdStr := created.Format("2006-01-02 15:04")
	sizeStr := fmt.Sprintf("%.1f KB", float64(size)/1024)
	if size >= 1024*1024 {
		sizeStr = fmt.Sprintf("%.1f MB", float64(size)/1024/1024)
	}
	imgURL := "/img/" + code
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>扫码图片</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1a1a1a;padding:20px;min-height:100vh}
.wrap{max-width:600px;margin:0 auto}
.head{text-align:center;padding:16px 0 20px}
.head .ic{font-size:40px;margin-bottom:8px}
.head h1{font-size:17px;font-weight:600;color:#333;padding:0 110px}
.img-box{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:16px;text-align:center}
.img-box img{max-width:100%;border-radius:8px;display:block;margin:0 auto}
.btn{position:fixed;top:16px;right:16px;z-index:100;padding:10px 16px;background:#4a90d9;color:#fff;border:none;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:0 4px 12px rgba(74,144,217,0.35);transition:transform .1s;-webkit-tap-highlight-color:transparent;user-select:none}
.btn:active{transform:scale(0.95)}
.foot{text-align:center;color:#bbb;font-size:11px;margin-top:8px}
.hint{font-size:12px;color:#999;text-align:center;padding:8px 12px;background:#fff;border-radius:8px;margin-bottom:14px}
</style>
</head>
<body>
<a class="btn" href="` + imgURL + `" download>💾 保存</a>
<div class="wrap">
  <div class="head">
    <div class="ic">📷</div>
    <h1>扫码获得图片</h1>
  </div>
  <div class="hint">📱 在图片上长按可直接保存到相册，或点右上角「💾 保存」</div>
  <div class="img-box">
    <img src="` + imgURL + `" alt="扫码图片" onerror="this.parentElement.innerHTML='<div style=\\'padding:40px;color:#999\\'>图片加载失败或已删除</div>'">
  </div>
  <div class="foot">` + sizeStr + ` · ` + mime + ` · ` + createdStr + ` · 7 天后过期</div>
</div>
</body>
</html>`
}

// ===== 工具函数 =====

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.WriteHeader(status)
	b, _ := json.Marshal(body)
	w.Write(b)
}

// ===== CORS（允许扩展跨域请求）=====

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h(w, r)
	}
}

// ===== 主函数 =====

func main() {
	loadFromDisk()
	startPruneLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/shorten", withCORS(handleShorten))
	mux.HandleFunc("/api/upload", withCORS(handleUpload))
	mux.HandleFunc("/api/health", withCORS(handleHealth))
	mux.HandleFunc("/s/", handleView)
	mux.HandleFunc("/img/", handleImg)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<h1>QR Code Short Link Server</h1><p>OK</p>"))
			return
		}
		http.NotFound(w, r)
	})

	addr := ":" + port
	log.Printf("[INFO] qrcode-server 启动于 %s, 数据目录=%s", addr, dataDir)
	if authToken == "" {
		log.Printf("[WARN] AUTH_TOKEN 未设置，鉴权已关闭！")
	}
	if baseURL != "" {
		log.Printf("[INFO] BASE_URL=%s", baseURL)
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("[FATAL] 服务启动失败: %v", err)
	}
}
