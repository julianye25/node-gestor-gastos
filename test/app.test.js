import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../src/domain.js';
import { cookieFrom, startTestServer } from '../test-support/server.js';

const PASSWORD = 'secreto123';
const INVITE = 'invitacion';

async function register(request, username, options = {}) {
  const response = await request('/api/register', {
    method: 'POST',
    body: {
      inviteCode: options.inviteCode ?? INVITE,
      username,
      password: options.password ?? PASSWORD,
    },
  });

  return { response, cookie: cookieFrom(response) };
}

async function createExpense(request, cookie, overrides = {}, options = {}) {
  return request('/api/expenses', {
    method: 'POST',
    cookie,
    origin: options.origin,
    body: {
      amount: 25000,
      category: 'Comida',
      date: '2026-11-25',
      description: 'Mercado',
      ...overrides,
    },
  });
}

test('health responde sin sesión', async (t) => {
  const { request } = await startTestServer(t);

  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, {
    ok: true,
    demo: { enabled: false, ttlHours: 0 },
  });
});

test('registro con invitación crea la cuenta e inicia sesión', async (t) => {
  const { request } = await startTestServer(t);

  const { response, cookie } = await register(request, 'Ana');
  assert.equal(response.status, 201);
  assert.equal(response.data.user.username, 'Ana');
  assert.ok(cookie?.startsWith('gg_session='));

  const me = await request('/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'Ana');
});

test('rechaza código de invitación incorrecto o ausente', async (t) => {
  const { request } = await startTestServer(t);

  const wrong = await register(request, 'Ana', { inviteCode: 'otro-codigo' });
  assert.equal(wrong.response.status, 403);
  assert.match(wrong.response.data.error, /Código de invitación incorrecto/);

  const missing = await request('/api/register', {
    method: 'POST',
    body: { username: 'Ana', password: PASSWORD },
  });
  assert.equal(missing.status, 403);
});

test('rechaza usuarios duplicados sin distinguir mayúsculas', async (t) => {
  const { request } = await startTestServer(t);

  assert.equal((await register(request, 'Ana')).response.status, 201);

  const duplicate = await register(request, 'ana');
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.response.data.error, /ya existe/);
});

test('valida usuario y contraseña al registrarse', async (t) => {
  const { request } = await startTestServer(t);

  assert.equal((await register(request, 'ab')).response.status, 400);
  assert.equal((await register(request, 'Ana', { password: '1234567' })).response.status, 400);
});

test('cierra el registro al alcanzar MAX_USERS', async (t) => {
  const { request } = await startTestServer(t, { MAX_USERS: '1' });

  assert.equal((await register(request, 'Ana')).response.status, 201);
  assert.equal((await register(request, 'Bea')).response.status, 403);
});

test('login correcto e incorrecto', async (t) => {
  const { request } = await startTestServer(t);
  await register(request, 'Ana');

  const bad = await request('/api/login', {
    method: 'POST',
    body: { username: 'Ana', password: 'incorrecta' },
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, 'Usuario o contraseña incorrectos');

  const unknown = await request('/api/login', {
    method: 'POST',
    body: { username: 'NoExiste', password: PASSWORD },
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error, 'Usuario o contraseña incorrectos');

  const ok = await request('/api/login', {
    method: 'POST',
    body: { username: 'ana', password: PASSWORD },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.username, 'Ana');

  const me = await request('/api/me', { cookie: cookieFrom(ok) });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'Ana');
});

test('protege las rutas de datos sin sesión', async (t) => {
  const { request } = await startTestServer(t);

  for (const path of ['/api/me', '/api/meta', '/api/expenses', '/api/summary', '/api/export']) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.data.error, 'Debes iniciar sesión');
  }
});

test('cada usuario solo ve y modifica sus gastos', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');
  const bea = await register(request, 'Bea');

  const created = await createExpense(request, ana.cookie, { description: 'Solo de Ana' });
  assert.equal(created.status, 201);
  const id = created.data.expense.id;

  const beaList = await request('/api/expenses', { cookie: bea.cookie });
  assert.equal(beaList.status, 200);
  assert.deepEqual(beaList.data.expenses, []);

  assert.equal((await request(`/api/expenses/${id}`, { cookie: bea.cookie })).status, 404);
  assert.equal(
    (
      await request(`/api/expenses/${id}`, {
        method: 'PUT',
        cookie: bea.cookie,
        body: { amount: 1, category: 'Ocio', date: '2026-11-25' },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/api/expenses/${id}`, { method: 'DELETE', cookie: bea.cookie })).status,
    404,
  );

  const anaList = await request('/api/expenses', { cookie: ana.cookie });
  assert.equal(anaList.status, 200);
  assert.equal(anaList.data.expenses.length, 1);
  assert.equal(anaList.data.expenses[0].description, 'Solo de Ana');

  const updated = await request(`/api/expenses/${id}`, {
    method: 'PUT',
    cookie: ana.cookie,
    body: { amount: 30000, category: 'Ocio', date: '2026-11-25', description: 'Editado' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.expense.amountCents, 3_000_000);
  assert.equal(updated.data.expense.category, 'Ocio');
});

test('resumen y exportación están limitados al usuario', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');
  const bea = await register(request, 'Bea');

  await createExpense(request, ana.cookie, { amount: 25000 });
  await createExpense(request, ana.cookie, { amount: 10000, category: 'Transporte' });
  await createExpense(request, bea.cookie, { amount: 5000, category: 'Ocio' });

  const anaSummary = await request('/api/summary?month=2026-11', { cookie: ana.cookie });
  assert.equal(anaSummary.status, 200);
  assert.equal(anaSummary.data.count, 2);
  assert.equal(anaSummary.data.totalCents, 3_500_000);

  const beaSummary = await request('/api/summary?month=2026-11', { cookie: bea.cookie });
  assert.equal(beaSummary.status, 200);
  assert.equal(beaSummary.data.count, 1);
  assert.equal(beaSummary.data.totalCents, 500_000);

  const anaExport = await request('/api/export', { cookie: ana.cookie });
  assert.equal(anaExport.status, 200);
  assert.equal(anaExport.data.user.username, 'Ana');
  assert.equal(anaExport.data.expenses.length, 2);

  const beaExport = await request('/api/export', { cookie: bea.cookie });
  assert.equal(beaExport.status, 200);
  assert.equal(beaExport.data.expenses.length, 1);
  assert.equal(beaExport.data.expenses[0].category, 'Ocio');
});

test('filtra gastos por mes y categoría', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  await createExpense(request, ana.cookie, { date: '2026-11-05', category: 'Comida' });
  await createExpense(request, ana.cookie, { date: '2026-10-05', category: 'Ocio' });

  const november = await request('/api/expenses?month=2026-11', { cookie: ana.cookie });
  assert.equal(november.data.expenses.length, 1);
  assert.equal(november.data.expenses[0].category, 'Comida');

  const novemberFood = await request('/api/expenses?month=2026-11&category=Comida', {
    cookie: ana.cookie,
  });
  assert.equal(novemberFood.data.expenses.length, 1);

  const octoberFood = await request('/api/expenses?month=2026-10&category=Comida', {
    cookie: ana.cookie,
  });
  assert.equal(octoberFood.data.expenses.length, 0);
});

test('meta devuelve categorías y moneda', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  const meta = await request('/api/meta', { cookie: ana.cookie });
  assert.equal(meta.status, 200);
  assert.deepEqual(meta.data.categories, CATEGORIES);
  assert.equal(meta.data.currency, 'COP');
  assert.deepEqual(meta.data.demo, { enabled: false, ttlHours: 0 });
});

test('rechaza peticiones mutables con Origin ajeno', async (t) => {
  const { request, base } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  const bad = await createExpense(request, ana.cookie, {}, { origin: 'http://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.data.error, 'Origen no válido');

  const good = await createExpense(request, ana.cookie, {}, { origin: base });
  assert.equal(good.status, 201);
});

test('logout borra la cookie de sesión', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  const response = await request('/api/logout', { method: 'POST', cookie: ana.cookie });
  assert.equal(response.status, 204);
  assert.match(response.setCookie[0], /gg_session=;/);
  assert.match(response.setCookie[0], /Max-Age=0/);
});

test('devuelve 404 JSON en rutas desconocidas', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  const response = await request('/api/no-existe', { cookie: ana.cookie });
  assert.equal(response.status, 404);
  assert.equal(response.data.error, 'Ruta no encontrada');
});

test('rechaza gastos y meses inválidos', async (t) => {
  const { request } = await startTestServer(t);
  const ana = await register(request, 'Ana');

  const invalidExpense = await createExpense(request, ana.cookie, {
    amount: 0,
    category: 'NoExiste',
  });
  assert.equal(invalidExpense.status, 400);

  const invalidMonth = await request('/api/summary?month=2026-13', { cookie: ana.cookie });
  assert.equal(invalidMonth.status, 400);
  assert.match(invalidMonth.data.error, /YYYY-MM/);
});
