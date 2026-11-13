import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EnvModule } from './env';
import { FallbackModule } from './fallback.controller';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  // FallbackModule must stay last: it answers every path nothing else matched.
  imports: [EnvModule, PrismaModule, AuthModule, FallbackModule],
  controllers: [HealthController],
})
export class AppModule {}
