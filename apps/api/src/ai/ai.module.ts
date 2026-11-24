import { Module } from '@nestjs/common';
import { HabitsModule } from '../habits/habits.module';
import { MoneyModule } from '../money/money.module';
import { ActionsService } from './actions.service';
import { AiController } from './ai.controller';
import { AiFeaturesController } from './features.controller';
import { AiKeyService } from './ai-key.service';
import { AiService } from './ai.service';
import { SnapshotService } from './snapshots';
import { WeeklyReviewService } from './weekly-review.service';

@Module({
  imports: [MoneyModule, HabitsModule],
  controllers: [AiController, AiFeaturesController],
  providers: [AiKeyService, AiService, SnapshotService, WeeklyReviewService, ActionsService],
})
export class AiModule {}
