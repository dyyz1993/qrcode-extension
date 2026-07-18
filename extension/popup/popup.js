// QR Code Tool - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url-input');
  const qrImg = document.getElementById('qr-img');
  const qrLoading = document.getElementById('qr-loading');

  let currentUrl = '';

  // ====== 配置 ======
  const CONFIG = window.QR_CONFIG || {};
  const BASE_URL = (CONFIG.BASE_URL || '').replace(/\/+$/, '');
  const AUTH_TOKEN = CONFIG.AUTH_TOKEN || '';

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
  // 获取当前标签页 URL 并生成二维码
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      currentUrl = tabs[0].url || '';
      urlInput.value = currentUrl;
      if (currentUrl) {
        generateQR(currentUrl, qrImg, qrLoading);
      } else {
        qrLoading.textContent = '无法获取当前页面 URL';
      }
    } else {
      urlInput.placeholder = '无法获取标签页信息';
      qrLoading.textContent = '无法获取标签页信息';
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

  function setStatus(text, type) {
    textStatus.textContent = text;
    textStatus.className = 'status-row' + (type ? ' ' + type : '');
  }

  async function shortenAndGenerate(text) {
    if (!text || !text.trim()) {
      setStatus('请输入文本', 'error');
      return;
    }
    if (!BASE_URL) {
      setStatus('配置缺失：config.js 里 BASE_URL 未设置', 'error');
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
});
