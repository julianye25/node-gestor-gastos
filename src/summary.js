import { normalizeMonth } from './domain.js';

/**
 * Calcula los totales de una lista de gastos.
 *
 * - `totalCents` / `count`: total y número de gastos del mes indicado
 *   (o de todos si no se indica mes).
 * - `generalTotalCents` / `generalCount`: total y número de gastos de toda la lista.
 * - `byCategory`: desglose del periodo seleccionado, ordenado de mayor a menor.
 * - `byMonth`: desglose de todos los meses, ordenado del más reciente al más antiguo.
 */
export function summarize(expenses, { month } = {}) {
  const selectedMonth = normalizeMonth(month);

  const byCategory = new Map();
  const byMonth = new Map();
  let totalCents = 0;
  let count = 0;
  let generalTotalCents = 0;

  for (const expense of expenses) {
    const amountCents = Number(expense.amountCents) || 0;
    const expenseMonth = String(expense.date ?? '').slice(0, 7);

    generalTotalCents += amountCents;

    const monthEntry = byMonth.get(expenseMonth) ?? { month: expenseMonth, totalCents: 0, count: 0 };
    monthEntry.totalCents += amountCents;
    monthEntry.count += 1;
    byMonth.set(expenseMonth, monthEntry);

    if (selectedMonth && expenseMonth !== selectedMonth) continue;

    totalCents += amountCents;
    count += 1;

    const categoryEntry = byCategory.get(expense.category) ?? {
      category: expense.category,
      totalCents: 0,
      count: 0,
    };
    categoryEntry.totalCents += amountCents;
    categoryEntry.count += 1;
    byCategory.set(expense.category, categoryEntry);
  }

  return {
    month: selectedMonth,
    totalCents,
    count,
    generalTotalCents,
    generalCount: expenses.length,
    byCategory: [...byCategory.values()].sort((a, b) => b.totalCents - a.totalCents),
    byMonth: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)),
  };
}
