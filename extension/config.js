// QR Code Tool - 默认配置（开箱即用）
// 用户可在扩展设置页（点 popup 右上角 ⚙️）覆盖这些值，配置存 chrome.storage.sync 会跨设备同步
// 同时挂到 window 和 self：popup/options 页面用 window，Service Worker 用 self
(function () {
  var config = {
    // 短链服务的根地址（不要带末尾斜杠）
    BASE_URL: 'https://qrcode.shanbox.19930810.xyz:8443',
    // 鉴权 token，必须与服务端 AUTH_TOKEN 一致
    AUTH_TOKEN: 'qrcode-extension-token-2024'
  };
  if (typeof window !== 'undefined') window.QR_CONFIG = config;
  if (typeof self !== 'undefined') self.QR_CONFIG = config;
})();
