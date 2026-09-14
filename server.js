// Tiny static file server for the Tshovani Primary School site.
// Run: node server.js  (defaults to port 8000; override: node server.js 8080)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8000;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const rel = urlPath.replace(/^\/+/, '').replace(/\//g, path.sep);
    let full = path.normalize(path.join(ROOT, rel));
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let stat = fs.existsSync(full) ? fs.statSync(full) : null;
    if (stat && stat.isDirectory()) {
      full = path.join(full, 'index.html');
      stat = fs.existsSync(full) ? fs.statSync(full) : null;
    }
    if (!stat) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<h1>404 Not Found</h1><p><a href="/">Back to the Tshovani home page</a></p>');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tshovani Primary School site: http://localhost:${PORT}/index.html`);
});
