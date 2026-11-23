import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { AiController } from './ai.controller';
import { AiKeyService } from './ai-key.service';

@Module({ imports: [MoneyModule], controllers: [AiController], providers: [AiKeyService] })
export class AiModule {}
