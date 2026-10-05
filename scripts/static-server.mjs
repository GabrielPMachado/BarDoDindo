// Servidor estático simples (Node puro) para a versão compilada do app ou do CRM.
// Entrega os arquivos de uma pasta "dist" e repassa /api para a API.
// Uso: node scripts/static-server.mjs <pasta-dist> <porta> [api=http://localhost:3333]
import { createServer, request } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const [dir, portArg, apiArg] = process.argv.slice(2);
if (!dir || !portArg) {
  console.error('Uso: node scripts/static-server.mjs <pasta-dist> <porta> [api]');
  process.exit(1);
}
const base = resolve(dir);
const port = Number(portArg);
const api = new URL(apiArg ?? 'http://localhost:3333');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // repassa as chamadas da API
  if (url.pathname.startsWith('/api/')) {
    const proxy = request(
      { hostname: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: 'Servidor da API indisponível.' }));
    });
    req.pipe(proxy);
    return;
  }

  // arquivos estáticos; qualquer rota desconhecida volta para o index.html
  let file = normalize(join(base, decodeURIComponent(url.pathname)));
  if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Versão compilada não encontrada. Rode o build antes.');
    return;
  }
  const isHtml = extname(file) === '.html';
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    // o HTML nunca fica em cache, para sempre carregar a versão mais nova
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Servindo ${base} em http://localhost:${port} (API: ${api.origin})`));
