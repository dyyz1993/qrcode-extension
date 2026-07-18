// QR Code Tool - Content Script
// 监听图片和 Canvas 上的右键，把像素数据传给 background 解码

let capturedElement = null;

document.addEventListener('contextmenu', (e) => {
  const target = e.target;
  
  // 保存被右键的元素（img 或 canvas）
  if (target.tagName === 'CANVAS' || target.tagName === 'IMG') {
    capturedElement = target;
  }
});

// background 来拉取数据
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureImageData') {
    if (!capturedElement) {
      sendResponse({ error: '未检测到右键的图片或 Canvas，请先在上面右键' });
      return;
    }

    try {
      const el = capturedElement;
      let dataUrl;

      if (el.tagName === 'CANVAS') {
        dataUrl = el.toDataURL('image/png');
      } else if (el.tagName === 'IMG') {
        // 把 <img> 画到 Canvas 上再导出（避免 CORS 问题）
        const canvas = document.createElement('canvas');
        canvas.width = el.naturalWidth || el.width;
        canvas.height = el.naturalHeight || el.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(el, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      } else {
        sendResponse({ error: '不支持的元素类型' });
        return;
      }

      sendResponse({
        dataUrl: dataUrl,
        width: el.naturalWidth || el.width || el.offsetWidth,
        height: el.naturalHeight || el.height || el.offsetHeight
      });
    } catch (err) {
      sendResponse({ error: '读取失败: ' + err.message });
    }
  }
});
