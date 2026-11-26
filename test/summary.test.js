import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/summary.js';

const expenses = [
  { id: 'a', amountCents: 1000, category: 'Comida', date: '2026-11-01' },
  { id: 'b', amountCents: 2500, category: 'Comida', date: '2026-11-15' },
  { id: 'c', amountCents: 500, category: 'Transporte', date: '2026-11-20' },
  { id: 'd', amountCents: 4000, category: 'Vivienda', date: '2026-10-01' },
  { id: 'e', amountCents: 1200, category: 'Ocio', date: '2026-09-30' },
];

test('calcula los totales del mes seleccionado', () => {
  const summary = summarize(expenses, { month: '2026-11' });

  assert.equal(summary.month, '2026-11');
  assert.equal(summary.totalCents, 4000);
  assert.equal(summary.count, 3);
  assert.equal(summary.generalTotalCents, 9200);
  assert.equal(summary.generalCount, 5);
});

test('desglosa por categoría de mayor a menor', () => {
  const summary = summarize(expenses, { month: '2026-11' });

  assert.deepEqual(summary.byCategory, [
    { category: 'Comida', totalCents: 3500, count: 2 },
    { category: 'Transporte', totalCents: 500, count: 1 },
  ]);
});

test('agrupa por mes de forma descendente', () => {
  const summary = summarize(expenses, { month: '2026-11' });

  assert.deepEqual(
    summary.byMonth.map((entry) => entry.month),
    ['2026-11', '2026-10', '2026-09'],
  );
  assert.equal(summary.byMonth[0].totalCents, 4000);
  assert.equal(summary.byMonth[1].totalCents, 4000);
});

test('sin mes devuelve los totales generales', () => {
  const summary = summarize(expenses);

  assert.equal(summary.month, null);
  assert.equal(summary.totalCents, 9200);
  assert.equal(summary.count, 5);
  assert.equal(summary.byCategory.length, 4);
});

test('rechaza meses con formato inválido', () => {
  assert.throws(() => summarize(expenses, { month: '2026-13' }), /YYYY-MM/);
  assert.throws(() => summarize(expenses, { month: 'noviembre' }), /YYYY-MM/);
});

test('funciona con una lista vacía', () => {
  const summary = summarize([], { month: '2026-11' });

  assert.equal(summary.totalCents, 0);
  assert.equal(summary.count, 0);
  assert.deepEqual(summary.byCategory, []);
  assert.deepEqual(summary.byMonth, []);
});
