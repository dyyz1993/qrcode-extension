# QR Code Tool - Chrome Extension

[![GitHub release](https://img.shields.io/github/v/release/dyyz1993/qrcode-extension)](https://github.com/dyyz1993/qrcode-extension/releases)
[![Build & Package](https://github.com/dyyz1993/qrcode-extension/actions/workflows/package.yml/badge.svg)](https://github.com/dyyz1993/qrcode-extension/actions/workflows/package.yml)

一款轻量高效的 Chrome 扩展，支持**二维码生成**与**二维码解析**，所有操作均在浏览器内完成，无需依赖外部服务。

---

## ✨ 功能特性

### 🔲 一键生成二维码
- 点击工具栏图标 → 弹窗显示当前页 URL 的二维码
- 直接在输入框修改内容 → **回车即可刷新**二维码
- 支持任意文本 / URL 生成

### 🖼️ 解析图片中的二维码
- 右键网页中的 `<img>` 图片 → **"解析图片中的二维码"**
- 自动从图片中读取并解码二维码内容
- 支持跨域图片（后台 Service Worker 直接 fetch）

### 🟦 解析 Canvas 中的二维码
- 右键 Canvas 元素 → **"解析 Canvas 中的二维码"**
- 直接捕获画布内容进行解码
- 适用于动态生成的二维码

### 🔗 右键快捷生成
| 右键位置 | 功能 |
|---------|------|
| 链接上 | 为该链接生成二维码 |
| 选中的文字 | 为选中文本生成二维码 |
| 页面空白处 | 为当前页面生成二维码 |

---

## 📦 安装方式

### 方法一：从 Release 安装（推荐）

1. 前往 [Releases 页面](https://github.com/dyyz1993/qrcode-extension/releases) 下载最新版本的 `.zip` 包
2. 解压到本地目录
3. 打开 Chrome → `chrome://extensions/`
4. 开启 **开发者模式**（右上角开关）
5. 点击 **加载已解压的扩展程序** → 选择解压后的文件夹

### 方法二：自行打包

```bash
git clone https://github.com/dyyz1993/qrcode-extension.git
cd qrcode-extension
# 直接加载 qrcode-extension 目录即可
```

---

## 🚀 使用指南

### 生成二维码
1. 点击工具栏中的 QR Code Tool 图标
2. 弹窗自动显示当前页面 URL 及对应的二维码
3. 在输入框中修改内容，按 `Enter` 键刷新二维码

### 解析二维码
- **图片**：在网页图片上右键 → "解析图片中的二维码"
- **Canvas**：在 Canvas 元素上右键 → "解析 Canvas 中的二维码"
- 解析结果会以浮层形式显示，支持复制内容 / 打开链接 / 生成二维码

![demo](https://via.placeholder.com/600x400?text=Screenshot+Coming+Soon)

---

## 🛠️ 技术栈

- **Manifest V3** — 最新 Chrome 扩展规范
- **Service Worker** — 后台处理与右键菜单
- **OffscreenCanvas** — Service Worker 中渲染图片
- **jsQR** — 纯 JS 二维码解码库
- **qrcode-generator** — 轻量二维码生成库

---

## 📁 项目结构

```
qrcode-extension/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（菜单、解码、生成）
├── content.js             # Content Script（捕获图片/Canvas 数据）
├── result.html            # 结果展示备用页
├── popup/
│   ├── popup.html         # 弹窗 UI
│   ├── popup.js           # 弹窗逻辑
│   └── popup.css          # 弹窗样式
├── lib/
│   ├── jsQR.js            # 二维码解码库
│   └── qrcode.min.js      # 二维码生成库
├── icons/                 # 扩展图标
├── AGENTS.md              # AI 代理说明
├── CHANGELOG.md           # 变更日志
└── .github/workflows/     # CI/CD 配置
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！详情请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [jsQR](https://github.com/cozmo/jsQR) — 纯 JavaScript 二维码解码库
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — JavaScript 二维码生成库
