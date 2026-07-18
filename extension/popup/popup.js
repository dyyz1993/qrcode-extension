// QR Code Tool - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url-input');
  const qrImg = document.getElementById('qr-img');
  const qrLoading = document.getElementById('qr-loading');

  // 图片 Tab 的 DOM 引用（提前声明，便于在多处使用）
  const imgFileInput = document.getElementById('img-file-input');
  const imgPreviewArea = document.getElementById('img-preview-area');
  const imgPreviewPlaceholder = document.getElementById('img-preview-placeholder');
  const imgPreview = document.getElementById('img-preview');
  const imgGenerateBtn = document.getElementById('img-generate-btn');
  const imgStatus = document.getElementById('img-status');
  const imgQrImg = document.getElementById('img-qr-img');
  const imgQrLoading = document.getElementById('img-qr-loading');
  const imgShortLinkRow = document.getElementById('img-short-link-row');
  const imgShortUrlEl = document.getElementById('img-short-url');
  const imgCopyLinkBtn = document.getElementById('img-copy-link-btn');

  let currentUrl = '';
  let pendingImageUrl = null;  // 检测到地址栏是图片时存 URL，等用户点上传

  // ====== 配置（storage 优先，fallback 到 config.js 默认值）======
  const DEFAULTS = window.QR_CONFIG || { BASE_URL: '', AUTH_TOKEN: '' };
  let BASE_URL = '';
  let AUTH_TOKEN = '';

  // 异步加载配置后再初始化文本 Tab 的异步逻辑
  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['baseUrl', 'authToken'], (result) => {
        BASE_URL = (result.baseUrl !== undefined ? result.baseUrl : DEFAULTS.BASE_URL).replace(/\/+$/, '');
        AUTH_TOKEN = result.authToken !== undefined ? result.authToken : DEFAULTS.AUTH_TOKEN;
        resolve();
      });
    });
  }

  // 齿轮按钮打开设置页
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ====== 生成二维码（复用，输出到指定 img/loading 元素）======
  function generateQR(content, imgEl, loadingEl) {
    if (!content || content.trim() === '') return false;

    if (loadingEl) {
      loadingEl.style.display = 'flex';
      loadingEl.textContent = '生成二维码中...';
    }
    imgEl.style.display = 'none';

    let ok = false;
    setTimeout(() => {
      try {
        const typeNumber = 0;
        const errorCorrectionLevel = 'M';
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        qr.addData(content.trim());
        qr.make();

        const imgTag = qr.createImgTag(8, 4);
        const match = imgTag.match(/src="([^"]+)"/);
        if (match) {
          imgEl.src = match[1];
          imgEl.style.display = 'block';
          ok = true;
        }
      } catch (e) {
        if (loadingEl) loadingEl.textContent = '生成失败: ' + e.message;
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }, 10);
    return ok;
  }

  // ====== Tab 切换 ======
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + target));
    });
  });

  // ====== Tab 1: 链接（原逻辑） ======
  // 检测当前 tab URL 是不是图片 URL
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif'];
  const IMAGE_HINT_RE = /(\b|[%?=&])(image|photo|pic|img|avatar|thumbnail|thumb|cover|preview)(\b|[%?=&_])/i;

  // 通过 URL 后缀快速判断（不发请求）
  function isImageUrlByExt(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      // 去掉 query/hash 后看后缀
      return IMAGE_EXTS.some(ext => path.endsWith(ext));
    } catch { return false; }
  }

  // 通过 HEAD 请求确认 Content-Type 是否为图片
  async function isImageUrlByHead(url) {
    try {
      const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (!resp.ok) return false;
      const ct = resp.headers.get('Content-Type') || '';
      return ct.toLowerCase().startsWith('image/');
    } catch { return false; }
  }

  // 把检测到的图片 URL 塞进图片 Tab，等用户点按钮上传
  function offerImageFromUrl(url) {
    document.querySelector('.tab[data-tab="image"]').click();
    // 显示提示，但不自动上传（让用户主动确认）
    setImgStatus('🔎 检测到当前页是图片，点下方按钮上传', 'loading');
    imgGenerateBtn.disabled = false;

    // 构造一个"待上传"状态：用一个标志变量告诉 generateBtn，下次点击时 fetch 这个 URL
    pendingImageUrl = url;

    // 预览：直接用 URL 当 img src 显示（可能因为防盗链失败，给 onerror 兜底）
    imgPreview.onerror = () => {
      imgPreview.style.display = 'none';
      imgPreviewPlaceholder.style.display = 'block';
      imgPreviewPlaceholder.innerHTML = '📁 图片预览不可用<br><span style="font-size:11px;color:#bbb;">（可能被防盗链拦截，但 SW 仍可尝试上传）</span>';
    };
    imgPreview.src = url;
    imgPreview.style.display = 'block';
    imgPreviewPlaceholder.style.display = 'none';
  }

  // 获取当前标签页 URL 并生成二维码
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || !tabs.length) {
      urlInput.placeholder = '无法获取标签页信息';
      qrLoading.textContent = '无法获取标签页信息';
      return;
    }
    currentUrl = tabs[0].url || '';
    urlInput.value = currentUrl;
    if (!currentUrl) {
      qrLoading.textContent = '无法获取当前页面 URL';
      return;
    }

    // 默认先在链接 Tab 生成 URL 二维码（保持原行为）
    generateQR(currentUrl, qrImg, qrLoading);

    // 检测是不是图片 URL
    try {
      let detected = false;
      if (isImageUrlByExt(currentUrl)) {
        detected = true;
      } else if (IMAGE_HINT_RE.test(currentUrl)) {
        // URL 看起来像图片但后缀不明，HEAD 验证（SW fetch 绕 CORS）
        detected = await isImageUrlByHead(currentUrl);
      }

      if (detected) {
        offerImageFromUrl(currentUrl);
      }
    } catch (e) {
      // 检测失败不影响默认行为
      console.log('image URL detection failed:', e);
    }
  });

  // 回车刷新二维码
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = urlInput.value.trim();
      if (text) generateQR(text, qrImg, qrLoading);
    }
  });

  // ====== Tab 2: 文本转短链 ======
  const textInput = document.getElementById('text-input');
  const textStatus = document.getElementById('text-status');
  const textQrImg = document.getElementById('text-qr-img');
  const textQrLoading = document.getElementById('text-qr-loading');
  const shortLinkRow = document.getElementById('short-link-row');
  const shortUrlEl = document.getElementById('short-url');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const generateBtn = document.getElementById('generate-btn');

  // 加载配置（启动时异步读一次；用户在设置页改完后下次打开 popup 会读到新值）
  loadConfig();

  function setStatus(text, type) {
    textStatus.textContent = text;
    textStatus.className = 'status-row' + (type ? ' ' + type : '');
  }

  async function shortenAndGenerate(text) {
    if (!text || !text.trim()) {
      setStatus('请输入文本', 'error');
      return;
    }
    // 上传前重新读一次配置（用户可能在设置页改过）
    await loadConfig();
    if (!BASE_URL) {
      setStatus('⚠️ 请点右上角 ⚙️ 配置服务器地址', 'error');
      return;
    }

    // 请求期间禁用按钮
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ 生成中...';
    setStatus('正在生成短链...', 'loading');
    textQrLoading.style.display = 'flex';
    textQrImg.style.display = 'none';
    shortLinkRow.style.display = 'none';

    try {
      const resp = await fetch(BASE_URL + '/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': AUTH_TOKEN
        },
        body: JSON.stringify({ content: text })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'HTTP ' + resp.status);
      }

      const data = await resp.json();
      const shortURL = data.url || (BASE_URL + '/s/' + data.code);

      setStatus('✅ 已生成，扫码即可复制', 'success');
      textQrLoading.style.display = 'none';
      generateQR(shortURL, textQrImg, textQrLoading);

      // 显示短链
      shortUrlEl.textContent = shortURL;
      shortUrlEl.href = shortURL;
      shortLinkRow.style.display = 'flex';
    } catch (err) {
      textQrLoading.style.display = 'none';
      // 失败降级：服务端不通时，直接把原始文本编进二维码（虽长但能用）
      setStatus('⚠️ 服务端不可用，降级为本地编码：' + err.message, 'error');
      generateQR(text, textQrImg, textQrLoading);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '🔲 生成二维码';
    }
  }

  // 按钮点击
  generateBtn.addEventListener('click', () => {
    shortenAndGenerate(textInput.value);
  });

  // Enter 触发生成；Shift+Enter 换行（textarea 默认行为）
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      shortenAndGenerate(textInput.value);
    }
  });

  // 复制短链按钮
  copyLinkBtn.addEventListener('click', async () => {
    const url = shortUrlEl.textContent;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const old = copyLinkBtn.textContent;
      copyLinkBtn.textContent = '✅';
      setTimeout(() => { copyLinkBtn.textContent = old; }, 1500);
    } catch (e) {
      // 降级
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copyLinkBtn.textContent = '✅';
      setTimeout(() => { copyLinkBtn.textContent = '📋'; }, 1500);
    }
  });

  // 文本 Tab 粘贴图片：自动切到图片 Tab
  textInput.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) switchToImageTabWithFile(file);
    }
  });

  // ====== Tab 3: 图片上传 ======
  // （DOM 引用已提前到文件顶部，因为 detect 逻辑也要用）

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  let currentImageFile = null;

  function setImgStatus(text, type) {
    imgStatus.textContent = text;
    imgStatus.className = 'status-row' + (type ? ' ' + type : '');
  }

  // 在文本 Tab 粘贴图片时被调用
  function switchToImageTabWithFile(file) {
    document.querySelector('.tab[data-tab="image"]').click();
    setImageFile(file);
  }

  function setImageFile(file) {
    // 校验
    if (!file.type.startsWith('image/')) {
      setImgStatus('⚠️ 只支持图片文件', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImgStatus('⚠️ 图片过大（上限 5MB），当前 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB', 'error');
      return;
    }
    currentImageFile = file;
    pendingImageUrl = null;  // 用户手动选了文件，清掉 URL 上传模式
    // 显示预览
    const reader = new FileReader();
    reader.onload = (e) => {
      imgPreview.src = e.target.result;
      imgPreview.style.display = 'block';
      imgPreviewPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    imgPreview.onerror = null;  // 清掉 URL 模式的错误处理
    imgGenerateBtn.disabled = false;
    const sizeStr = file.size > 1024 * 1024
      ? (file.size / 1024 / 1024).toFixed(1) + 'MB'
      : Math.round(file.size / 1024) + 'KB';
    setImgStatus(`✅ 已选择：${file.name || '粘贴的图片'} (${sizeStr})`, 'success');
    // 清空之前的结果
    imgQrImg.style.display = 'none';
    imgShortLinkRow.style.display = 'none';
  }

  // 点击预览区 → 触发文件选择
  imgPreviewArea.addEventListener('click', () => imgFileInput.click());
  imgFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  });

  // 图片 Tab 也支持 paste
  imgPreviewArea.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) setImageFile(file);
    }
  });

  // 拖拽支持
  imgPreviewArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imgPreviewArea.classList.add('dragover');
  });
  imgPreviewArea.addEventListener('dragleave', () => {
    imgPreviewArea.classList.remove('dragover');
  });
  imgPreviewArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imgPreviewArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setImageFile(e.dataTransfer.files[0]);
    }
  });

  async function uploadImageAndGenerate() {
    // 三种来源优先级：pendingImageUrl（地址栏识别）> currentImageFile（手动选/粘贴）
    if (!currentImageFile && !pendingImageUrl) {
      setImgStatus('请先选择图片', 'error');
      return;
    }
    // 上传前重新读一次配置（用户可能在设置页改过）
    await loadConfig();
    if (!BASE_URL) {
      setImgStatus('⚠️ 请点右上角 ⚙️ 配置服务器地址', 'error');
      return;
    }

    imgGenerateBtn.disabled = true;
    imgGenerateBtn.textContent = '⏳ 上传中...';
    setImgStatus(pendingImageUrl ? '正在抓取并上传图片...' : '正在上传图片...', 'loading');
    imgQrLoading.style.display = 'flex';
    imgQrImg.style.display = 'none';
    imgShortLinkRow.style.display = 'none';

    try {
      // 拿到待上传的 blob（从 URL fetch 或直接用 file）
      let blob;
      let filename = 'image';
      if (pendingImageUrl) {
        setImgStatus('正在抓取图片（绕过防盗链）...', 'loading');
        const imgResp = await fetch(pendingImageUrl);
        if (!imgResp.ok) throw new Error('图片获取失败 HTTP ' + imgResp.status);
        blob = await imgResp.blob();
        if (blob.size > MAX_IMAGE_SIZE) {
          throw new Error('图片过大 ' + (blob.size/1024/1024).toFixed(1) + 'MB（上限 5MB）');
        }
        // 从 URL 推文件名
        try {
          const u = new URL(pendingImageUrl);
          filename = u.pathname.split('/').pop() || 'image';
        } catch {}
      } else {
        blob = currentImageFile;
        filename = currentImageFile.name || 'image';
      }

      const fd = new FormData();
      fd.append('image', blob, filename);
      const resp = await fetch(BASE_URL + '/api/upload', {
        method: 'POST',
        headers: { 'X-Auth-Token': AUTH_TOKEN },
        body: fd
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'HTTP ' + resp.status);
      }

      const data = await resp.json();
      const shortURL = data.url || (BASE_URL + '/s/' + data.code);

      setImgStatus('✅ 已生成，扫码可看图（手机长按可保存）', 'success');
      imgQrLoading.style.display = 'none';
      generateQR(shortURL, imgQrImg, imgQrLoading);

      // 上传成功后清空 pendingImageUrl（下次打开重新检测）
      pendingImageUrl = null;

      imgShortUrlEl.textContent = shortURL;
      imgShortUrlEl.href = shortURL;
      imgShortLinkRow.style.display = 'flex';
    } catch (err) {
      imgQrLoading.style.display = 'none';
      setImgStatus('❌ 上传失败：' + err.message + '（图片功能需要服务端）', 'error');
    } finally {
      imgGenerateBtn.disabled = false;
      imgGenerateBtn.textContent = '🔲 生成二维码';
    }
  }

  imgGenerateBtn.addEventListener('click', uploadImageAndGenerate);

  // 图片 Tab 复制短链
  imgCopyLinkBtn.addEventListener('click', async () => {
    const url = imgShortUrlEl.textContent;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      imgCopyLinkBtn.textContent = '✅';
      setTimeout(() => { imgCopyLinkBtn.textContent = '📋'; }, 1500);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      imgCopyLinkBtn.textContent = '✅';
      setTimeout(() => { imgCopyLinkBtn.textContent = '📋'; }, 1500);
    }
  });
});
