import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { EnvModule } from './env';
import { ExportModule } from './export/export.module';
import { FallbackModule } from './fallback.controller';
import { HealthController } from './health/health.controller';
import { HabitsModule } from './habits/habits.module';
import { MoneyModule } from './money/money.module';
import { VaultModule } from './vault/vault.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  // FallbackModule must stay last: it answers every path nothing else matched.
  imports: [EnvModule, CacheModule, PrismaModule, AuthModule, SettingsModule, RemindersModule, ExportModule, MoneyModule, HabitsModule, VaultModule, AiModule, FallbackModule],
  controllers: [HealthController],
})
export class AppModule {}
