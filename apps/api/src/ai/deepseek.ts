import type { ChatMessage } from './expense-parser';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

export class AssistantError extends Error {}

/**
 * Sends the messages to DeepSeek and returns the JSON object it answered with.
 * Throws AssistantError when the service fails, is slow, or does not answer with JSON.
 */
export async function askDeepSeek(
  apiKey: string,
  messages: ChatMessage[],
  send: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await send(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AssistantError('The assistant did not answer in time');
  }
  if (!response.ok) throw new AssistantError(`The assistant answered with ${response.status}`);

  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('empty');
    return JSON.parse(content);
  } catch {
    throw new AssistantError('The assistant sent back something unreadable');
  }
}
