import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createMongoConnection } from '../common/mongodb/monogo.js';

@Controller('restapi')
export class RestapiController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RestapiController.name);
  private readonly mongo = createMongoConnection();

  async onModuleInit(): Promise<void> {
    try {
      await this.mongo.client.connect();
      await this.mongo.database.command({ ping: 1 });
      this.logger.log('MongoDB connected');
    } catch {
      await this.mongo.client.close();
      throw new Error(
        'MongoDB connection failed. Check MONGODB_URI and MONGODB_DATABASE in backend/.env.',
      );
    }
  }

  @Get('health/db')
  async checkDatabase() {
    try {
      await this.mongo.database.command({ ping: 1 });
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException('Database connection failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.mongo.client.close();
  }
}
