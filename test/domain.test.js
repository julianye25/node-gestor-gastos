import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  ConflictError,
  ForbiddenError,
  MAX_AMOUNT_CENTS,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
  normalizeCategory,
  normalizeDate,
  normalizeDescription,
  normalizeMonth,
  normalizeUsername,
  toCents,
  usernameKey,
  validateExpense,
  validatePassword,
} from '../src/domain.js';

test('toCents acepta números, coma decimal y redondea', () => {
  assert.equal(toCents(12.5), 1250);
  assert.equal(toCents('12,50'), 1250);
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents(' 12,346 '), 1235);
});

test('toCents rechaza importes vacíos, negativos o demasiado grandes', () => {
  for (const value of ['', 'abc', 0, -1, null, undefined]) {
    assert.throws(() => toCents(value), ValidationError, String(value));
  }
  assert.equal(toCents(MAX_AMOUNT_CENTS / 100), MAX_AMOUNT_CENTS);
  assert.throws(() => toCents(MAX_AMOUNT_CENTS / 100 + 1), ValidationError);
});

test('normaliza fechas y meses', () => {
  assert.equal(normalizeDate('2026-11-05'), '2026-11-05');
  assert.equal(normalizeDate('2024-02-29'), '2024-02-29');
  assert.match(normalizeDate(undefined), /^\d{4}-\d{2}-\d{2}$/);

  assert.throws(() => normalizeDate('2026-02-29'), ValidationError);
  assert.throws(() => normalizeDate('05/11/2026'), ValidationError);
  assert.throws(() => normalizeDate('2026-13-01'), ValidationError);

  assert.equal(normalizeMonth('2026-11'), '2026-11');
  assert.equal(normalizeMonth(''), null);
  assert.equal(normalizeMonth(undefined), null);
  assert.throws(() => normalizeMonth('2026-13'), ValidationError);
  assert.throws(() => normalizeMonth('2026-1'), ValidationError);
});

test('valida categorías y descripciones', () => {
  assert.deepEqual(CATEGORIES, ['Comida', 'Transporte', 'Vivienda', 'Ocio', 'Salud', 'Otros']);
  assert.equal(normalizeCategory(' Comida '), 'Comida');
  assert.throws(() => normalizeCategory('NoExiste'), ValidationError);
  assert.throws(() => normalizeCategory(''), ValidationError);

  assert.equal(normalizeDescription(undefined), '');
  assert.equal(normalizeDescription('  Mercado  '), 'Mercado');
  assert.throws(() => normalizeDescription('x'.repeat(201)), ValidationError);
  assert.throws(() => normalizeDescription(123), ValidationError);
});

test('valida usuarios y contraseñas', () => {
  assert.equal(normalizeUsername('  Ana  '), 'Ana');
  assert.equal(usernameKey('ANA'), 'ana');
  assert.throws(() => normalizeUsername('ab'), ValidationError);
  assert.throws(() => normalizeUsername('ana!'), ValidationError);
  assert.throws(() => normalizeUsername('a'.repeat(21)), ValidationError);

  assert.equal(validatePassword('12345678'), '12345678');
  assert.throws(() => validatePassword('1234567'), ValidationError);
  assert.throws(() => validatePassword('x'.repeat(129)), ValidationError);
  assert.throws(() => validatePassword(12345678), ValidationError);
});

test('validateExpense devuelve datos normalizados y rechaza entradas inválidas', () => {
  assert.deepEqual(
    validateExpense({
      amount: '12,50',
      category: 'Comida',
      date: '2026-11-05',
      description: '  Pan  ',
    }),
    {
      amountCents: 1250,
      category: 'Comida',
      date: '2026-11-05',
      description: 'Pan',
    },
  );

  assert.throws(() => validateExpense(null), ValidationError);
  assert.throws(() => validateExpense([]), ValidationError);
  assert.throws(
    () => validateExpense({ amount: 1, category: 'NoExiste', date: '2026-11-05' }),
    ValidationError,
  );
});

test('los errores llevan el código HTTP correcto', () => {
  assert.equal(new ValidationError('x').statusCode, 400);
  assert.equal(new UnauthorizedError().statusCode, 401);
  assert.equal(new ForbiddenError().statusCode, 403);
  assert.equal(new NotFoundError().statusCode, 404);
  assert.equal(new ConflictError('x').statusCode, 409);
  assert.equal(new PayloadTooLargeError().statusCode, 413);
  assert.equal(new ServiceUnavailableError().statusCode, 503);
});
