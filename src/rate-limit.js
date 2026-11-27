import { TooManyRequestsError } from './domain.js';

/**
 * Limitador de intentos en memoria, suficiente para un demo de una sola instancia.
 * No persiste entre reinicios ni se comparte entre procesos.
 */
export function createRateLimiter({ windowMs, maxAttempts, now = () => Date.now() }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('La ventana del limitador debe ser mayor que cero');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('El máximo de intentos debe ser un entero mayor que cero');
  }

  const attempts = new Map();

  function prune(current) {
    for (const [key, timestamps] of attempts) {
      const recent = timestamps.filter((timestamp) => current - timestamp < windowMs);
      if (recent.length === 0) attempts.delete(key);
      else attempts.set(key, recent);
    }
  }

  return {
    check(key) {
      const current = now();

      // Evita que el mapa crezca sin límite con IPs que solo fallan una vez.
      if (attempts.size > 1_000) prune(current);

      const recent = (attempts.get(key) ?? []).filter(
        (timestamp) => current - timestamp < windowMs,
      );

      if (recent.length >= maxAttempts) {
        const oldest = recent[0];
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowMs - (current - oldest)) / 1_000),
        );
        attempts.set(key, recent);
        throw new TooManyRequestsError(undefined, retryAfterSeconds);
      }

      recent.push(current);
      attempts.set(key, recent);
    },

    reset(key) {
      attempts.delete(key);
    },

    size() {
      return attempts.size;
    },
  };
}
