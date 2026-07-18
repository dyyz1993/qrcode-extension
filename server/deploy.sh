#!/usr/bin/env bash
# 一键部署 qrcode-server 到 shanbox
# 用法：
#   ./deploy.sh              # 编译 + 部署 + 重启
#   ./deploy.sh build        # 只本地编译
#   ./deploy.sh deploy       # 只部署已编译的二进制（跳过编译）
set -euo pipefail

# ===== 配置 =====
SSH_HOST="${SHANBOX_HOST:-shanbox}"
REMOTE_DIR="${REMOTE_DIR:-/root/qrcode-server}"
LOCAL_BIN="$(cd "$(dirname "$0")" && pwd)/qrcode-server"

# ===== 函数 =====
build() {
  echo "🔨 交叉编译 linux/amd64..."
  cd "$(dirname "$0")"
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o qrcode-server .
  echo "✅ 编译完成: $(du -h qrcode-server | cut -f1) -> $LOCAL_BIN"
}

deploy() {
  if [ ! -f "$LOCAL_BIN" ]; then
    echo "❌ 二进制不存在，先执行 build"
    exit 1
  fi
  echo "📤 上传到 $SSH_HOST:$REMOTE_DIR ..."
  ssh "$SSH_HOST" "mkdir -p $REMOTE_DIR/data $REMOTE_DIR/logs"
  scp "$LOCAL_BIN" "$SSH_HOST:$REMOTE_DIR/qrcode-server.new"
  # 原子替换 + 重启
  ssh "$SSH_HOST" "
    cd $REMOTE_DIR && \
    [ -f ecosystem.config.cjs ] && echo 'config exists' || echo 'config missing (first deploy)'
    mv -f qrcode-server.new qrcode-server && \
    chmod +x qrcode-server
  "
  echo "🔄 重启 pm2..."
  ssh "$SSH_HOST" "cd $REMOTE_DIR && (pm2 reload ecosystem.config.cjs 2>/dev/null || pm2 start ecosystem.config.cjs) && pm2 save"
  echo ""
  echo "✅ 部署完成"
  echo "   远程目录: $REMOTE_DIR"
  echo "   下一步: 注册路由（首次）: ssh $SSH_HOST '/root/scripts/manage-route.sh add qrcode 3031 public'"
}

# ===== 主流程 =====
case "${1:-all}" in
  build)  build ;;
  deploy) deploy ;;
  all)    build; deploy ;;
  *) echo "用法: $0 [build|deploy|all]"; exit 1 ;;
esac
