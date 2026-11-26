import {
  CATEGORIES,
  ForbiddenError,
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
  normalizeUsername,
  usernameKey,
  validatePassword,
} from './domain.js';
import { summarize } from './summary.js';
import {
  clearSessionCookie,
  parseCookies,
  safeEqualStrings,
  sessionCookie,
  signSession,
  verifySession,
  COOKIE_NAME,
} from './auth.js';
import { hashPassword, publicUser, verifyPassword } from './users.js';

const MAX_BODY_BYTES = 1_000_000;

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
const DUMMY_HASH = `scrypt$16384$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function sendEmpty(res, status, extraHeaders = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...extraHeaders });
  res.end();
}

function sendMethodNotAllowed(res, methods) {
  sendJson(res, 405, { error: 'Método no permitido' }, { Allow: methods.join(', ') });
}

function isDatabaseUnavailable(error) {
  const name = error?.name ?? '';
  return (
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoTimeoutError' ||
    name === 'MongoNotConnectedError' ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ENOTFOUND' ||
    error?.code === 'ETIMEDOUT'
  );
}

function handleError(res, error) {
  let status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  if (isDatabaseUnavailable(error)) status = 503;

  if (status >= 500) console.error('[api]', error);
  if (res.headersSent) {
    res.destroy();
    return;
  }

  let message;
  if (status === 503) {
    message = 'No se pudo conectar con la base de datos. Inténtalo de nuevo.';
  } else if (status >= 500) {
    message = 'Error interno del servidor';
  } else {
    message = error.message;
  }

  sendJson(res, status, { error: message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let tooLarge = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        fail(new PayloadTooLargeError());
        req.resume();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled || tooLarge) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const data = JSON.parse(raw);
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('not an object');
        }
        resolve(data);
      } catch {
        reject(new ValidationError('El cuerpo debe ser un objeto JSON válido'));
      }
    });

    req.on('error', (error) => fail(error));
  });
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError('Origen no válido');
  }

  const requestHost = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  if (!requestHost || originHost !== requestHost) {
    throw new ForbiddenError('Origen no válido');
  }
}

export function createApp({ expenses, users, config }) {
  if (!expenses || !users) throw new Error('Faltan los repositorios de datos');
  if (!config?.sessionSecret) throw new Error('Falta SESSION_SECRET');

  const {
    currency,
    sessionSecret,
    sessionDays,
    registrationCode,
    maxUsers,
    secureCookies,
  } = config;

  function setSession(res, userId, extraHeaders = {}) {
    const token = signSession(userId, { secret: sessionSecret, days: sessionDays });
    return {
      ...extraHeaders,
      'Set-Cookie': sessionCookie(token, { days: sessionDays, secure: secureCookies }),
    };
  }

  async function currentUser(req) {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies[COOKIE_NAME], { secret: sessionSecret });
    if (!session) return null;

    const user = await users.findById(session.userId);
    if (!user) return null;
    return publicUser(user);
  }

  async function requireUser(req) {
    const user = await currentUser(req);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  async function handleRegister(req, res) {
    if (!registrationCode) {
      throw new ForbiddenError('El registro está cerrado');
    }

    const body = await readJsonBody(req);
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
    if (!safeEqualStrings(inviteCode, registrationCode)) {
      throw new ForbiddenError('Código de invitación incorrecto');
    }

    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password);

    if ((await users.count()) >= maxUsers) {
      throw new ForbiddenError('El registro está cerrado');
    }

    const passwordHash = await hashPassword(password);
    const user = await users.create({
      username,
      usernameLower: usernameKey(username),
      passwordHash,
    });

    sendJson(res, 201, { user: publicUser(user) }, setSession(res, user.id));
  }

  async function handleLogin(req, res) {
    const body = await readJsonBody(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (
      !username ||
      !password ||
      username.length > MAX_USERNAME_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      throw new UnauthorizedError('Usuario o contraseña incorrectos');
    }

    const user = await users.findByUsernameLower(usernameKey(username));
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !valid) {
      throw new UnauthorizedError('Usuario o contraseña incorrectos');
    }

    sendJson(res, 200, { user: publicUser(user) }, setSession(res, user.id));
  }

  async function handleApi(req, res, url) {
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';

    if (method !== 'GET' && method !== 'HEAD') {
      assertSameOrigin(req);
    }

    if (pathname === '/api/health') {
      if (method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/register') {
      if (method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
      return handleRegister(req, res);
    }

    if (pathname === '/api/login') {
      if (method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
      return handleLogin(req, res);
    }

    if (pathname === '/api/logout') {
      if (method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
      return sendEmpty(res, 204, {
        'Set-Cookie': clearSessionCookie({ secure: secureCookies }),
      });
    }

    const user = await requireUser(req);

    if (pathname === '/api/me') {
      if (method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
      return sendJson(res, 200, { user });
    }

    if (pathname === '/api/meta') {
      if (method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
      return sendJson(res, 200, { categories: CATEGORIES, currency });
    }

    if (pathname === '/api/expenses') {
      if (method === 'GET') {
        const expensesList = await expenses.list(user.id, {
          month: url.searchParams.get('month') ?? undefined,
          category: url.searchParams.get('category') ?? undefined,
        });
        return sendJson(res, 200, { expenses: expensesList });
      }

      if (method === 'POST') {
        const body = await readJsonBody(req);
        const expense = await expenses.create(user.id, body);
        return sendJson(res, 201, { expense });
      }

      return sendMethodNotAllowed(res, ['GET', 'POST']);
    }

    const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (expenseMatch) {
      let id;
      try {
        id = decodeURIComponent(expenseMatch[1]);
      } catch {
        throw new ValidationError('Identificador no válido');
      }

      if (method === 'GET') {
        const expense = await expenses.get(user.id, id);
        if (!expense) throw new NotFoundError('Gasto no encontrado');
        return sendJson(res, 200, { expense });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const body = await readJsonBody(req);
        const expense = await expenses.update(user.id, id, body);
        return sendJson(res, 200, { expense });
      }

      if (method === 'DELETE') {
        await expenses.remove(user.id, id);
        return sendJson(res, 200, { ok: true });
      }

      return sendMethodNotAllowed(res, ['GET', 'PUT', 'PATCH', 'DELETE']);
    }

    if (pathname === '/api/summary') {
      if (method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
      const all = await expenses.all(user.id);
      return sendJson(
        res,
        200,
        summarize(all, { month: url.searchParams.get('month') ?? undefined }),
      );
    }

    if (pathname === '/api/export') {
      if (method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
      const all = await expenses.all(user.id);
      return sendJson(
        res,
        200,
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          user,
          expenses: all,
        },
        {
          'Content-Disposition': `attachment; filename="gastos-${new Date()
            .toISOString()
            .slice(0, 10)}.json"`,
        },
      );
    }

    sendJson(res, 404, { error: 'Ruta no encontrada' });
  }

  return async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendJson(res, 400, { error: 'Petición no válida' });
      return;
    }

    try {
      await handleApi(req, res, url);
    } catch (error) {
      handleError(res, error);
    }
  };
}
