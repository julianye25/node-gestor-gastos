export const CATEGORIES = ['Comida', 'Transporte', 'Vivienda', 'Ocio', 'Salud', 'Otros'];
export const MAX_AMOUNT_CENTS = 100_000_000_000; // 1.000.000.000 en unidades monetarias
export const MAX_DESCRIPTION_LENGTH = 200;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USERNAME_RE = /^[\p{L}\p{N}._-]+$/u;

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Debes iniciar sesión') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'El cuerpo de la petición es demasiado grande') {
    super(message, 413);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Servicio no disponible') {
    super(message, 503);
  }
}

export function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeMonth(value) {
  if (value === undefined || value === null || value === '') return null;
  const month = String(value).trim();
  if (!MONTH_RE.test(month)) {
    throw new ValidationError('El mes debe tener el formato YYYY-MM');
  }
  return month;
}

export function toCents(value) {
  let amount;

  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    const clean = value.trim().replace(/\s+/g, '').replace(',', '.');
    if (!clean) throw new ValidationError('El importe es obligatorio');
    if (!/^\d+(\.\d+)?$/.test(clean)) throw new ValidationError('El importe no es válido');
    amount = Number(clean);
  } else {
    throw new ValidationError('El importe es obligatorio');
  }

  if (!Number.isFinite(amount)) throw new ValidationError('El importe no es válido');

  const cents = Math.round(amount * 100);
  if (cents <= 0) throw new ValidationError('El importe debe ser mayor que cero');
  if (cents > MAX_AMOUNT_CENTS) throw new ValidationError('El importe es demasiado grande');
  return cents;
}

export function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return todayISO();

  const date = String(value).trim();
  if (!DATE_RE.test(date)) {
    throw new ValidationError('La fecha debe tener el formato YYYY-MM-DD');
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ValidationError('La fecha no es válida');
  }
  return date;
}

export function normalizeCategory(value) {
  const category = typeof value === 'string' ? value.trim() : '';
  if (!category) throw new ValidationError('La categoría es obligatoria');
  if (!CATEGORIES.includes(category)) {
    throw new ValidationError(`Categoría no válida. Usa una de: ${CATEGORIES.join(', ')}`);
  }
  return category;
}

export function normalizeDescription(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError('La descripción no es válida');

  const description = value.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`La descripción no puede superar los ${MAX_DESCRIPTION_LENGTH} caracteres`);
  }
  return description;
}

export function validateExpense(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Los datos del gasto no son válidos');
  }

  return {
    amountCents: toCents(input.amount),
    category: normalizeCategory(input.category),
    date: normalizeDate(input.date),
    description: normalizeDescription(input.description),
  };
}

export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new ValidationError('El usuario es obligatorio');

  const username = value.trim().normalize('NFC');
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw new ValidationError(
      `El usuario debe tener entre ${MIN_USERNAME_LENGTH} y ${MAX_USERNAME_LENGTH} caracteres`,
    );
  }
  if (!USERNAME_RE.test(username)) {
    throw new ValidationError('El usuario solo puede tener letras, números, puntos, guiones y guiones bajos');
  }
  return username;
}

export function usernameKey(username) {
  return String(username).normalize('NFC').toLowerCase();
}

export function validatePassword(value) {
  if (typeof value !== 'string') throw new ValidationError('La contraseña es obligatoria');
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres`);
  }
  return value;
}
