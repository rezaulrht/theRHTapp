import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createOwner } from '../src/auth/owner';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = [
  'HabitMark',
  'HabitDayItem',
  'HabitDay',
  'HabitItem',
  'MoneyBudget',
  'MoneyShortcut',
  'MoneyEntry',
  'MoneyPerson',
  'MoneyCategory',
  'MoneyAccount',
  'ReminderDelivery',
  'Reminder',
  'PushSubscription',
  'Setting',
  'Session',
  'User',
];

/** Empties every table. Call before each test that touches the database. */
export async function resetDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const names = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

/**
 * Builds the whole app against the test database (started by global-setup)
 * with empty tables. `customize` can swap providers, for example fake senders.
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  await resetDb(app);
  return app;
}

export const OWNER = { email: 'owner@example.test', password: 'correct horse battery' };

/** Creates the owner and returns a Cookie header for a logged-in session. */
export async function loginAsOwner(app: INestApplication): Promise<string> {
  await createOwner(app.get(PrismaService), OWNER.email, OWNER.password);
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(OWNER);
  if (res.status !== 204) throw new Error(`Test login failed with ${res.status}`);
  return String(res.headers['set-cookie']).split(';')[0]!;
}
