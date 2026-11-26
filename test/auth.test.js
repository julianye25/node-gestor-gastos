import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSessionCookie,
  parseCookies,
  safeEqualStrings,
  sessionCookie,
  signSession,
  verifySession,
} from '../src/auth.js';
import { hashPassword, publicUser, verifyPassword } from '../src/users.js';

const SECRET = 'secreto-de-pruebas-'.padEnd(64, 'x');

test('hashPassword y verifyPassword funcionan con scrypt', async () => {
  const hash = await hashPassword('secreto123');

  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await verifyPassword('secreto123', hash), true);
  assert.equal(await verifyPassword('otra-cosa', hash), false);
  assert.equal(await verifyPassword('secreto123', 'no-es-un-hash'), false);
  assert.equal(await verifyPassword('secreto123', ''), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('publicUser no expone el hash de la contraseña', () => {
  const user = { id: 'abc', username: 'Ana', passwordHash: 'scrypt$...' };
  assert.deepEqual(publicUser(user), { id: 'abc', username: 'Ana' });
});

test('firma y verifica una sesión', () => {
  const now = Date.now();
  const token = signSession('usuario-1', { secret: SECRET, days: 1, now });

  assert.match(token, /^usuario-1\.\d+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(verifySession(token, { secret: SECRET, now }), {
    userId: 'usuario-1',
    expiresAt: Math.floor(now / 1000) + 86_400,
  });
});

test('rechaza sesiones caducadas, manipuladas o con otro secreto', () => {
  const now = Date.now();
  const token = signSession('usuario-1', { secret: SECRET, days: 1, now });
  const [userId, expiresAt, signature] = token.split('.');
  const tampered = [
    userId,
    expiresAt,
    signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A'),
  ].join('.');

  assert.equal(verifySession(token, { secret: SECRET, now: now + 2 * 86_400_000 }), null);
  assert.equal(verifySession(tampered, { secret: SECRET, now }), null);
  assert.equal(verifySession(token, { secret: 'otro-secreto'.padEnd(64, 'y'), now }), null);
  assert.equal(verifySession('no-es-un-token', { secret: SECRET, now }), null);
  assert.equal(verifySession('', { secret: SECRET, now }), null);
});

test('genera cookies con los atributos correctos', () => {
  const local = sessionCookie('token', { days: 30, secure: false });
  assert.match(local, /^gg_session=token;/);
  assert.match(local, /Path=\//);
  assert.match(local, /HttpOnly/);
  assert.match(local, /SameSite=Lax/);
  assert.match(local, /Max-Age=2592000/);
  assert.doesNotMatch(local, /Secure/);

  assert.match(sessionCookie('token', { days: 1, secure: true }), /Secure/);
  assert.match(clearSessionCookie(), /Max-Age=0/);
  assert.match(clearSessionCookie({ secure: true }), /Secure/);
});

test('parsea cookies y tolera valores mal codificados', () => {
  assert.deepEqual(parseCookies('a=1; b=hola%20mundo'), { a: '1', b: 'hola mundo' });
  assert.deepEqual(parseCookies('a=1; rota=%ZZ'), { a: '1', rota: '%ZZ' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
});

test('safeEqualStrings compara sin filtrar tiempos', () => {
  assert.equal(safeEqualStrings('abc', 'abc'), true);
  assert.equal(safeEqualStrings('abc', 'abd'), false);
  assert.equal(safeEqualStrings('abc', 'abcd'), false);
});
