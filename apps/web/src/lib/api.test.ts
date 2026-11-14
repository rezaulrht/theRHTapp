import { api, ApiError, navigation } from './api';

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

describe('api', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/settings?tab=general');
  });

  it('prefixes /api, sends JSON and returns the parsed body', async () => {
    const fetchMock = respond(200, { email: 'me@example.test' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api<{ email: string }>('/auth/me');

    expect(result).toEqual({ email: 'me@example.test' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('serialises a json body and sets the content type', async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);

    await api('/settings', { method: 'PATCH', json: { 'general.timezone': 'Asia/Dhaka' } });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"general.timezone":"Asia/Dhaka"}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for an empty 204', async () => {
    vi.stubGlobal('fetch', respond(204));
    expect(await api('/auth/logout', { method: 'POST' })).toBeUndefined();
  });

  it('throws ApiError with the server message and field errors on a 400', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        message: 'Some settings are not valid',
        errors: [{ path: 'general.quietHours.start', message: 'Use a 24-hour time such as 05:30' }],
      }),
    );

    const error = await api('/settings', { method: 'PATCH', json: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Some settings are not valid',
      errors: [{ path: 'general.quietHours.start', message: 'Use a 24-hour time such as 05:30' }],
    });
  });

  it('on a 401 sends the owner to log in and back to where they were', async () => {
    vi.stubGlobal('fetch', respond(401, { message: 'Log in to continue' }));
    const go = vi.spyOn(navigation, 'go').mockImplementation(() => {});

    await api('/settings').catch(() => {});

    expect(go).toHaveBeenCalledWith('/login?next=%2Fsettings%3Ftab%3Dgeneral');
  });

  it('does not redirect when the login request itself is refused', async () => {
    vi.stubGlobal('fetch', respond(401, { message: 'Email or password is wrong' }));
    const go = vi.spyOn(navigation, 'go').mockImplementation(() => {});

    const error = await api('/auth/login', { method: 'POST', json: {} }).catch((e: unknown) => e);

    expect(go).not.toHaveBeenCalled();
    expect(error).toMatchObject({ status: 401, message: 'Email or password is wrong' });
  });

  it('keeps extra fields from the error body', async () => {
    vi.stubGlobal('fetch', respond(423, { message: 'Too many attempts. Try again later.', retryAfterSeconds: 840 }));
    const error = await api('/auth/login', { method: 'POST', json: {} }).catch((e: unknown) => e);
    expect((error as ApiError).data).toMatchObject({ retryAfterSeconds: 840 });
  });

  it('gives a plain message when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await api('/settings').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, message: 'No connection. Check your internet and try again.' });
  });

  it('gives a plain message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));
    const error = await api('/settings').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, message: 'Something went wrong on the server. Try again.' });
  });
});
