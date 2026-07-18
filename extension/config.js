// QR Code Tool - 远程短链服务配置
// 部署后请确保 BASE_URL 和 AUTH_TOKEN 与服务端 .env 一致
window.QR_CONFIG = {
  // 短链服务的根地址（不要带末尾斜杠）
  // 注意: shanbox 网关的 HTTPS 在 8443 端口，必须带上
  BASE_URL: 'https://qrcode.shanbox.19930810.xyz:8443',
  // 鉴权 token，必须与服务端 AUTH_TOKEN 一致
  AUTH_TOKEN: 'qrcode-extension-token-2024'
};
