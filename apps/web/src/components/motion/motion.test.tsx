import { fireEvent, render, screen } from '@testing-library/react';
import { SaveBar } from '@/app/(app)/settings/SaveBar';
import { Reveal } from './Reveal';
import { SpotlightPanel } from './SpotlightPanel';
import { Stagger, StaggerItem } from './Stagger';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('is read as one word, not letter by letter', () => {
    render(<Wordmark text="Personal" />);
    const heading = screen.getByRole('heading', { name: 'Personal' });
    expect(heading).toBeInTheDocument();
    const letters = heading.querySelectorAll('[data-letter]');
    expect(letters).toHaveLength(8);
    expect([...letters].map((letter) => letter.textContent).join('')).toBe('Personal');
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('wraps a long name between words instead of cutting it off', () => {
    render(<Wordmark text="The R.H.T App" />);
    const heading = screen.getByRole('heading', { name: 'The R.H.T App' });
    const row = heading.querySelector('[aria-hidden="true"]') as HTMLElement;
    // Every letter is still there, in order, kept together one word at a time.
    expect([...row.children].map((word) => word.textContent)).toEqual(['The', 'R.H.T', 'App']);
    // The row may wrap, so a narrow phone never clips the last letters.
    expect(row.className).toContain('flex-wrap');
  });
});

describe('Reveal', () => {
  it('keeps its text in the page for screen readers and search', () => {
    render(
      <h1>
        <Reveal>Good morning</Reveal>
      </h1>,
    );
    expect(screen.getByRole('heading', { name: 'Good morning' })).toBeInTheDocument();
  });

  it('clips the text while it rises', () => {
    const { container } = render(<Reveal>Good morning</Reveal>);
    expect(container.firstElementChild).toHaveClass('overflow-hidden');
  });
});

describe('Stagger', () => {
  it('renders every item', () => {
    render(
      <Stagger>
        <StaggerItem>One</StaggerItem>
        <StaggerItem>Two</StaggerItem>
      </Stagger>,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });
});

describe('SpotlightPanel', () => {
  it('tracks the pointer so the light can follow it', () => {
    render(<SpotlightPanel data-testid="panel">Money</SpotlightPanel>);
    const panel = screen.getByTestId('panel');
    panel.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 300, height: 200, right: 400, bottom: 250, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;

    fireEvent.mouseMove(panel, { clientX: 250, clientY: 150 });

    expect(panel.style.getPropertyValue('--spot-x')).toBe('150px');
    expect(panel.style.getPropertyValue('--spot-y')).toBe('100px');
  });

  it('shows its content', () => {
    render(<SpotlightPanel>Money</SpotlightPanel>);
    expect(screen.getByText('Money')).toBeInTheDocument();
  });
});

describe('SaveBar', () => {
  it('draws a tick beside Saved', () => {
    const { container } = render(<SaveBar state="saved" formError={null} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(container.querySelector('svg[data-saved-tick]')).not.toBeNull();
  });

  it('shows no tick before saving', () => {
    const { container } = render(<SaveBar state="idle" formError={null} />);
    expect(container.querySelector('svg[data-saved-tick]')).toBeNull();
  });
});
