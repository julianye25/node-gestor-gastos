import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'gg_session';

export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string' || !header) return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!name) continue;

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function signSession(userId, { secret, days = 30, now = Date.now() }) {
  const expiresAt = Math.floor(now / 1000) + Math.round(days * 86_400);
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token, { secret, now = Date.now() }) {
  if (typeof token !== 'string' || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [userId, expiresRaw, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (!userId || !Number.isInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return null;

  const expected = createHmac('sha256', secret).update(`${userId}.${expiresAt}`).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  return { userId, expiresAt };
}

export function sessionCookie(token, { days = 30, secure = false } = {}) {
  const maxAge = Math.round(days * 86_400);
  const attributes = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearSessionCookie({ secure = false } = {}) {
  const attributes = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function safeEqualStrings(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
