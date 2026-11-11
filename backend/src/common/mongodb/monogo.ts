import 'dotenv/config';
import { MongoClient } from 'mongodb';

export function createMongoConnection() {
  const client = new MongoClient(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017',
    {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
    },
  );
  const database = client.db(process.env.MONGODB_DATABASE ?? 'videoaiditor');

  return { client, database };
}
