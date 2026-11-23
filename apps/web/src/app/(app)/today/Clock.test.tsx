import { act, render, screen } from '@testing-library/react';
import { Clock } from './Clock';

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows hours, minutes and seconds in the given time zone, each with its label', () => {
    vi.setSystemTime(new Date('2026-11-13T11:09:59.200Z')); // 17:09:59 in Dhaka
    render(<Clock timeZone="Asia/Dhaka" />);

    const clock = screen.getByRole('timer', { name: 'Current time' });
    expect(clock).toHaveTextContent('05');
    expect(clock).toHaveTextContent('09');
    expect(clock).toHaveTextContent('59');
    expect(clock).toHaveTextContent('pm');
    expect(clock).toHaveTextContent('hr');
    expect(clock).toHaveTextContent('min');
    expect(clock).toHaveTextContent('sec');
  });

  it('moves on every second, and carries into the next minute', () => {
    vi.setSystemTime(new Date('2026-11-13T11:09:59.200Z'));
    render(<Clock timeZone="Asia/Dhaka" />);
    const digits = () =>
      [...screen.getByRole('timer').querySelectorAll('[data-unit]')].map((unit) => unit.textContent);

    expect(digits()).toEqual(['05', '09', '59']);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(digits()).toEqual(['05', '10', '00']);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(digits()).toEqual(['05', '10', '01']);
  });

  it('stops ticking when it leaves the page', () => {
    vi.setSystemTime(new Date('2026-11-13T11:09:59.200Z'));
    const { unmount } = render(<Clock timeZone="Asia/Dhaka" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
