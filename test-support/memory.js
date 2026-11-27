import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  normalizeMonth,
  validateExpense,
} from '../src/domain.js';

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => {
    const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''));
    if (byDate !== 0) return byDate;
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
}

export function createMemoryRepositories() {
  const expenseItems = [];
  const userItems = [];

  const expenses = {
    async all(ownerId) {
      return sortExpenses(expenseItems.filter((expense) => expense.ownerId === ownerId));
    },

    async list(ownerId, { month, category } = {}) {
      const selectedMonth = normalizeMonth(month);
      const categoryFilter =
        typeof category === 'string' && category.trim() ? category.trim() : null;

      return sortExpenses(
        expenseItems.filter((expense) => {
          if (expense.ownerId !== ownerId) return false;
          if (selectedMonth && !expense.date.startsWith(selectedMonth)) return false;
          if (categoryFilter && expense.category !== categoryFilter) return false;
          return true;
        }),
      );
    },

    async get(ownerId, id) {
      return (
        expenseItems.find((expense) => expense.ownerId === ownerId && expense.id === id) ?? null
      );
    },

    async create(ownerId, input) {
      const data = validateExpense(input);
      const expense = {
        id: randomUUID(),
        ownerId,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      expenseItems.push(expense);
      return expense;
    },

    async createMany(ownerId, inputs) {
      if (!Array.isArray(inputs) || inputs.length === 0) return [];

      const createdAt = new Date().toISOString();
      const created = inputs.map((input) => ({
        id: randomUUID(),
        ownerId,
        ...validateExpense(input),
        createdAt,
        updatedAt: null,
      }));
      expenseItems.push(...created);
      return created;
    },

    async update(ownerId, id, input) {
      const index = expenseItems.findIndex(
        (expense) => expense.ownerId === ownerId && expense.id === id,
      );
      if (index === -1) throw new NotFoundError('Gasto no encontrado');

      const current = expenseItems[index];
      const merged = {
        amount: input?.amount ?? current.amountCents / 100,
        category: input?.category ?? current.category,
        date: input?.date ?? current.date,
        description: input?.description ?? current.description,
      };
      const data = validateExpense(merged);
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      expenseItems[index] = updated;
      return updated;
    },

    async remove(ownerId, id) {
      const index = expenseItems.findIndex(
        (expense) => expense.ownerId === ownerId && expense.id === id,
      );
      if (index === -1) throw new NotFoundError('Gasto no encontrado');

      const [removed] = expenseItems.splice(index, 1);
      return removed;
    },
  };

  const users = {
    async count() {
      return userItems.length;
    },

    async create({ username, usernameLower, passwordHash, demo = false, expiresAt = null }) {
      if (userItems.some((user) => user.usernameLower === usernameLower)) {
        throw new ConflictError('Ese usuario ya existe');
      }

      const user = {
        id: randomUUID(),
        username,
        usernameLower,
        passwordHash,
        demo: Boolean(demo),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        createdAt: new Date().toISOString(),
      };
      userItems.push(user);
      return user;
    },

    async findByUsernameLower(usernameLower) {
      return userItems.find((user) => user.usernameLower === usernameLower) ?? null;
    },

    async findById(id) {
      return userItems.find((user) => user.id === id) ?? null;
    },

    async setPassword(id, passwordHash) {
      const user = userItems.find((item) => item.id === id);
      if (!user) throw new NotFoundError('Usuario no encontrado');
      user.passwordHash = passwordHash;
    },

    async remove(id) {
      const index = userItems.findIndex((user) => user.id === id);
      if (index === -1) throw new NotFoundError('Usuario no encontrado');
      const [removed] = userItems.splice(index, 1);
      return removed;
    },

    async listAll() {
      return [...userItems];
    },

    async findOldestDemo() {
      const demoUsers = userItems
        .filter((user) => user.demo)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return demoUsers[0] ?? null;
    },

    async removeOldestDemo() {
      const oldest = userItems
        .filter((user) => user.demo)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      if (!oldest) return null;

      const index = userItems.findIndex((user) => user.id === oldest.id);
      if (index !== -1) userItems.splice(index, 1);
      for (let i = expenseItems.length - 1; i >= 0; i -= 1) {
        if (expenseItems[i].ownerId === oldest.id) expenseItems.splice(i, 1);
      }
      return oldest;
    },

    async removeExpiredDemo(now = new Date()) {
      const limit = now instanceof Date ? now : new Date(now);
      const expired = userItems.filter(
        (user) => user.demo && user.expiresAt && new Date(user.expiresAt) <= limit,
      );
      if (expired.length === 0) return 0;

      const ids = new Set(expired.map((user) => user.id));
      for (let i = userItems.length - 1; i >= 0; i -= 1) {
        if (ids.has(userItems[i].id)) userItems.splice(i, 1);
      }
      for (let i = expenseItems.length - 1; i >= 0; i -= 1) {
        if (ids.has(expenseItems[i].ownerId)) expenseItems.splice(i, 1);
      }
      return expired.length;
    },
  };

  return { expenses, users };
}
