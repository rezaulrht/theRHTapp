export interface FieldError {
  /** Dotted path of the field the server rejected, e.g. `general.quietHours.start`. */
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    message: string,
    readonly errors?: FieldError[],
    /** The whole error body, for fields beyond message and errors. */
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Wrapped so tests can watch it; jsdom does not allow spying on `location`. */
export const navigation = {
  go(url: string): void {
    window.location.assign(url);
  },
};

export interface ApiInit extends Omit<RequestInit, 'body'> {
  /** Sent as the JSON request body. */
  json?: unknown;
}

/**
 * Calls the back end. `path` is relative to `/api`. Resolves with the parsed
 * JSON body (undefined for an empty reply) and rejects with an `ApiError`.
 * If the session has ended it sends the owner to the login page, which brings
 * them back here afterwards.
 */
export async function api<T = void>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  if (json !== undefined) requestHeaders.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: requestHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>;
  } catch {
    // Not JSON, for example a gateway error page.
  }
  const message =
    typeof data.message === 'string' ? data.message : 'Something went wrong on the server. Try again.';
  const errors = Array.isArray(data.errors) ? (data.errors as FieldError[]) : undefined;

  // A refused login is an answer to show on the form, not an ended session.
  if (response.status === 401 && !path.startsWith('/auth/login') && typeof window !== 'undefined') {
    const here = window.location.pathname + window.location.search;
    navigation.go(`/login?next=${encodeURIComponent(here)}`);
  }

  throw new ApiError(response.status, message, errors, data);
}
