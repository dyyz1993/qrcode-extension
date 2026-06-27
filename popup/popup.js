// QR Code Tool - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url-input');
  const qrImg = document.getElementById('qr-img');
  const qrLoading = document.getElementById('qr-loading');

  let currentUrl = '';

  // === 生成二维码 ===
  function generateQR(content) {
    if (!content || content.trim() === '') return;

    qrLoading.style.display = 'flex';
    qrLoading.textContent = '生成二维码中...';
    qrImg.style.display = 'none';

    setTimeout(() => {
      try {
        const typeNumber = 0;
        const errorCorrectionLevel = 'M';
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        qr.addData(content.trim());
        qr.make();

        const cellSize = 8;
        const margin = 4;
        const imgTag = qr.createImgTag(cellSize, margin);
        const match = imgTag.match(/src="([^"]+)"/);

        if (match) {
          qrImg.src = match[1];
          qrImg.style.display = 'block';
        }
      } catch (e) {
        qrLoading.textContent = '生成失败: ' + e.message;
      } finally {
        qrLoading.style.display = 'none';
      }
    }, 10);
  }

  // === 获取当前标签页 URL 并生成二维码 ===
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      currentUrl = tabs[0].url || '';
      urlInput.value = currentUrl;
      if (currentUrl) {
        generateQR(currentUrl);
      } else {
        qrLoading.textContent = '无法获取当前页面 URL';
      }
    } else {
      urlInput.placeholder = '无法获取标签页信息';
      qrLoading.textContent = '无法获取标签页信息';
    }
  });

  // === 回车刷新二维码 ===
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = urlInput.value.trim();
      if (text) {
        generateQR(text);
      }
    }
  });
});
