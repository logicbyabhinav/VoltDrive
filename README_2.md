# VoltDrive

**A portable, self-hosted web file manager that runs directly from your pendrive or external SSD.**

Plug your drive into any machine, run a single launcher, and get a full file management interface in the browser — no installation, no cloud, no account required. Access it from your phone, your laptop, or any device on the same network.

![VoltDrive Dashboard](screenshots/dashboard.png)

---

## Overview

VoltDrive is a local web server bundled onto your storage device. It serves a browser-based UI for managing everything on that drive — uploading, browsing, previewing, organizing, and downloading files — with real-time sync across every connected device.

It was built for people who carry their work on external drives and want something better than dragging files through a native file explorer.

---

## Screenshots

### Dashboard

| Full drive | Small drive |
|------------|-------------|
| ![Dashboard](screenshots/dashboard.png) | ![Dashboard small drive](screenshots/dashboard-small-drive.png) |

The home screen shows the **Device Vitality** panel: a speedometer-style SVG gauge that reflects actual drive capacity (read directly from the OS), used and free space bars, and a live file count. The gauge arc turns amber when usage crosses 80%.

---

### File Browser

| All Files | Folder Tree |
|-----------|-------------|
| ![All Files](screenshots/all-files.png) | ![Folder Tree](screenshots/folder-tree.png) |

The file table shows icon, name, type, size, and date modified across **seven columns**. Folders expand into a collapsible tree. Files and folders can be renamed inline with a double-click.

---

### File Preview

| Image | Code | Markdown | Code (alternate) |
|-------|------|----------|-----------------|
| ![Preview image](screenshots/preview-image.png) | ![Preview code](screenshots/preview-code.png) | ![Preview markdown](screenshots/preview-markdown.png) | ![Preview code 2](screenshots/preview-code-2.png) |

Files open in a three-zone layout: a header bar with back/close controls, a scrollable content area, and a pinned info bar showing type, size, date, and action buttons. Each file type gets its own renderer.

---

### Trash

![Trash](screenshots/trash.png)

Deleted files move to a recoverable trash. Each item shows its original name, size, and deletion timestamp. Items can be restored to the root or permanently deleted individually. The **Empty Trash** button wipes everything at once.

---

### Activity Log

![Activity Log](screenshots/activity-log.png)

A slide-out panel records every upload, deletion, and restoration with timestamps and file sizes. The log persists to disk across server restarts and can be cleared at any time.

---

### Mobile

| Dashboard | Files | Folder Tree |
|-----------|-------|-------------|
| ![Mobile Dashboard](screenshots/mobile-dashboard.png) | ![Mobile Files](screenshots/mobile-files.png) | ![Mobile Folder Tree](screenshots/mobile-folder-tree.png) |

| Trash | Activity Log | Preview: Image | Preview: Code | Preview: CSV |
|-------|--------------|----------------|---------------|--------------|
| ![Mobile Trash](screenshots/mobile-trash.png) | ![Mobile Activity Log](screenshots/mobile-activity-log.png) | ![Mobile Preview Image](screenshots/mobile-preview-image.png) | ![Mobile Preview Code](screenshots/mobile-preview-code.png) | ![Mobile Preview CSV](screenshots/mobile-preview-csv.png) |

The entire UI is mobile-first. Navigation moves to a bottom tab bar, the file table scrolls horizontally, and the preview system uses `100svh` for accurate viewport height on iOS and Android.

---

## Features

### File Management
- Browse files and folders with a sortable list view
- Seven-column table: icon, favourite star, name, type, size, date modified, actions
- Collapsible folder tree with lazy-loaded children
- Inline rename on double-click (Enter to confirm, Escape to cancel)
- Create new folders
- Favourites (starred files) tracked per session

### Upload
- Drag and drop files onto the upload zone
- Multi-file upload with animated progress bar and transfer banner
- Upload into any subfolder via the folder path parameter
- Animated field-ring overlay during active transfer

### Download
- Download individual files directly from the file table or preview info bar
- Download entire folders as `.zip` archives via `/api/download-folder`

### File Preview
Files open in a tab alongside open folder tabs — no duplicate tabs, switching between them is instant.

| Type | Renderer |
|------|----------|
| Images (jpg, png, gif, webp, svg, bmp) | `<img>` tag, tap/click opens fullscreen lightbox |
| Video (mp4, mov, avi, mkv, webm) | Native `<video>` with controls, no autoplay |
| Audio (mp3, wav, flac, aac, ogg) | Native `<audio>` player with animated CSS waveform |
| PDF | `<iframe>` filling the content area |
| Code / Text / Markdown | Line-numbered `<pre>` block with horizontal scroll |
| JSON | Pretty-printed, same code view |
| CSV | Proper quoted-field parser, scrollable table with sticky header, max 500 rows |
| Archives, executables, Office docs, HEIC | Clean placeholder with prominent Download button |

Files over 5 MB that are text or code show a "too large to preview" message rather than hanging the browser.

### Trash
- Soft-delete moves files to `trash/` — nothing is hard-deleted from the UI
- Trash items preserve original filename and deletion timestamp
- Restore any item back to the root of `files/`
- Conflict resolution on restore: adds `_restored_<timestamp>` suffix if name is taken
- Permanently delete individual items or empty the entire trash
- Badge counter on sidebar and mobile nav shows current item count

### Real-Time Sync
- All connected browsers update the moment any file operation completes
- Powered by **Server-Sent Events** (`/api/events`) — no polling
- Heartbeat every 25 seconds keeps the connection alive through proxies and idle timeouts
- Client reconnects automatically with exponential backoff (2 s → 30 s cap) if the connection drops
- LIVE indicator in the top bar shows connection state

### Storage Gauge
- Speedometer-style SVG gauge replacing the old donut chart
- Reads **real drive capacity** from the OS (`df` on macOS/Linux, `wmic` on Windows)
- Scale and tick marks calculated dynamically using `Math` — adapts from a 256 MB drive to a 4 TB drive
- Arc colour shifts from cyan–purple to amber–orange as usage approaches 80%
- Needle animated with `requestAnimationFrame` easing

### Volume Detection
- Reads the OS-level volume label of the drive at startup (`wmic` / `diskutil` / `lsblk`)
- Displayed in the topbar as the drive name
- Falls back to the mount path basename or drive letter if no label is set

### Activity Log
- Every upload, deletion, and restoration is appended to `logs/activity.json`
- Viewable in a slide-out notification panel (bell icon)
- Capacity warning injected into the log when drive usage exceeds 80%
- Log capped at 500 entries; oldest entries trimmed automatically
- Clear button wipes the log without affecting files

### LAN Access
- Server binds to `0.0.0.0` on startup — all network interfaces
- LAN IP addresses printed in the terminal
- Accessible from any device on the same Wi-Fi without configuration

---

## Requirements

- [Node.js](https://nodejs.org) 16 or later, installed on the host machine
- Any modern browser (Chrome, Firefox, Safari, Edge)
- No internet connection required

---

## Installation

Copy the `penserve2` folder onto your pendrive or external drive. That is all.

`node_modules` is included — no internet or `npm install` needed on the host machine. The launchers will install packages automatically on first run if `node_modules` is somehow missing.

---

## Usage

**Windows** — double-click `start.bat`

The launcher checks for Node.js, runs `npm install` if `node_modules` is absent, creates the `files/`, `trash/`, and `logs/` directories, shows an animated loading bar, then starts the server.

**macOS / Linux**

```bash
chmod +x start.sh
./start.sh
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To access from another device on the same network, use the LAN address printed in the terminal:

```
🔌 PenServe 2 running!

   Volume:  "MY_DRIVE" (/Volumes/MY_DRIVE)
   Local:   http://localhost:3000
   LAN:     http://192.168.1.42:3000
```

**Custom port**

```bash
# macOS / Linux
PORT=8080 node server.js

# Windows
set PORT=8080 && node server.js
```

---

## Project Structure

```
penserve2/
  server.js           Express server — all API routes and file operations
  package.json        Dependencies and metadata
  start.bat           Windows launcher (checks Node, installs deps, loading bar)
  start.sh            macOS and Linux launcher
  .gitignore

  public/
    index.html        Entire frontend — HTML, CSS, and JavaScript in one file

  files/              Your files live here (served by the UI)
  trash/              Soft-deleted files held here until permanently removed
  logs/
    activity.json     Append-only log of all file operations (max 500 entries)

  node_modules/       Bundled dependencies — works fully offline
```

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/files` | List files and folders at a given path inside `files/` |
| `POST` | `/api/upload` | Upload one or more files; `?folder=` targets a subfolder |
| `GET` | `/api/download` | Download a single file by path |
| `GET` | `/api/download-folder` | Download a folder as a `.zip` archive |
| `POST` | `/api/trash` | Move a file or folder to trash (soft delete) |
| `GET` | `/api/trash` | List all items currently in trash |
| `POST` | `/api/trash/restore` | Restore a trashed item to `files/` root |
| `DELETE` | `/api/trash` | Permanently delete one item or empty all trash (`__all__`) |
| `POST` | `/api/folder` | Create a new folder inside `files/` |
| `PATCH` | `/api/files` | Rename a file or folder |
| `GET` | `/api/preview` | Serve a file for inline browser rendering; `?raw=1` forces `text/plain` |
| `GET` | `/api/logs` | Retrieve the activity log (array of entries) |
| `DELETE` | `/api/logs` | Clear the activity log |
| `GET` | `/api/info` | Server port, LAN IPs, drive capacity, used bytes, file count, volume label |
| `GET` | `/api/events` | Server-Sent Events stream for real-time push |

---

## How Real-Time Sync Works

Every browser that has VoltDrive open maintains a persistent connection to `/api/events` via Server-Sent Events. When any file operation completes on the server — upload, delete, restore, rename, or folder creation — the server calls `broadcast()`, which writes an event to every connected client simultaneously.

Each client receives the event, fetches fresh data from the relevant endpoints, and updates the UI — all within a fraction of a second, with no page reload.

If the connection drops, the client reconnects automatically using exponential backoff starting at 2 seconds and capping at 30 seconds. A `: ping` comment is sent from the server every 25 seconds to prevent idle connection teardown by proxies and load balancers.

---

## Security

VoltDrive has no authentication. Anyone on the same network can access files when the server is running. Keep it on trusted networks, or stop the server when not in use.

All paths are validated against their respective base directories (`files/`, `trash/`, `logs/`) using `path.resolve` before any file operation — directory traversal attacks are blocked. Text and code files are always served as `text/plain` regardless of their extension, preventing XSS via HTML or JavaScript file preview.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Server runtime | Node.js (≥ 16) |
| HTTP framework | Express 4 |
| File uploads | Multer |
| Folder downloads | Archiver |
| Real-time push | Server-Sent Events (built-in) |
| Drive info | `df`, `wmic`, `diskutil`, `lsblk` via `child_process` |
| Frontend | Vanilla JS, Tailwind CSS (CDN) |
| Typography | Montserrat, Inter (Google Fonts) |
| Icons | Material Symbols (Google Fonts) |

---

## Planned

- Password authentication per drive
- LAN peer discovery — see all active VoltDrive instances on the same network from one page
- Folder upload support
- File conflict resolution on upload (skip / overwrite / rename)
- Drag-to-move files between folders
- HTTPS / self-signed certificate support

---

## License

MIT