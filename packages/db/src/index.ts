import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

/** Constructor options that connect a client to the given PostgreSQL database. */
export function prismaClientOptions(connectionString: string): { adapter: PrismaPg } {
  return { adapter: new PrismaPg({ connectionString }) };
}

/** Builds a client for the given PostgreSQL connection string. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient(prismaClientOptions(connectionString));
}
