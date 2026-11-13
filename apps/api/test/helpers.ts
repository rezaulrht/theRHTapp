import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = ['ReminderDelivery', 'Reminder', 'PushSubscription', 'Setting', 'Session', 'User'];

/** Empties every table. Call before each test that touches the database. */
export async function resetDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const names = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

/**
 * Builds the whole app against the test database (started by global-setup)
 * with empty tables.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  await resetDb(app);
  return app;
}

/** Creates the owner and returns a Cookie header for a logged-in session. */
export async function loginAsOwner(_app: INestApplication): Promise<string> {
  throw new Error('loginAsOwner is implemented with the auth module');
}
