// Shared MongoDB connection for the /api serverless functions.
// Uses a cached client so warm invocations reuse the connection pool.
import { MongoClient } from 'mongodb';

export const DB_NAME = 'tshovani';
export const COLLECTION = 'applications';

let cached = globalThis.__mongoCache;
if (!cached) cached = globalThis.__mongoCache = { client: null, promise: null };

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  if (cached.client) return cached.client.db(DB_NAME);

  if (!cached.promise) {
    cached.promise = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    }).connect().then(client => {
      cached.client = client;
      return client;
    });
  }
  await cached.promise;
  return cached.client.db(DB_NAME);
}

export function isConfigured() {
  return Boolean(process.env.MONGODB_URI);
}
