# QR Code Tool

[![GitHub release](https://img.shields.io/github/v/release/dyyz1993/qrcode-extension)](https://github.com/dyyz1993/qrcode-extension/releases)
[![Build & Package](https://img.shields.io/github/actions/workflow/status/dyyz1993/qrcode-extension/package.yml)](https://github.com/dyyz1993/qrcode-extension/actions/workflows/package.yml)

一款 Chrome 扩展 + 轻量 Go 服务的组合工具：**二维码生成 / 解析** + **文本转短链二维码**。

粘贴任意文本 → 自动转成短链二维码 → 手机扫码打开页面 → 一键复制全文。

---

## ✨ 功能特性

### 🔗 链接 / 文本 → 二维码（本地生成）

点击工具栏图标，弹窗提供三个 Tab：

- **🔗 链接 Tab**：显示当前页 URL 的二维码，可手动输入任意 URL/文本，回车刷新
- **📝 文本 Tab**：粘贴长文本 → 调用远程服务转短链 → 生成**短链二维码**
  - 手机扫码后打开 HTML 页面，展示完整文本
  - 右上角「📋 复制」按钮，一键复制全文
  - 内容保留 7 天，自动清理
  - 回车直接生成 / Shift+Enter 换行 / 或点「🔲 生成二维码」按钮
  - 服务端不可达时自动降级为本地编码（依然可用，二维码较密）
- **📷 图片 Tab**：上传图片 → 短链二维码 → 手机扫码看图
  - 支持选择文件 / 拖拽 / Ctrl+V 粘贴截图
  - 在文本框粘贴图片也会自动切到此 Tab
  - 手机扫码打开图片页，右上角「💾 保存」可下载，长按图片可存相册
  - 支持 PNG/JPEG/GIF/WebP/BMP，单图上限 5MB
  - 7 天后自动清理

### 📷 网页图片 → 扫码看图（右键）

- 在网页图片上右键 → **「📷 此图传到服务器生成二维码」**
- 利用扩展的 SW fetch 绕过 CORS 和多数防盗链（请求带着页面 Cookie/Referer）
- 对服务器来说请求就像来自当前浏览器，大多数图床都能抓到
- 防盗链特别严格的图可能仍抓不到，会有清晰错误提示

### 🖼️ 解析图片中的二维码

- 右键网页中的 `<img>` 图片 → **"解析图片中的二维码"**
- 支持跨域图片（Service Worker 直接 fetch，绕过 CORS）

### 🟦 解析 Canvas 中的二维码

- 右键 Canvas 元素 → **"解析 Canvas 中的二维码"**
- 适用于动态生成的二维码

### 🔗 右键快捷生成

| 右键位置 | 功能 |
|---------|------|
| 链接上 | 为该链接生成二维码 |
| 选中的文字 | 为选中文本生成二维码 |
| 页面空白处 | 为当前页面生成二维码 |

---

## 📦 安装扩展

### 方法一：从 Release 安装（推荐）

1. 前往 [Releases](https://github.com/dyyz1993/qrcode-extension/releases) 下载最新 `.zip`
2. 解压到本地
3. 打开 Chrome → `chrome://extensions/`
4. 开启 **开发者模式**（右上角）
5. **加载已解压的扩展程序** → 选择解压后的文件夹

> ⚠️ 注意：要让「📝 文本」Tab 的短链功能可用，需要自行部署服务端（见下方）。
> 不部署也能用——会自动降级为本地编码原始文本。

---

## 🖥️ 部署远程短链服务（可选）

「📝 文本」Tab 的短链功能依赖一个轻量 Go 服务。部署后才能生成短链二维码。

### 前置要求

- 一台公网服务器（Linux）
- 本地安装 [Go 1.21+](https://go.dev/dl/)

### 一键部署

```bash
cd server
./deploy.sh              # 交叉编译 + 上传 + pm2 重启
```

首次部署后注册路由（以 [shanbox](https://github.com/) 网关为例）：

```bash
ssh your-host '/root/scripts/manage-route.sh add qrcode 3031 public'
```

### 配置

部署后修改两处保持一致：

1. **服务端** `server/ecosystem.config.cjs` —— `PORT` / `AUTH_TOKEN` / `BASE_URL`
2. **扩展端** `extension/config.js` —— `BASE_URL` / `AUTH_TOKEN`（必须与服务端一致）

```js
// extension/config.js
window.QR_CONFIG = {
  BASE_URL: 'https://your-domain.com',
  AUTH_TOKEN: 'your-secret-token'
};
```

详见 [`AGENTS.md`](AGENTS.md)。

---

## 🚀 使用指南

### 文本转短链二维码

1. 点工具栏图标 → 切到「📝 文本」Tab
2. 粘贴任意文本（支持多行，Shift+Enter 换行）
3. **回车** 或点「🔲 生成二维码」
4. 用手机扫码 → 打开页面 → 右上角「📋 复制」→ 全文已复制

### 链接转二维码

1. 点工具栏图标 → 「🔗 链接」Tab
2. 默认显示当前页 URL 的二维码
3. 在输入框修改内容 → 回车刷新

### 解析二维码

- **图片**：右键网页图片 → "解析图片中的二维码"
- **Canvas**：右键 Canvas 元素 → "解析 Canvas 中的二维码"
- 结果浮层支持复制内容 / 打开链接 / 生成二维码

---

## 🛠️ 技术栈

**扩展（`extension/`）**
- Manifest V3 + Service Worker
- OffscreenCanvas + jsQR（二维码解码）
- qrcode-generator（二维码生成）

**服务端（`server/`）**
- Go 标准库（`net/http` + `encoding/json` + `crypto/rand`）—— 零第三方依赖
- JSON 文件存储 + 原子写入
- pm2 进程守护
- ~5MB 静态二进制，~4MB 内存占用

---

## 📁 项目结构

```
qrcode-extension/
├── extension/                  # Chrome 扩展（MV3）
│   ├── manifest.json
│   ├── background.js           # Service Worker（菜单、解码、生成）
│   ├── content.js              # Content Script（捕获图片/Canvas）
│   ├── config.js               # 远程服务配置（BASE_URL + AUTH_TOKEN）
│   ├── result.html             # 结果浮层 fallback 页
│   ├── popup/                  # 工具栏弹窗（Tab: 链接 / 文本）
│   ├── lib/                    # jsQR.js + qrcode.min.js
│   └── icons/
│
├── server/                     # Go 远程短链服务
│   ├── main.go                 # 单文件 HTTP 服务
│   ├── deploy.sh               # 一键编译+部署
│   ├── ecosystem.config.cjs    # pm2 配置
│   └── .env.example
│
├── .github/workflows/package.yml   # CI/CD（自动打包 extension/）
├── AGENTS.md                    # AI Agent 指南
├── CHANGELOG.md
└── LICENSE
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## 📄 开源协议

[MIT License](LICENSE)

## 🙏 致谢

- [jsQR](https://github.com/cozmo/jsQR) — 纯 JavaScript 二维码解码库
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — 二维码生成库
