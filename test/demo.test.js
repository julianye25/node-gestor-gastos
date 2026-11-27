import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupExpiredDemoUsers } from '../src/demo.js';
import { cookieFrom, startTestServer } from '../test-support/server.js';

const PASSWORD = 'secreto123';
const INVITE = 'invitacion';
const DEMO_EXPENSES = 14;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function register(request, username, options = {}) {
  const response = await request('/api/register', {
    method: 'POST',
    body: {
      inviteCode: INVITE,
      username,
      password: PASSWORD,
      ...options,
    },
  });

  return { response, cookie: cookieFrom(response) };
}

test('el registro demo crea la cuenta con caducidad y gastos de ejemplo', async (t) => {
  const { request } = await startTestServer(t, {
    DEMO_MODE: '1',
    DEMO_USER_TTL_HOURS: '24',
  });

  const health = await request('/api/health');
  assert.deepEqual(health.data.demo, { enabled: true, ttlHours: 24 });

  const { response, cookie } = await register(request, 'Ana');
  assert.equal(response.status, 201);
  assert.equal(response.data.user.demo, true);
  assert.ok(response.data.user.expiresAt);
  assert.ok(Date.parse(response.data.user.expiresAt) > Date.now());

  const meta = await request('/api/meta', { cookie });
  assert.deepEqual(meta.data.demo, { enabled: true, ttlHours: 24 });

  const list = await request('/api/expenses', { cookie });
  assert.equal(list.status, 200);
  assert.equal(list.data.expenses.length, DEMO_EXPENSES);

  const summary = await request('/api/summary', { cookie });
  assert.equal(summary.status, 200);
  assert.equal(summary.data.generalCount, DEMO_EXPENSES);
  assert.ok(summary.data.generalTotalCents > 0);
});

test('la limpieza solo borra cuentas demo caducadas y sus gastos', async (t) => {
  const { request, repositories } = await startTestServer(t, { DEMO_MODE: '1' });

  const demo = await register(request, 'Demo');
  const userId = demo.response.data.user.id;
  assert.equal((await repositories.expenses.all(userId)).length, DEMO_EXPENSES);

  const future = new Date(Date.now() + 25 * 60 * 60 * 1_000);
  assert.equal(await cleanupExpiredDemoUsers({ users: repositories.users, now: future }), 1);
  assert.equal(await repositories.users.count(), 0);
  assert.equal((await repositories.expenses.all(userId)).length, 0);

  const me = await request('/api/me', { cookie: demo.cookie });
  assert.equal(me.status, 401);
});

test('la limpieza no toca cuentas normales', async (t) => {
  const { request, repositories } = await startTestServer(t);

  const ana = await register(request, 'Ana');
  assert.equal(ana.response.data.user.demo, false);
  assert.equal(ana.response.data.user.expiresAt, null);

  const future = new Date(Date.now() + 25 * 60 * 60 * 1_000);
  assert.equal(await cleanupExpiredDemoUsers({ users: repositories.users, now: future }), 0);
  assert.equal(await repositories.users.count(), 1);
  assert.equal((await request('/api/me', { cookie: ana.cookie })).status, 200);
});

test('con el cupo lleno rota la cuenta demo más antigua', async (t) => {
  const { request, repositories } = await startTestServer(t, {
    DEMO_MODE: '1',
    MAX_USERS: '2',
  });

  const ana = await register(request, 'Ana');
  await delay(5);
  const bea = await register(request, 'Bea');
  await delay(5);
  const carla = await register(request, 'Carla');

  assert.equal(ana.response.status, 201);
  assert.equal(bea.response.status, 201);
  assert.equal(carla.response.status, 201);

  assert.equal(await repositories.users.count(), 2);
  const usernames = (await repositories.users.listAll()).map((user) => user.username);
  assert.deepEqual(usernames, ['Bea', 'Carla']);

  assert.equal((await repositories.expenses.all(ana.response.data.user.id)).length, 0);
  assert.equal((await repositories.expenses.all(carla.response.data.user.id)).length, DEMO_EXPENSES);

  assert.equal(
    (
      await request('/api/login', {
        method: 'POST',
        body: { username: 'Ana', password: PASSWORD },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/login', {
        method: 'POST',
        body: { username: 'Carla', password: PASSWORD },
      })
    ).status,
    200,
  );
});

test('un usuario duplicado no consume el cupo ni rota cuentas', async (t) => {
  const { request, repositories } = await startTestServer(t, {
    DEMO_MODE: '1',
    MAX_USERS: '1',
  });

  const ana = await register(request, 'Ana');
  assert.equal(ana.response.status, 201);

  const duplicate = await register(request, 'ana');
  assert.equal(duplicate.response.status, 409);
  assert.equal(await repositories.users.count(), 1);
  assert.equal((await repositories.users.listAll())[0].username, 'Ana');
});

test('limita los intentos de login y de registro', async (t) => {
  const { request } = await startTestServer(t, {
    RATE_LIMIT_MAX_ATTEMPTS: '2',
    RATE_LIMIT_WINDOW_MINUTES: '15',
  });

  await register(request, 'Ana');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request('/api/login', {
      method: 'POST',
      body: { username: 'Ana', password: 'incorrecta' },
    });
    assert.equal(response.status, 401);
  }

  const blockedLogin = await request('/api/login', {
    method: 'POST',
    body: { username: 'Ana', password: 'incorrecta' },
  });
  assert.equal(blockedLogin.status, 429);
  assert.match(blockedLogin.data.error, /Demasiados intentos/);
  assert.ok(blockedLogin.headers.get('retry-after'));

  await register(request, 'Bea');
  const blockedRegister = await register(request, 'Carla');
  assert.equal(blockedRegister.response.status, 429);
  assert.match(blockedRegister.response.data.error, /Demasiados intentos/);
});
