import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'dist/client');
const port = Number(process.env.QA_PORT || 4173);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath || '/');
  const candidate = path.resolve(root, '.' + decoded);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    let filePath = safePath(requestUrl.pathname);
    if (!filePath) { response.writeHead(400); response.end('Bad path'); return; }
    try {
      if ((await fs.stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
      await fs.access(filePath);
    } catch {
      filePath = path.join(root, 'index.html');
    }
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end('QA server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static Staff Portal QA server listening on http://127.0.0.1:${port}`);
});
