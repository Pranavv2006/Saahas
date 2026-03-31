import { Db, Collection } from 'mongodb';

export interface UserProfile {
  _id?: string;
  userId: string;
  name: string;
  phone: string;
  emergency_contact_1: string;
  emergency_contact_2: string;
  cancel_pin: string;
  preset_message: string;
  address: string;
  checkin_interval: number; // in minutes
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  _id?: string;
  walkId: string;
  userId: string;
  status: 'active' | 'cancelled' | 'completed';
  shadowModeActive: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export async function initializeCollections(db: Db) {
  // Create collections if they don't exist
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);

  if (!collectionNames.includes('users')) {
    await db.createCollection('users');
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });
  }

  if (!collectionNames.includes('alerts')) {
    await db.createCollection('alerts');
    await db.collection('alerts').createIndex({ walkId: 1 }, { unique: true });
    await db.collection('alerts').createIndex({ userId: 1 });
  }
}

export function getUsersCollection(db: Db): Collection<UserProfile> {
  return db.collection<UserProfile>('users');
}

export function getAlertsCollection(db: Db): Collection<Alert> {
  return db.collection<Alert>('alerts');
}
