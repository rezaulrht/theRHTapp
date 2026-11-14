import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const replace = vi.fn();
let nextParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (key: string) => (key === 'next' ? nextParam : null) }),
}));

function respond(status: number, body?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

async function submit() {
  await userEvent.type(screen.getByLabelText('Email'), 'me@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    replace.mockReset();
    nextParam = null;
  });

  it('never falls back to a GET form, which would put the password in the address bar', () => {
    // If the form is submitted before the page's script has loaded, the
    // browser submits it natively using this method.
    const { container } = render(<LoginForm />);
    expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  });

  it('sends the email and password and goes to today', async () => {
    respond(204);
    render(<LoginForm />);
    await submit();

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'me@example.test',
      password: 'correct horse battery',
    });
    expect(replace).toHaveBeenCalledWith('/today');
  });

  it('returns to the page the owner was on', async () => {
    nextParam = '/settings/notifications';
    respond(204);
    render(<LoginForm />);
    await submit();
    expect(replace).toHaveBeenCalledWith('/settings/notifications');
  });

  it('ignores a next that points at another site', async () => {
    nextParam = 'https://evil.example';
    respond(204);
    render(<LoginForm />);
    await submit();
    expect(replace).toHaveBeenCalledWith('/today');
  });

  it('shows the server message when the password is wrong', async () => {
    respond(401, { message: 'Email or password is wrong' });
    render(<LoginForm />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong');
    expect(replace).not.toHaveBeenCalled();
  });

  it('says how long to wait when locked out', async () => {
    respond(423, { message: 'Too many attempts. Try again later.', retryAfterSeconds: 14 * 60 + 5 });
    render(<LoginForm />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 15 minutes.');
  });

  it('says 1 minute, not 1 minutes', async () => {
    respond(423, { message: 'Too many attempts. Try again later.', retryAfterSeconds: 20 });
    render(<LoginForm />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 1 minute.');
  });
});
