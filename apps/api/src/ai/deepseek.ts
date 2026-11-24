import type { ChatMessage } from './expense-parser';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

export class AssistantError extends Error {}

export interface AskOptions {
  /** The most the answer may run to. A short cap keeps each call cheap. */
  maxTokens?: number;
}

/** Sends the messages and returns the text the model wrote. Throws AssistantError when the service fails or is slow. */
async function complete(
  apiKey: string,
  messages: ChatMessage[],
  json: boolean,
  send: typeof fetch,
  { maxTokens = 200 }: AskOptions,
): Promise<string> {
  let response: Response;
  try {
    response = await send(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        temperature: json ? 0 : 0.3,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(json ? 15_000 : 30_000),
    });
  } catch {
    throw new AssistantError('The assistant did not answer in time');
  }
  if (!response.ok) throw new AssistantError(`The assistant answered with ${response.status}`);

  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') throw new Error('empty');
    return content;
  } catch {
    throw new AssistantError('The assistant sent back something unreadable');
  }
}

/** Asks for a JSON object and returns it parsed. */
export async function askDeepSeek(
  apiKey: string,
  messages: ChatMessage[],
  send: typeof fetch = fetch,
  options: AskOptions = {},
): Promise<unknown> {
  const content = await complete(apiKey, messages, true, send, options);
  try {
    return JSON.parse(content);
  } catch {
    throw new AssistantError('The assistant sent back something unreadable');
  }
}

/** Asks for plain text, for answers that are read by a person. */
export async function askDeepSeekText(
  apiKey: string,
  messages: ChatMessage[],
  send: typeof fetch = fetch,
  options: AskOptions = { maxTokens: 500 },
): Promise<string> {
  return (await complete(apiKey, messages, false, send, options)).trim();
}
