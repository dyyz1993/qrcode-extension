# AGENTS.md — AI Agent Guide

This file helps AI coding agents understand this project.

## Project Overview

QR Code Tool is a Chrome Extension (Manifest V3) for generating and decoding QR codes directly in the browser. Bundled with a tiny Go-based short-link server for the "paste text → short URL → QR code" flow.

## Repository Layout

```
qrcode-extension/
├── extension/          # Chrome 扩展（MV3）
│   ├── manifest.json
│   ├── background.js   # Service Worker
│   ├── content.js      # Content Script
│   ├── result.html     # 结果浮层 fallback 页
│   ├── config.js       # 远程服务配置 (BASE_URL + AUTH_TOKEN)
│   ├── popup/          # 工具栏弹窗（Tab: 链接 / 文本）
│   ├── lib/            # jsQR.js + qrcode.min.js
│   └── icons/
├── server/             # Go 远程短链服务
│   ├── main.go         # 单文件 HTTP 服务（零第三方依赖）
│   ├── deploy.sh       # 一键编译+部署+重启
│   ├── ecosystem.config.cjs  # pm2 配置
│   ├── .env.example
│   └── data/           # 运行时数据 (links.json, gitignored)
└── docs/
```

## Key Architecture

### Extension (`extension/`)

- **background.js** — Service Worker: creates context menus, handles image decoding (fetch → OffscreenCanvas → jsQR), handles canvas decoding (content script message → jsQR), generates QR codes (qrcode → createImgTag → data URL)
- **content.js** — Content Script: runs on all pages, listens for right-click on `<img>` and `<canvas>` elements, stores reference for background to pull data via `chrome.runtime.onMessage`
- **popup/** — Action popup with **two tabs**:
  - **链接 Tab**: shows current tab URL + QR code, supports custom input with Enter to refresh (original behavior)
  - **文本 Tab**: paste text → POST to `/api/shorten` → generates QR code encoding the returned short URL (e.g. `https://qrcode.shanbox.19930810.xyz/s/aB3xY9`). Falls back to encoding raw text if server is unreachable.
- **config.js** — Holds `BASE_URL` and `AUTH_TOKEN` for the remote short-link service
- **lib/jsQR.js** — Pure JS QR decoder (257KB, UMD module)
- **lib/qrcode.min.js** — QR code generator by Kazuhiko Arase (21KB)

### Server (`server/`) — Remote Short-Link Service

- **main.go** — Single-file Go HTTP server (zero third-party deps, stdlib only)
- **Endpoints**:
  - `POST /api/shorten` — accepts `{content}`, requires `X-Auth-Token` header, returns `{code, url}`
  - `GET /s/:code` — returns inline HTML page showing the text + a "📋 一键复制" button
  - `GET /api/health` — returns `{ok, count, uptime}`
- **Storage**: single JSON file (`data/links.json`), atomic writes via tmp+rename
- **Expiry**: entries auto-pruned after 7 days (startup sweep + hourly loop + lazy delete on access)
- **Rate limit**: 10 creates per IP per minute (in-memory)
- **Short code**: 6-char base62 via `crypto/rand`, collision retry
- Deployed on `shanbox` as `qrcode.shanbox.19930810.xyz` via `manage-route.sh add qrcode 3031 public`

## Data Flow: Decode Image

1. User right-clicks `<img>` → context menu "解析图片中的二维码" appears (via `contexts: ['image']`)
2. Click → `background.js` `handleDecodeQRImage(info.srcUrl, tab)` fires
3. SW fetches the image URL directly (has `<all_urls>` permission, bypasses CORS)
4. Blob → `createImageBitmap` → `OffscreenCanvas` → `getImageData` → `jsQR.decode()`
5. Result injected into page via `chrome.scripting.executeScript(func: showResultOverlay)`

## Data Flow: Decode Canvas

1. Content script monitors `contextmenu` event on `<canvas>` elements, stores reference
2. User right-clicks `<canvas>` → context menu "解析 Canvas 中的二维码" appears (via `contexts: ['all']`)
3. Click → `background.js` `handleDecodeQRCanvas(tab)` fires
4. SW sends `chrome.tabs.sendMessage(tab.id, {action: 'captureImageData'})` to content script
5. Content script calls `canvas.toDataURL('image/png')` and returns the data URL
6. SW fetches data URL → decodes same as image flow

## Key Features for Agents

- Menu creation is at TOP of background.js (before importScripts), ensuring it always runs
- UTF-8 encoding for QR generation: `qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']`
- Image decoding uses SW fetch (not content script) to avoid CORS tainted canvas issues
- Canvas decoding uses content script (canvas can't be fetched externally)
- Popup uses qrcode-generator library via `createImgTag` GIF data URL

## Build / Package

GitHub Actions workflow (`.github/workflows/package.yml`) auto-packages on tag push:
1. Check out code
2. Zip **only** `extension/` directory (server code is not part of the extension package)
3. Upload as release asset

Manual local packaging:
```bash
cd extension && zip -r ../qrcode-extension-v1.0.0.zip .
```

## Deploy Server

```bash
cd server
./deploy.sh              # 编译 + 上传 + 重启
# 首次部署后注册路由（一次性）：
ssh shanbox '/root/scripts/manage-route.sh add qrcode 3031 public'
```
