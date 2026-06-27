# AGENTS.md — AI Agent Guide

This file helps AI coding agents understand this project.

## Project Overview

QR Code Tool is a Chrome Extension (Manifest V3) for generating and decoding QR codes directly in the browser.

## Key Architecture

- **background.js** — Service Worker: creates context menus, handles image decoding (fetch → OffscreenCanvas → jsQR), handles canvas decoding (content script message → jsQR), generates QR codes (qrcode → createImgTag → data URL)
- **content.js** — Content Script: runs on all pages, listens for right-click on `<img>` and `<canvas>` elements, stores reference for background to pull data via `chrome.runtime.onMessage`
- **popup/** — Action popup: shows current tab URL + QR code on click, supports custom input with Enter to refresh
- **lib/jsQR.js** — Pure JS QR decoder (257KB, UMD module)
- **lib/qrcode.min.js** — QR code generator by Kazuhiko Arase (21KB)

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

## File Structure

```
background.js       — Service Worker
content.js          — Content Script
manifest.json       — Extension config
popup/              — Action popup (html, js, css)
lib/                — Third-party libraries
icons/              — Extension icons
result.html         — Fallback result page
CHANGELOG.md        — Version history
README.md           — User documentation
LICENSE             — MIT license
.github/workflows/  — CI/CD
```

## Build / Package

GitHub Actions workflow (`.github/workflows/package.yml`) auto-packages on tag push:
1. Check out code
2. Zip the extension directory
3. Upload as release asset

Manual local packaging:
```bash
cd qrcode-extension && zip -r ../qrcode-extension-v1.0.0.zip . -x ".git/*" ".github/*" "*.md" "*.gitignore"
```
