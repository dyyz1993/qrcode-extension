// QR Code Tool - Background Service Worker
// 菜单创建放在最前面

// 创建右键菜单
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'decode-qr-image',
    title: '解析图片中的二维码',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'decode-qr-canvas',
    title: '解析 Canvas 中的二维码',
    contexts: ['all']
  });
  chrome.contextMenus.create({
    id: 'generate-qr-link',
    title: '为此链接生成二维码',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'generate-qr-selection',
    title: '为选中文本生成二维码',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'generate-qr-page',
    title: '为当前页面生成二维码',
    contexts: ['page']
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'decode-qr-image',
      title: '解析图片中的二维码',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'decode-qr-canvas',
      title: '解析 Canvas 中的二维码',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'generate-qr-link',
      title: '为此链接生成二维码',
      contexts: ['link']
    });
    chrome.contextMenus.create({
      id: 'generate-qr-selection',
      title: '为选中文本生成二维码',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'generate-qr-page',
      title: '为当前页面生成二维码',
      contexts: ['page']
    });
  });
});

importScripts('lib/jsQR.js', 'lib/qrcode.min.js');

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'decode-qr-image':
      handleDecodeQRImage(info.srcUrl, tab);
      break;
    case 'decode-qr-canvas':
      handleDecodeQRCanvas(tab);
      break;
    case 'generate-qr-link':
      handleGenerateQR(info.linkUrl, tab);
      break;
    case 'generate-qr-selection':
      handleGenerateQR(info.selectionText, tab);
      break;
    case 'generate-qr-page':
      handleGenerateQR(tab.url, tab);
      break;
  }
});

// 从 ImageData 解码二维码
function decodeQRFromImageData(imageData) {
  let code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert'
  });
  if (code && code.data) return code.data;

  code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  });
  return code ? code.data : null;
}

// 从 Blob/ImageBitmap 提取 ImageData
async function blobToImageData(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// 解码图片中的二维码（通过 SW fetch）
async function handleDecodeQRImage(imageUrl, tab) {
  try {
    if (!imageUrl) {
      showResult(tab, { type: 'error', content: '无法获取图片 URL' });
      return;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      showResult(tab, { type: 'error', content: '图片加载失败 (HTTP ' + response.status + ')' });
      return;
    }

    const blob = await response.blob();
    const imageData = await blobToImageData(blob);
    const result = decodeQRFromImageData(imageData);

    if (result) {
      showResult(tab, { type: 'decode', content: result });
    } else {
      showResult(tab, { type: 'error', content: '未在图片中识别到二维码' });
    }
  } catch (err) {
    showResult(tab, { type: 'error', content: '解码失败: ' + err.message });
  }
}

// 解码 Canvas 中的二维码（通过 content script）
async function handleDecodeQRCanvas(tab) {
  try {
    const results = await chrome.tabs.sendMessage(tab.id, { action: 'captureImageData' });
    if (!results || results.error) {
      showResult(tab, { type: 'error', content: results?.error || '请先在 Canvas 上右键，再点击菜单' });
      return;
    }

    const response = await fetch(results.dataUrl);
    const blob = await response.blob();
    const imageData = await blobToImageData(blob);
    const result = decodeQRFromImageData(imageData);

    if (result) {
      showResult(tab, { type: 'decode', content: result });
    } else {
      showResult(tab, { type: 'error', content: '未在此 Canvas 中识别到二维码' });
    }
  } catch (err) {
    showResult(tab, { type: 'error', content: '解码失败: ' + err.message + (err.message.includes('Could not establish connection') ? '\n请刷新页面后重试' : '') });
  }
}

// 生成二维码
async function handleGenerateQR(content, tab) {
  try {
    if (!content) {
      showResult(tab, { type: 'error', content: '内容为空' });
      return;
    }

    const qr = qrcode(0, 'M');
    qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    qr.addData(content);
    qr.make();

    const imgTag = qr.createImgTag(8, 4);
    const srcMatch = imgTag.match(/src="([^"]+)"/);
    const dataUrl = srcMatch ? srcMatch[1] : '';

    showResult(tab, {
      type: 'generate',
      content: content,
      qrDataUrl: dataUrl
    });
  } catch (err) {
    showResult(tab, { type: 'error', content: '生成失败: ' + err.message });
  }
}

// 显示结果
async function showResult(tab, result) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showResultOverlay,
      args: [result]
    });
  } catch (err) {
    const encoded = encodeURIComponent(JSON.stringify(result));
    chrome.tabs.create({
      url: 'result.html#' + encoded
    });
  }
}

// === 注入到页面的浮层 ===
function showResultOverlay(result) {
  const existing = document.getElementById('qr-tool-root');
  if (existing) existing.remove();

  function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>'); }

  const root = document.createElement('div');
  root.id = 'qr-tool-root';
  root.innerHTML = `<div id="qr-tool-bg" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483646;background:rgba(0,0,0,0.3)"></div>
<div id="qr-tool-dlg" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:24px;min-width:300px;max-width:420px;max-height:80vh;overflow-y:auto;font-family:-apple-system,sans-serif;"></div>`;
  document.body.appendChild(root);

  const dlg = document.getElementById('qr-tool-dlg');
  const bg = document.getElementById('qr-tool-bg');
  const close = () => root.remove();
  bg.addEventListener('click', close);

  let html = '';
  if (result.type === 'decode') {
    const isUrl = /^https?:\/\//i.test(result.content);
    html = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:600;color:#1a1a1a;">✅ 二维码解析结果</span>
      <button id="qtc" style="border:none;background:none;cursor:pointer;font-size:20px;color:#999;">&times;</button></div>
      <div style="word-break:break-all;background:#f5f5f5;padding:12px;border-radius:8px;color:#333;font-size:14px;line-height:1.5;max-height:300px;overflow-y:auto;">${esc(result.content)}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="qtcopy" style="background:#4a90d9;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">📋 复制</button>
        ${isUrl ? '<button id="qtopen" style="background:#34a853;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">🔗 打开</button>' : ''}
        <button id="qtgen" style="background:#fff;color:#666;border:1px solid #ddd;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">🔲 生成二维码</button>
      </div>`;
  } else if (result.type === 'generate') {
    html = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:600;color:#1a1a1a;">🔲 二维码</span>
      <button id="qtc" style="border:none;background:none;cursor:pointer;font-size:20px;color:#999;">&times;</button></div>
      <div style="text-align:center;margin-bottom:12px;"><img src="${result.qrDataUrl}" style="width:220px;height:220px;image-rendering:pixelated;"></div>
      <div style="word-break:break-all;font-size:12px;color:#666;background:#f9f9f9;padding:10px;border-radius:8px;max-height:80px;overflow-y:auto;">${esc(result.content)}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="qtcopy" style="background:#4a90d9;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">📋 复制</button>
        <button id="qtdl" style="background:#fff;color:#666;border:1px solid #ddd;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">💾 保存</button>
      </div>`;
  } else {
    html = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:600;color:#d32f2f;">❌ 错误</span>
      <button id="qtc" style="border:none;background:none;cursor:pointer;font-size:20px;color:#999;">&times;</button></div>
      <div style="color:#d32f2f;font-size:14px;">${esc(result.content)}</div>`;
  }
  dlg.innerHTML = html;
  dlg.querySelector('#qtc').onclick = close;

  const copy = dlg.querySelector('#qtcopy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(result.content); copy.textContent = '✅ 已复制'; setTimeout(()=>copy.textContent='📋 复制',1500); }
    catch(e) { const t=document.createElement('textarea'); t.value=result.content; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); copy.textContent='✅ 已复制'; setTimeout(()=>copy.textContent='📋 复制',1500); }
  };

  const open = dlg.querySelector('#qtopen');
  if (open) open.onclick = () => { window.open(result.content); close(); };

  const gen = dlg.querySelector('#qtgen');
  if (gen) gen.onclick = () => {
    gen.textContent = '🔄 生成中...'; gen.disabled = true;
    chrome.runtime.sendMessage({action:'generateQR',content:result.content}, resp => {
      if (resp && resp.qrDataUrl) { close(); setTimeout(()=>showResultOverlay({type:'generate',content:result.content,qrDataUrl:resp.qrDataUrl}),100); }
    });
  };

  const dl = dlg.querySelector('#qtdl');
  if (dl) dl.onclick = () => { const a=document.createElement('a'); a.href=result.qrDataUrl; a.download='qrcode.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); dl.textContent='✅ 已保存'; setTimeout(()=>dl.textContent='💾 保存',1500); };
}

// 消息监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateQR') {
    try {
      const qr = qrcode(0, 'M');
      qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      qr.addData(request.content);
      qr.make();
      const m = qr.createImgTag(8, 4).match(/src="([^"]+)"/);
      sendResponse({ qrDataUrl: m ? m[1] : '' });
    } catch (e) { sendResponse({ error: e.message }); }
    return true;
  }
});
