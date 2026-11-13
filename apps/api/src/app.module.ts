import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EnvModule } from './env';
import { ExportModule } from './export/export.module';
import { FallbackModule } from './fallback.controller';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  // FallbackModule must stay last: it answers every path nothing else matched.
  imports: [EnvModule, PrismaModule, AuthModule, SettingsModule, RemindersModule, ExportModule, FallbackModule],
  controllers: [HealthController],
})
export class AppModule {}
