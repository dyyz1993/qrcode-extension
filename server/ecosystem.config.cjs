// pm2 配置 —— 守护 Go 二进制 qrcode-server
// 部署到 /root/qrcode-server/ 后执行：
//   pm2 start ecosystem.config.cjs
//   pm2 save
module.exports = {
  apps: [{
    name: 'qrcode-server',
    script: './qrcode-server',          // Go 编译出的二进制
    cwd: '/root/qrcode-server',
    env: {
      PORT: '3031',
      AUTH_TOKEN: process.env.AUTH_TOKEN || 'qrcode-extension-token-2024',
      BASE_URL: 'https://qrcode.shanbox.19930810.xyz:8443',
      DATA_DIR: '/root/qrcode-server/data'
    },
    // 进程守护
    autorestart: true,
    max_restarts: 10,
    restart_delay: 2000,
    // 日志
    out_file: '/root/qrcode-server/logs/out.log',
    error_file: '/root/qrcode-server/logs/err.log',
    merge_logs: true,
    time: true
  }]
};
