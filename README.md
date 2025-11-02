# Whispa Browser Extension

> A privacy-first browser extension that lets you whisper your thoughts without leaving a trace.

---

## Overview

Whispa is a lightweight, open-source browser extension designed to give users a secure, ephemeral space for quick notes, passwords, or any text you don’t want lingering in your browser history, clipboard, or cloud services. Everything you type is stored **only in memory** and disappears the moment you close the popup or navigate away.

---

## Features

| Feature                 | Description                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| 🔒 **Zero Persistence** | Nothing is written to disk, localStorage, or synced across devices.                         |
| ⚡ **Instant Access**   | Launch via toolbar icon or customizable keyboard shortcut (`Ctrl+Shift+W` / `Cmd+Shift+W`). |
| 🎨 **Minimal UI**       | Clean, distraction-free interface that matches your browser’s theme (light/dark/auto).      |
| 📋 **One-Click Copy**   | Copy any snippet to the clipboard with a single click; clipboard is cleared after 30 s.     |
| 🧹 **Auto-Cleanup**     | Memory wiped after 5 min of inactivity or when the popup loses focus.                       |

---

## Installation

### Chrome / Edge / Brave

1. Download the latest `whispa-chrome.zip` from [Releases](https://github.com/your-org/whispa/releases).
2. Unpack to any folder.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the folder.

### Firefox

1. Download `whispa-firefox.xpi` from [Releases](https://github.com/your-org/whispa/releases).
2. Drag-and-drop the file into Firefox or open `about:addons` → **Install Add-on From File**.

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm (recommended) or npm

### Clone & Install
