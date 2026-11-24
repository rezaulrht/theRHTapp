import { BadGatewayException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiKeyService } from './ai-key.service';
import { AssistantError, askDeepSeek, askDeepSeekText, type AskOptions } from './deepseek';
import type { ChatMessage } from './expense-parser';

const WINDOW_MS = 60_000;
/** A ceiling on calls per minute, so a bug or a stuck button cannot spend the balance. */
const MAX_CALLS_PER_WINDOW = 30;

/** The one place that calls the model: it finds the key, limits the pace and turns failures into plain messages. */
@Injectable()
export class AiService {
  private calls: number[] = [];

  constructor(private readonly keys: AiKeyService) {}

  private async prepare(): Promise<string> {
    const apiKey = await this.keys.get();
    if (!apiKey) throw new ServiceUnavailableException('The assistant is not set up. Add a key in Settings > Assistant.');
    const now = Date.now();
    this.calls = this.calls.filter((at) => now - at < WINDOW_MS);
    if (this.calls.length >= MAX_CALLS_PER_WINDOW) {
      throw new HttpException('Too many assistant requests in a minute. Wait a little and try again.', 429);
    }
    this.calls.push(now);
    return apiKey;
  }

  private failure(error: unknown): never {
    if (error instanceof AssistantError) {
      throw new BadGatewayException('The assistant could not be reached. Try again in a moment.');
    }
    throw error;
  }

  /** The model's answer as a JSON object. */
  async json(messages: ChatMessage[], options?: AskOptions): Promise<unknown> {
    const apiKey = await this.prepare();
    try {
      return await askDeepSeek(apiKey, messages, fetch, options);
    } catch (error) {
      return this.failure(error);
    }
  }

  /** The model's answer as plain text. */
  async text(messages: ChatMessage[], options?: AskOptions): Promise<string> {
    const apiKey = await this.prepare();
    try {
      return await askDeepSeekText(apiKey, messages, fetch, options);
    } catch (error) {
      return this.failure(error);
    }
  }
}
