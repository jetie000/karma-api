import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly poolInstance: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    const isLocalhost =
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1');
    const hasSslRequire = connectionString.includes('sslmode=require');
    const hasSslDisable = connectionString.includes('sslmode=disable');

    const requireSsl = hasSslRequire || (!hasSslDisable && !isLocalhost);

    const poolConfig = {
      connectionString,
      ssl: requireSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    const adapter = new PrismaPg(poolConfig);

    super({ adapter });

    if (
      adapter &&
      typeof adapter === 'object' &&
      'pool' in adapter &&
      adapter.pool instanceof Pool
    ) {
      this.poolInstance = adapter.pool;
    } else {
      this.poolInstance = new Pool(poolConfig);
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    if (this.poolInstance) {
      await this.poolInstance.end();
    }
  }
}
