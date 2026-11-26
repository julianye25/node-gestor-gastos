import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { ConflictError, NotFoundError } from '../src/domain.js';
import { createMongoRepositories } from '../src/mongo.js';
import { hashPassword } from '../src/users.js';

const uri = process.env.MONGODB_URI_TEST;

test(
  'Mongo: CRUD y aislamiento por propietario',
  { skip: uri ? false : 'MONGODB_URI_TEST no está definido' },
  async (t) => {
    const dbName = `gestor_gastos_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const repositories = createMongoRepositories({ uri, dbName });

    t.after(async () => {
      await repositories.close();
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
      try {
        await client.connect();
        await client.db(dbName).dropDatabase();
      } finally {
        await client.close();
      }
    });

    const passwordHash = await hashPassword('secreto123');
    const ana = await repositories.users.create({
      username: 'Ana',
      usernameLower: 'ana',
      passwordHash,
    });
    const bea = await repositories.users.create({
      username: 'Bea',
      usernameLower: 'bea',
      passwordHash,
    });

    assert.equal(await repositories.users.count(), 2);
    assert.equal((await repositories.users.findByUsernameLower('ana')).id, ana.id);

    await assert.rejects(
      () =>
        repositories.users.create({
          username: 'ANA',
          usernameLower: 'ana',
          passwordHash,
        }),
      ConflictError,
    );

    const expense = await repositories.expenses.create(ana.id, {
      amount: '25000',
      category: 'Comida',
      date: '2026-11-25',
      description: 'Mercado',
    });
    assert.equal(expense.amountCents, 2_500_000);

    assert.equal((await repositories.expenses.all(ana.id)).length, 1);
    assert.equal((await repositories.expenses.all(bea.id)).length, 0);
    assert.equal(await repositories.expenses.get(bea.id, expense.id), null);

    await assert.rejects(
      () => repositories.expenses.update(bea.id, expense.id, { amount: 1 }),
      NotFoundError,
    );
    await assert.rejects(
      () => repositories.expenses.remove(bea.id, expense.id),
      NotFoundError,
    );

    assert.equal(await repositories.expenses.removeAllByOwner(ana.id), 1);
    assert.equal((await repositories.expenses.all(ana.id)).length, 0);
  },
);
