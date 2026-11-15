// serve.ts — minimal static server for local playtesting of game/.
// Node 22 stdlib only. Usage: node serve.ts [port]  (default 8080)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'game');
const port = Number(process.argv[2] || 8080);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glsl': 'text/plain', '.vert': 'text/plain', '.frag': 'text/plain',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = url === '/' ? '/index.html' : url;
  const file = resolve(join(root, '.' + path));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`DUSTLINE: serving game/ at http://localhost:${port}`);
});
