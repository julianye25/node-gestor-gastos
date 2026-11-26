import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMongoRepositories } from './mongo.js';
import { ValidationError } from './domain.js';

try {
  process.loadEnvFile();
} catch {
  // .env es opcional; en producción las variables vienen del entorno.
}

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const ROOT_DIR = path.join(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`[config] ${error.message}`);
  process.exit(1);
}

if (!config.mongo.uri) {
  console.error(
    '[config] Falta MONGODB_URI. Copia .env.example a .env y configura MongoDB Atlas o MongoDB local.',
  );
  process.exit(1);
}

const { expenses, users, close } = createMongoRepositories(config.mongo);
const app = createApp({ expenses, users, config });

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Método no permitido' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new ValidationError('Ruta no válida');
  }

  const aliases = { '/login': '/login.html', '/register': '/register.html' };
  pathname = aliases[pathname] ?? pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(PUBLIC_DIR, pathname);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendJson(res, 403, { error: 'Acceso denegado' });
    return;
  }

  let content;
  try {
    content = await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    throw error;
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const isAuthPage = pathname === '/login.html' || pathname === '/register.html';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': isAuthPage ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(req.method === 'HEAD' ? undefined : content);
}

const server = createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  } catch {
    sendJson(res, 400, { error: 'Petición no válida' });
    return;
  }

  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await app(req, res);
    } else {
      await handleStatic(req, res, url);
    }
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Error interno del servidor' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`💰 Gestor de gastos: http://${HOST}:${PORT}`);
  console.log(`   MongoDB: ${config.mongo.dbName}/${config.mongo.expensesCollection}`);
  console.log(`   Usuarios máximos: ${config.maxUsers}`);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close(async () => {
    try {
      await close();
    } finally {
      process.exit(0);
    }
  });
  server.closeAllConnections?.();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
