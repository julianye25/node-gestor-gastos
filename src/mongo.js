import { MongoClient, ObjectId } from 'mongodb';
import {
  ConflictError,
  NotFoundError,
  normalizeMonth,
  validateExpense,
} from './domain.js';

const clients = new Map();

function getClient(uri) {
  if (!uri) throw new Error('Falta MONGODB_URI');

  if (!clients.has(uri)) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
    });

    const promise = client.connect().catch((error) => {
      clients.delete(uri);
      throw error;
    });

    clients.set(uri, promise);
  }

  return clients.get(uri);
}

function toObjectId(value) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) return null;
  return new ObjectId(value);
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function toExpense(doc) {
  return {
    id: doc._id.toHexString(),
    amountCents: doc.amountCents,
    category: doc.category,
    date: doc.date,
    description: doc.description ?? '',
    createdAt: isoDate(doc.createdAt),
    updatedAt: isoDate(doc.updatedAt),
  };
}

function toUser(doc) {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    usernameLower: doc.usernameLower,
    passwordHash: doc.passwordHash,
    createdAt: isoDate(doc.createdAt),
  };
}

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => {
    const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''));
    if (byDate !== 0) return byDate;
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
}

/**
 * Crea los repositorios de gastos y usuarios sobre MongoDB.
 * El cliente se reutiliza entre invocaciones (importante en Vercel Functions).
 */
export function createMongoRepositories({
  uri,
  dbName = 'gestor_gastos',
  expensesCollection = 'expenses',
  usersCollection = 'users',
}) {
  const clientPromise = getClient(uri);
  let indexesPromise = null;

  async function getDatabase() {
    const client = await clientPromise;
    const database = client.db(dbName);

    if (!indexesPromise) {
      indexesPromise = (async () => {
        await database.collection(expensesCollection).createIndex({
          ownerId: 1,
          date: -1,
          createdAt: -1,
        });
        await database.collection(expensesCollection).createIndex({
          ownerId: 1,
          category: 1,
          date: -1,
        });
        await database.collection(usersCollection).createIndex(
          { usernameLower: 1 },
          { unique: true },
        );
      })().catch((error) => {
        indexesPromise = null;
        throw error;
      });
    }

    await indexesPromise;
    return database;
  }

  async function expensesCollectionRef() {
    return (await getDatabase()).collection(expensesCollection);
  }

  async function usersCollectionRef() {
    return (await getDatabase()).collection(usersCollection);
  }

  const expenses = {
    async all(ownerId) {
      const collection = await expensesCollectionRef();
      const docs = await collection.find({ ownerId }).toArray();
      return sortExpenses(docs.map(toExpense));
    },

    async list(ownerId, { month, category } = {}) {
      const normalizedMonth = normalizeMonth(month);
      const collection = await expensesCollectionRef();
      const filter = { ownerId };

      if (normalizedMonth) {
        filter.date = { $gte: `${normalizedMonth}-01`, $lte: `${normalizedMonth}-31` };
      }

      if (typeof category === 'string' && category.trim()) {
        filter.category = category.trim();
      }

      const docs = await collection.find(filter).toArray();
      return sortExpenses(docs.map(toExpense));
    },

    async get(ownerId, id) {
      const objectId = toObjectId(id);
      if (!objectId) return null;

      const collection = await expensesCollectionRef();
      const doc = await collection.findOne({ _id: objectId, ownerId });
      return doc ? toExpense(doc) : null;
    },

    async create(ownerId, input) {
      const data = validateExpense(input);
      const doc = {
        ownerId,
        ...data,
        createdAt: new Date(),
        updatedAt: null,
      };

      const collection = await expensesCollectionRef();
      const result = await collection.insertOne(doc);
      return toExpense({ ...doc, _id: result.insertedId });
    },

    async update(ownerId, id, input) {
      const objectId = toObjectId(id);
      if (!objectId) throw new NotFoundError('Gasto no encontrado');

      const collection = await expensesCollectionRef();
      const current = await collection.findOne({ _id: objectId, ownerId });
      if (!current) throw new NotFoundError('Gasto no encontrado');

      const merged = {
        amount: input?.amount ?? current.amountCents / 100,
        category: input?.category ?? current.category,
        date: input?.date ?? current.date,
        description: input?.description ?? current.description,
      };
      const data = validateExpense(merged);
      const updatedAt = new Date();

      await collection.updateOne(
        { _id: objectId, ownerId },
        { $set: { ...data, updatedAt } },
      );

      return toExpense({ ...current, ...data, updatedAt });
    },

    async remove(ownerId, id) {
      const objectId = toObjectId(id);
      if (!objectId) throw new NotFoundError('Gasto no encontrado');

      const collection = await expensesCollectionRef();
      const result = await collection.findOneAndDelete({ _id: objectId, ownerId });
      const doc = result && result.value !== undefined ? result.value : result;
      if (!doc) throw new NotFoundError('Gasto no encontrado');
      return toExpense(doc);
    },

    async removeAllByOwner(ownerId) {
      const collection = await expensesCollectionRef();
      const result = await collection.deleteMany({ ownerId });
      return result.deletedCount;
    },
  };

  const users = {
    async count() {
      const collection = await usersCollectionRef();
      return collection.countDocuments();
    },

    async create({ username, usernameLower, passwordHash }) {
      const collection = await usersCollectionRef();
      const doc = {
        username,
        usernameLower,
        passwordHash,
        createdAt: new Date(),
      };

      try {
        const result = await collection.insertOne(doc);
        return toUser({ ...doc, _id: result.insertedId });
      } catch (error) {
        if (error?.code === 11000) {
          throw new ConflictError('Ese usuario ya existe');
        }
        throw error;
      }
    },

    async findByUsernameLower(usernameLower) {
      const collection = await usersCollectionRef();
      const doc = await collection.findOne({ usernameLower });
      return doc ? toUser(doc) : null;
    },

    async findById(id) {
      const objectId = toObjectId(id);
      if (!objectId) return null;

      const collection = await usersCollectionRef();
      const doc = await collection.findOne({ _id: objectId });
      return doc ? toUser(doc) : null;
    },

    async setPassword(id, passwordHash) {
      const objectId = toObjectId(id);
      if (!objectId) throw new NotFoundError('Usuario no encontrado');

      const collection = await usersCollectionRef();
      const result = await collection.updateOne(
        { _id: objectId },
        { $set: { passwordHash, updatedAt: new Date() } },
      );
      if (result.matchedCount === 0) throw new NotFoundError('Usuario no encontrado');
    },

    async remove(id) {
      const objectId = toObjectId(id);
      if (!objectId) throw new NotFoundError('Usuario no encontrado');

      const collection = await usersCollectionRef();
      const result = await collection.findOneAndDelete({ _id: objectId });
      const doc = result && result.value !== undefined ? result.value : result;
      if (!doc) throw new NotFoundError('Usuario no encontrado');
      return toUser(doc);
    },

    async listAll() {
      const collection = await usersCollectionRef();
      const docs = await collection.find({}).sort({ createdAt: 1 }).toArray();
      return docs.map(toUser);
    },
  };

  async function close() {
    const client = await clientPromise.catch(() => null);
    clients.delete(uri);
    indexesPromise = null;
    if (client) await client.close();
  }

  return { expenses, users, close };
}
