import { MongoClient } from 'mongodb';
import { MONGODB_URI, DB_NAME } from '../../config/constants.js';

let clientPromise;

export function getMongoClient() {
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}
