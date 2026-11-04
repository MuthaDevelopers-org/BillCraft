/**
 * Serves the app folder for development: npm run serve
 * http://127.0.0.1:8089 by default. Options: --port 8090, and --lan to accept
 * other devices on your network (for testing on a phone; only on a network you trust).
 * Files are sent with no-cache headers, so a reload always shows the latest code.
 *
 * The browser tests (tests/e2e) start it in-process with createAppServer().
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

/**
 * An HTTP server for the app folder. server.setOffline(true) makes it drop every
 * connection, like a server that is down (used to test offline use).
 */
export function createAppServer({ root = ROOT } = {}) {
  let offline = false;
  const server = http.createServer(async (request, response) => {
    if (offline) {
      request.socket.destroy();
      return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = path.join(root, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
    // Nothing outside the app folder, and no dot-files such as .git
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) {
      response.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(data);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  server.setOffline = (value) => {
    offline = Boolean(value);
  };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port = Number(args[args.indexOf('--port') + 1]) || 8089;
  const host = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
  createAppServer().listen(port, host, () => {
    console.log(`BillCraft: http://127.0.0.1:${port}`);
    if (host === '0.0.0.0') {
      const addresses = Object.values(networkInterfaces()).flat()
        .filter(entry => entry && entry.family === 'IPv4' && !entry.internal)
        .map(entry => `http://${entry.address}:${port}`);
      console.log(`On your network: ${addresses.join(', ')} (offline use needs HTTPS, so it is off here)`);
    }
  });
}
