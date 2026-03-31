import { MongoClient, Db } from 'mongodb';
import { initializeCollections } from './models.js';

let db: Db;

export async function connectToMongoDB(): Promise<Db> {
  if (db) return db;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  
  db = client.db('saahas');
  await initializeCollections(db);
  console.log('Connected to MongoDB Atlas');
  
  return db;
}

export function getDB(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectToMongoDB first.');
  }
  return db;
}
