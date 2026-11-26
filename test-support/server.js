import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryRepositories } from './memory.js';

/**
 * Arranca la API real sobre repositorios en memoria.
 * No toca MongoDB ni el archivo de datos.
 */
export async function startTestServer(t, overrides = {}) {
  const repositories = createMemoryRepositories();
  const config = loadConfig({
    SESSION_SECRET: 'test-secret-'.padEnd(64, 'x'),
    REGISTRATION_CODE: 'invitacion',
    MAX_USERS: '4',
    CURRENCY: 'COP',
    ...overrides,
  });

  const app = createApp({ ...repositories, config });
  const server = createServer((req, res) => {
    app(req, res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections?.();
      }),
  );

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function request(path, { method = 'GET', body, cookie, origin, headers = {} } = {}) {
    const finalHeaders = { ...headers };
    if (body !== undefined) finalHeaders['content-type'] = 'application/json';
    if (cookie) finalHeaders.cookie = cookie;
    if (origin) finalHeaders.origin = origin;

    const response = await fetch(`${base}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      status: response.status,
      data,
      headers: response.headers,
      setCookie: response.headers.getSetCookie?.() ?? [],
    };
  }

  return { base, config, repositories, request };
}

export function cookieFrom(response) {
  const header = response.setCookie[0];
  return header ? header.split(';')[0] : null;
}
