// QR Code Tool - 设置页
// 配置存 chrome.storage.sync（跨设备同步），未配置时使用 config.js 的默认值

// 从 config.js 读取默认值
const DEFAULTS = (window.QR_CONFIG) ? { ...window.QR_CONFIG } : { BASE_URL: '', AUTH_TOKEN: '' };

document.addEventListener('DOMContentLoaded', () => {
  const baseUrlInput = document.getElementById('base-url');
  const authTokenInput = document.getElementById('auth-token');
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  const testBtn = document.getElementById('test-btn');
  const statusEl = document.getElementById('status');

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  // 加载当前配置（storage 优先，无则用默认值）
  chrome.storage.sync.get(['baseUrl', 'authToken'], (result) => {
    baseUrlInput.value = result.baseUrl !== undefined ? result.baseUrl : (DEFAULTS.BASE_URL || '');
    authTokenInput.value = result.authToken !== undefined ? result.authToken : (DEFAULTS.AUTH_TOKEN || '');
  });

  // 保存
  saveBtn.addEventListener('click', () => {
    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
    const authToken = authTokenInput.value.trim();

    if (!baseUrl) {
      setStatus('服务器地址不能为空', 'error');
      return;
    }

    try {
      new URL(baseUrl);
    } catch (e) {
      setStatus('服务器地址格式不正确', 'error');
      return;
    }

    chrome.storage.sync.set({ baseUrl, authToken }, () => {
      setStatus('✅ 已保存，立即生效', 'success');
    });
  });

  // 恢复默认
  resetBtn.addEventListener('click', () => {
    chrome.storage.sync.remove(['baseUrl', 'authToken'], () => {
      baseUrlInput.value = DEFAULTS.BASE_URL || '';
      authTokenInput.value = DEFAULTS.AUTH_TOKEN || '';
      setStatus('↩️ 已恢复为默认配置', 'success');
    });
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
    const authToken = authTokenInput.value.trim();

    if (!baseUrl) {
      setStatus('请先填写服务器地址', 'error');
      return;
    }

    setStatus('🧪 正在测试连接...', 'loading');
    try {
      const resp = await fetch(baseUrl + '/api/health', {
        method: 'GET',
        headers: authToken ? { 'X-Auth-Token': authToken } : {}
      });
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
      }
      const data = await resp.json();
      setStatus(`✅ 连接成功（服务端共有 ${data.count} 条记录，已运行 ${data.uptime}s）`, 'success');
    } catch (err) {
      setStatus('❌ 连接失败：' + err.message, 'error');
    }
  });
});
