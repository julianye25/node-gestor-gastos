export function loadConfig(env = process.env) {
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
  }

  const sessionDays = Number(env.SESSION_DAYS ?? 30);
  if (!Number.isFinite(sessionDays) || sessionDays <= 0) {
    throw new Error('SESSION_DAYS debe ser un número mayor que cero');
  }

  const maxUsers = Number(env.MAX_USERS ?? 4);
  if (!Number.isInteger(maxUsers) || maxUsers <= 0) {
    throw new Error('MAX_USERS debe ser un entero mayor que cero');
  }

  const currency = String(env.CURRENCY ?? 'COP').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('CURRENCY debe ser un código ISO de 3 letras, por ejemplo COP');
  }

  const demoMode = env.DEMO_MODE === '1';
  const demoUserTtlHours = Number(env.DEMO_USER_TTL_HOURS ?? 24);
  if (!Number.isFinite(demoUserTtlHours) || demoUserTtlHours <= 0) {
    throw new Error('DEMO_USER_TTL_HOURS debe ser un número mayor que cero');
  }

  const rateLimitWindowMinutes = Number(env.RATE_LIMIT_WINDOW_MINUTES ?? 15);
  if (!Number.isFinite(rateLimitWindowMinutes) || rateLimitWindowMinutes <= 0) {
    throw new Error('RATE_LIMIT_WINDOW_MINUTES debe ser un número mayor que cero');
  }

  const rateLimitMaxAttempts = Number(env.RATE_LIMIT_MAX_ATTEMPTS ?? 10);
  if (!Number.isInteger(rateLimitMaxAttempts) || rateLimitMaxAttempts <= 0) {
    throw new Error('RATE_LIMIT_MAX_ATTEMPTS debe ser un entero mayor que cero');
  }

  return {
    currency,
    sessionSecret,
    sessionDays,
    registrationCode: env.REGISTRATION_CODE ?? '',
    maxUsers,
    secureCookies: env.COOKIE_SECURE === '1',
    demoMode,
    demoUserTtlHours,
    rateLimitWindowMinutes,
    rateLimitMaxAttempts,
    mongo: {
      uri: env.MONGODB_URI ?? '',
      dbName: env.MONGODB_DB ?? 'gestor_gastos',
      expensesCollection: env.MONGODB_EXPENSES_COLLECTION ?? 'expenses',
      usersCollection: env.MONGODB_USERS_COLLECTION ?? 'users',
    },
  };
}
