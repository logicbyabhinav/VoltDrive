const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { execSync } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Volume label detection ────────────────────────────────────────
// Reads the real OS-level label of the drive where penserve2 lives.
// Works on Windows, macOS, and Linux.
function getVolumeLabel() {
  try {
    const platform = process.platform;

    if (platform === 'win32') {
      // __dirname starts with drive letter e.g. E:\penserve2
      const driveLetter = __dirname.slice(0, 2); // e.g. "E:"
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}'" get VolumeName /format:value`,
        { encoding: 'utf8', timeout: 3000 }
      );
      // Output is like:  VolumeName=SanDisk\r\n\r\n
      const match = out.match(/VolumeName=(.+)/);
      const label = match ? match[1].trim() : '';
      return label || null; // null → fallback to path-based name
    }

    if (platform === 'darwin') {
      // macOS: diskutil gives us the volume name
      const mountpoint = getMountPoint();
      const out = execSync(
        `diskutil info "${mountpoint}" 2>/dev/null | grep "Volume Name"`,
        { encoding: 'utf8', timeout: 3000 }
      );
      // Output:    Volume Name:              MY_DRIVE
      const match = out.match(/Volume Name:\s+(.+)/);
      const label = match ? match[1].trim() : '';
      return label || null;
    }

    if (platform === 'linux') {
      // lsblk lists LABEL and MOUNTPOINT columns
      const out = execSync(
        `lsblk -o LABEL,MOUNTPOINT -J 2>/dev/null`,
        { encoding: 'utf8', timeout: 3000 }
      );
      const mount = getMountPoint();
      const parsed = JSON.parse(out);
      // Walk blockdevices looking for our mountpoint
      let found = null;
      const walk = (devs) => {
        for (const d of devs || []) {
          if (d.mountpoint === mount && d.label) { found = d.label; return; }
          if (d.children) walk(d.children);
        }
      };
      walk(parsed.blockdevices);
      return found; // null if no label
    }
  } catch { /* silent — fall through to default */ }
  return null;
}

// Get the filesystem mountpoint that contains __dirname
function getMountPoint() {
  try {
    if (process.platform === 'win32') return __dirname.slice(0, 3); // e.g. E:\
    // Unix: df gives us the mountpoint
    const out = execSync(`df -P "${__dirname}" 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
    const lines = out.trim().split('\n');
    // Last column of second line is the mountpoint
    return lines[1].trim().split(/\s+/).pop();
  } catch {
    return '/';
  }
}

// Get the real total capacity of the drive that contains __dirname
function getDriveCapacity() {
  try {
    if (process.platform === 'win32') {
      const driveLetter = __dirname.slice(0, 2);
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}'" get Size /format:value`,
        { encoding: 'utf8', timeout: 3000 }
      );
      const match = out.match(/Size=(\d+)/);
      if (match) return parseInt(match[1], 10);
    } else {
      // macOS + Linux: df -k gives 1K-block totals
      const out = execSync(`df -k "${__dirname}" 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
      const lines = out.trim().split('\n');
      const cols  = lines[1].trim().split(/\s+/);
      // Filesystem  1K-blocks  Used  Available  Use%  Mounted
      const totalKB = parseInt(cols[1], 10);
      if (!isNaN(totalKB)) return totalKB * 1024;
    }
  } catch {}
  return 0; // 0 = unknown
}

// Derive a friendly fallback name from the mount path or drive letter
function fallbackName() {
  try {
    if (process.platform === 'win32') {
      return __dirname.slice(0, 2); // "E:"
    }
    const mount = getMountPoint();
    // e.g. /media/user/SanDisk  →  "SanDisk"
    // e.g. /Volumes/MY_DRIVE    →  "MY_DRIVE"
    // e.g. /mnt/usb             →  "usb"
    const parts = mount.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'VoltDrive';
  } catch {
    return 'VoltDrive';
  }
}

// Cache it at startup (label won't change while server is running)
const VOLUME_LABEL = getVolumeLabel() || fallbackName();

// ── Directory layout ──────────────────────────────────────────────
const FILES_DIR = path.join(__dirname, 'files');   // user files (root)
const TRASH_DIR = path.join(__dirname, 'trash');   // recycle-bin
const LOGS_DIR  = path.join(__dirname, 'logs');    // activity log

[FILES_DIR, TRASH_DIR, LOGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const LOG_FILE = path.join(LOGS_DIR, 'activity.json');

// ── Activity log helpers ─────────────────────────────────────────
function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return []; }
}
function writeLog(entries) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}
function appendLog(entry) {
  const entries = readLog();
  entries.unshift({ ...entry, id: Date.now() + Math.random().toString(36).slice(2) });
  writeLog(entries.slice(0, 500)); // keep last 500 entries
}

// ── Multer ────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = req.query.folder || '';
    const dest = safePath(subfolder, FILES_DIR);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Path helpers ──────────────────────────────────────────────────
function safePath(rel, base) {
  const b = base || FILES_DIR;
  const full = path.resolve(b, rel || '');
  if (!full.startsWith(b)) throw new Error('Access denied');
  return full;
}

function fmtSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDirSize(dir) {
  let total = 0;
  const walk = d => {
    try {
      fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else total += fs.statSync(p).size;
      });
    } catch {}
  };
  walk(dir);
  return total;
}

function countFiles(dir) {
  let count = 0;
  const walk = d => {
    try {
      fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else count++;
      });
    } catch {}
  };
  walk(dir);
  return count;
}

function getTrashSize() { return getDirSize(TRASH_DIR); }

// ─────────────────────────────────────────────────────────────────
// API: List files in FILES_DIR only (root — not trash, not logs)
// ─────────────────────────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  try {
    const rel = req.query.path || '';
    const dir = safePath(rel, FILES_DIR);
    if (!fs.existsSync(dir)) return res.json({ items: [], path: rel });

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries.map(e => {
      const full = path.join(dir, e.name);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        type: e.isDirectory() ? 'folder' : 'file',
        size: e.isDirectory() ? null : fmtSize(stat.size),
        sizeBytes: e.isDirectory() ? getDirSize(full) : stat.size,
        modified: stat.mtime.toISOString(),
        path: path.join(rel, e.name).replace(/\\/g, '/'),
      };
    });
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const totalUsedBytes = getDirSize(FILES_DIR);
    res.json({
      items, path: rel,
      totalUsedBytes,
      totalUsed: fmtSize(totalUsedBytes),
      fileCount: countFiles(FILES_DIR),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// API: Upload files (into files/ root only)
// ─────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.array('files'), (req, res) => {
  const uploaded = req.files.map(f => ({ name: f.originalname, size: fmtSize(f.size) }));
  // Log each uploaded file directly from req.files (raw multer data)
  req.files.forEach(f => {
    appendLog({
      action:    'uploaded',
      name:      f.originalname,
      size:      fmtSize(f.size),
      timestamp: new Date().toISOString(),
    });
  });
  broadcast('change', { action: 'upload', count: req.files.length });
  res.json({ ok: true, uploaded });
});

// ─────────────────────────────────────────────────────────────────
// API: Download a file
// ─────────────────────────────────────────────────────────────────
app.get('/api/download', (req, res) => {
  try {
    const full = safePath(req.query.path, FILES_DIR);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory())
      return res.status(404).json({ error: 'File not found' });
    res.download(full);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Download a folder as zip
// ─────────────────────────────────────────────────────────────────
app.get('/api/download-folder', async (req, res) => {
  try {
    const archiver = require('archiver');
    const full = safePath(req.query.path, FILES_DIR);
    const name = path.basename(full) || 'files';
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);
    archive.directory(full, false);
    archive.finalize();
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Move to trash (soft delete)
// ─────────────────────────────────────────────────────────────────
app.post('/api/trash', (req, res) => {
  try {
    const relPath = req.body.path;
    const full = safePath(relPath, FILES_DIR);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });

    const stat = fs.statSync(full);
    const isDir = stat.isDirectory();
    const name  = path.basename(full);
    const sizeBytes = isDir ? getDirSize(full) : stat.size;

    // Unique trash name (prevent collisions)
    const ts = Date.now();
    const trashName = `${ts}__${name}`;
    const trashDest = path.join(TRASH_DIR, trashName);

    fs.renameSync(full, trashDest);

    const logEntry = {
      action: 'deleted',
      name,
      trashName,
      size: fmtSize(sizeBytes),
      sizeBytes,
      isDir,
      originalPath: relPath,
      timestamp: new Date().toISOString(),
    };
    appendLog(logEntry);
    broadcast('change', { action: 'trash', name });
    res.json({ ok: true, trashName, size: fmtSize(sizeBytes) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: List trash items
// ─────────────────────────────────────────────────────────────────
app.get('/api/trash', (req, res) => {
  try {
    const entries = fs.readdirSync(TRASH_DIR, { withFileTypes: true });
    const items = entries.map(e => {
      const full = path.join(TRASH_DIR, e.name);
      const stat = fs.statSync(full);
      const isDir = e.isDirectory();
      const sizeBytes = isDir ? getDirSize(full) : stat.size;
      // parse original name from trashName (format: timestamp__originalname)
      const parts = e.name.split('__');
      const ts = parts[0];
      const originalName = parts.slice(1).join('__');
      return {
        trashName: e.name,
        name: originalName || e.name,
        type: isDir ? 'folder' : 'file',
        size: fmtSize(sizeBytes),
        sizeBytes,
        deletedAt: ts ? new Date(parseInt(ts)).toISOString() : stat.mtime.toISOString(),
      };
    });
    items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

    const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
    res.json({ items, totalSize: fmtSize(totalBytes), totalBytes, count: items.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Restore from trash
// ─────────────────────────────────────────────────────────────────
app.post('/api/trash/restore', (req, res) => {
  try {
    const { trashName } = req.body;
    const trashFull = path.join(TRASH_DIR, trashName);
    if (!fs.existsSync(trashFull)) return res.status(404).json({ error: 'Not in trash' });

    // parse original name
    const parts = trashName.split('__');
    const originalName = parts.slice(1).join('__') || trashName;

    // Restore to root of FILES_DIR
    let dest = path.join(FILES_DIR, originalName);
    // If name conflicts, add suffix
    if (fs.existsSync(dest)) {
      const ext  = path.extname(originalName);
      const base = path.basename(originalName, ext);
      dest = path.join(FILES_DIR, `${base}_restored_${Date.now()}${ext}`);
    }
    fs.renameSync(trashFull, dest);

    const stat = fs.statSync(dest);
    const isDir = stat.isDirectory();
    const sizeBytes = isDir ? getDirSize(dest) : stat.size;

    appendLog({
      action: 'restored',
      name: originalName,
      trashName,
      size: fmtSize(sizeBytes),
      sizeBytes,
      isDir,
      timestamp: new Date().toISOString(),
    });
    broadcast('change', { action: 'restore', name: originalName });
    res.json({ ok: true, restoredAs: path.basename(dest) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Permanently delete from trash
// ─────────────────────────────────────────────────────────────────
app.delete('/api/trash', (req, res) => {
  try {
    const { trashName } = req.body;
    if (trashName === '__all__') {
      // empty entire trash
      fs.readdirSync(TRASH_DIR).forEach(f => {
        const p = path.join(TRASH_DIR, f);
        if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      });
    } else {
      const full = path.join(TRASH_DIR, trashName);
      if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
      const stat = fs.statSync(full);
      if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
      else fs.unlinkSync(full);
    }
    broadcast('change', { action: 'delete' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Create folder (in files/ only)
// ─────────────────────────────────────────────────────────────────
app.post('/api/folder', (req, res) => {
  try {
    const full = safePath(req.body.path, FILES_DIR);
    fs.mkdirSync(full, { recursive: true });
    broadcast('change', { action: 'mkdir' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Rename (files/ only)
// ─────────────────────────────────────────────────────────────────
app.patch('/api/files', (req, res) => {
  try {
    const from = safePath(req.body.from, FILES_DIR);
    const to   = safePath(req.body.to,   FILES_DIR);
    fs.renameSync(from, to);
    broadcast('change', { action: 'rename' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: File preview — serves raw file for browser rendering
// Only serves files from FILES_DIR; trash and logs are blocked.
// ?raw=1 forces Content-Type: text/plain (safe for code/HTML files)
// ─────────────────────────────────────────────────────────────────
const MIME_MAP = {
  // images
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
  webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp', heic:'image/heif',
  // video
  mp4:'video/mp4', mov:'video/quicktime', avi:'video/x-msvideo',
  mkv:'video/x-matroska', webm:'video/webm',
  // audio
  mp3:'audio/mpeg', wav:'audio/wav', flac:'audio/flac',
  aac:'audio/aac', ogg:'audio/ogg',
  // documents
  pdf:'application/pdf',
  // text / code — always served as text/plain for security
  txt:'text/plain', md:'text/plain', csv:'text/plain',
  js:'text/plain', ts:'text/plain', py:'text/plain', html:'text/plain',
  css:'text/plain', json:'text/plain', xml:'text/plain', sh:'text/plain',
  yaml:'text/plain', yml:'text/plain', toml:'text/plain', ini:'text/plain',
  php:'text/plain', rb:'text/plain', go:'text/plain', rs:'text/plain',
  c:'text/plain', cpp:'text/plain', h:'text/plain', java:'text/plain',
  sql:'text/plain', r:'text/plain', swift:'text/plain', kt:'text/plain',
};
const TEXT_PREVIEW_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB for text/code files

app.get('/api/preview', (req, res) => {
  try {
    const rel  = req.query.path;
    const raw  = req.query.raw === '1';
    if (!rel) return res.status(400).json({ error: 'path required' });

    const full = safePath(rel, FILES_DIR);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot preview a folder' });

    const ext  = path.extname(full).slice(1).toLowerCase();
    let mime   = MIME_MAP[ext] || 'application/octet-stream';

    // Force plain text for code/text when ?raw=1 OR when extension is in text category
    const isTextType = mime === 'text/plain' || raw;
    if (isTextType) {
      // Size guard for text files
      if (stat.size > TEXT_PREVIEW_SIZE_LIMIT) {
        return res.status(413).json({ error: 'File too large to preview (limit: 5 MB)', size: stat.size });
      }
      mime = 'text/plain; charset=utf-8';
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    // Inline disposition so browser renders it, not downloads it
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(full)}"`);
    // Cache for 60s in browser
    res.setHeader('Cache-Control', 'private, max-age=60');

    fs.createReadStream(full).pipe(res);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────
// API: Activity log (notifications)
// ─────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.json({ entries: readLog() });
});

app.delete('/api/logs', (req, res) => {
  writeLog([]);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// API: Disk/server info
// ─────────────────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  Object.values(ifaces).forEach(list => {
    list.forEach(i => {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    });
  });

  // Drive stats
  const usedBytes     = getDirSize(FILES_DIR);
  const trashBytes    = getDirSize(TRASH_DIR);
  const fileCount     = countFiles(FILES_DIR);
  const capacityBytes = getDriveCapacity();

  res.json({
    port: PORT,
    ips,
    usedBytes,
    trashBytes,
    usedFormatted: fmtSize(usedBytes),
    fileCount,
    capacityBytes,                         // ← real drive total capacity
    capacityFormatted: capacityBytes > 0 ? fmtSize(capacityBytes) : null,
    volumeLabel: VOLUME_LABEL,
    mountPoint: getMountPoint(),
  });
});

// ─────────────────────────────────────────────────────────────────
// SSE — Server-Sent Events broadcast
// All connected browsers receive instant push when files change.
// ─────────────────────────────────────────────────────────────────
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  res.flushHeaders();

  // Send a heartbeat comment every 25s to keep the connection alive
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Call this after ANY mutation — upload, delete, restore, rename, folder create
function broadcast(eventName, payload) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(data); } catch { sseClients.delete(client); }
  });
}

// ─────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  console.log(`\n🔌 PenServe 2 running!\n`);
  console.log(`   Volume:  "${VOLUME_LABEL}" (${getMountPoint()})`);
  console.log(`   Local:   http://localhost:${PORT}`);
  Object.values(ifaces).forEach(list => {
    list.forEach(i => {
      if (i.family === 'IPv4' && !i.internal)
        console.log(`   LAN:     http://${i.address}:${PORT}`);
    });
  });
  console.log(`\n   Files:  ${FILES_DIR}`);
  console.log(`   Trash:  ${TRASH_DIR}`);
  console.log(`   Logs:   ${LOGS_DIR}\n`);
});