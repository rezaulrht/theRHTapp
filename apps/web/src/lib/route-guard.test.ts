import { redirectFor, safeNextPath } from './route-guard';

describe('safeNextPath', () => {
  it.each([
    ['/settings', '/settings'],
    ['/settings/notifications?x=1', '/settings/notifications?x=1'],
    [null, '/today'],
    ['', '/today'],
    ['https://evil.example', '/today'],
    ['//evil.example', '/today'],
    ['/\\evil.example', '/today'],
    ['settings', '/today'],
    ['/login', '/today'],
    ['/login?next=/settings', '/today'],
  ])('%s -> %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('redirectFor', () => {
  it('sends a logged-out visitor to log in, remembering the page', () => {
    expect(redirectFor('/settings', '?tab=data', false)).toBe('/login?next=%2Fsettings%3Ftab%3Ddata');
    expect(redirectFor('/today', '', false)).toBe('/login?next=%2Ftoday');
  });

  it('does not add next for the front page', () => {
    expect(redirectFor('/', '', false)).toBe('/login');
  });

  it('lets a logged-in visitor through', () => {
    expect(redirectFor('/settings', '', true)).toBeNull();
  });

  it('sends a logged-in visitor away from the login page', () => {
    expect(redirectFor('/login', '', true)).toBe('/today');
  });

  it('sends the front page to today when logged in', () => {
    expect(redirectFor('/', '', true)).toBe('/today');
  });

  it('leaves the login and offline pages open to everyone', () => {
    expect(redirectFor('/login', '', false)).toBeNull();
    expect(redirectFor('/offline', '', false)).toBeNull();
    expect(redirectFor('/offline', '', true)).toBeNull();
  });
});
