import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { Db, MongoClient } from 'mongodb';
import { createMongoConnection } from './monogo.js';

export const MONGO_CONNECTION = 'MONGO_CONNECTION';
export const MONGO_DB = 'MONGO_DB';

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CONNECTION,
      useFactory: async () => {
        const connection = createMongoConnection();
        await connection.client.connect();
        return connection;
      },
    },
    {
      provide: MONGO_DB,
      useFactory: (connection: { database: Db }) => connection.database,
      inject: [MONGO_CONNECTION],
    },
  ],
  exports: [MONGO_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(MONGO_CONNECTION) private readonly connection: { client: MongoClient },
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.client.close();
  }
}
