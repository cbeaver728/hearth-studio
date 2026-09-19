const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const root = path.resolve(__dirname, 'dist');
const port = 4173;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const content = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'Port 4173 is already in use. Close the other Hearth Studio server and try again.'
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `Hearth Studio is ready: ${url}\nKeep this window open while designing. Press Ctrl+C to stop.`,
  );
  if (process.platform === 'win32' && !process.env.HEARTH_NO_OPEN)
    execFile('cmd.exe', ['/c', 'start', '', url]);
});
