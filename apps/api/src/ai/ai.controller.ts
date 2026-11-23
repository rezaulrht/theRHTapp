import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { todayIn } from '@pa/shared';
import { z } from 'zod';
import { AccountsService } from '../money/accounts.service';
import { CategoriesService } from '../money/categories.service';
import { SettingsService } from '../settings/settings.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AiKeyService, type KeyStatus } from './ai-key.service';
import { AssistantError, askDeepSeek } from './deepseek';
import { buildMessages, MAX_TEXT, type ParsedExpense, readReply } from './expense-parser';

const parseSchema = z.object({ text: z.string().trim().min(1, 'Type what you spent').max(MAX_TEXT, 'Use a shorter sentence') });
const keySchema = z.object({
  key: z.string().trim().min(10, 'That does not look like a key').max(300, 'That does not look like a key'),
});

/** The assistant. It reads and suggests; it never saves anything itself. */
@Controller('ai')
export class AiController {
  constructor(
    private readonly keys: AiKeyService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly settings: SettingsService,
  ) {}

  /** Lets the web app show the assistant only when it is set up. Never includes the key. */
  @Get('status')
  status(): Promise<KeyStatus> {
    return this.keys.status();
  }

  @Put('key')
  @HttpCode(204)
  async saveKey(@Body(new ZodValidationPipe(keySchema)) body: z.infer<typeof keySchema>): Promise<void> {
    await this.keys.set(body.key);
  }

  @Delete('key')
  @HttpCode(204)
  async removeKey(): Promise<void> {
    await this.keys.remove();
  }

  @Post('parse-expense')
  async parseExpense(@Body(new ZodValidationPipe(parseSchema)) body: z.infer<typeof parseSchema>): Promise<ParsedExpense> {
    const apiKey = await this.keys.get();
    if (!apiKey) throw new ServiceUnavailableException('The assistant is not set up');

    const [accounts, categories, timeZone] = await Promise.all([
      this.accounts.list(),
      this.categories.list(),
      this.settings.get('general.timezone'),
    ]);
    const spendable = categories.filter((category) => !category.isFees);
    const today = todayIn(timeZone);

    let reply: unknown;
    try {
      reply = await askDeepSeek(
        apiKey,
        buildMessages(
          body.text,
          accounts.map((account) => account.name),
          spendable.map((category) => category.name),
          today,
        ),
      );
    } catch (error) {
      if (error instanceof AssistantError) throw new BadGatewayException('The assistant could not be reached. Fill it in by hand.');
      throw error;
    }

    const parsed = readReply(reply, accounts, spendable, today);
    if (!parsed) throw new UnprocessableEntityException('Could not find an amount in that. Try "Lunch 250".');
    return parsed;
  }
}
