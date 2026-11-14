import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Amount, AppNav, Button, Field, Panel, Select, Toggle } from './index';

function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('Field', () => {
  it('labels its input', () => {
    render(<Field label="Email" name="email" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email');
  });

  it('shows its error and links it to the input', () => {
    render(<Field label="Email" name="email" error="Enter a valid email address" />);
    const input = screen.getByLabelText('Email');
    const error = screen.getByText('Enter a valid email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
  });

  it('is not marked invalid without an error', () => {
    render(<Field label="Email" name="email" />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Select', () => {
  it('labels its options and reports a change', async () => {
    const onChange = vi.fn();
    render(
      <Select label="Day type" defaultValue="workday" onChange={onChange}>
        <option value="workday">Workday</option>
        <option value="classday">Class day</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Day type'), 'classday');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Day type')).toHaveValue('classday');
  });
});

describe('Button', () => {
  it('is a plain button by default so it does not submit forms by accident', () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('type', 'button');
  });

  it('is disabled and announces busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save changes
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  it('changes on click and on Space', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Quiet hours" onChange={onChange} />);
    const toggle = screen.getByLabelText('Quiet hours');
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('Panel', () => {
  it('renders its children', () => {
    render(<Panel>Inside</Panel>);
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });
});

describe('Amount', () => {
  it('groups thousands', () => {
    setReducedMotion(false);
    render(<Amount value={42350} />);
    expect(screen.getByText('42,350')).toBeInTheDocument();
  });

  it('shows the currency symbol before the number', () => {
    setReducedMotion(false);
    render(<Amount value={235} currency="৳" />);
    expect(screen.getByText('৳235')).toBeInTheDocument();
  });

  it('keeps paisa when there are any', () => {
    setReducedMotion(false);
    render(<Amount value={12.5} />);
    expect(screen.getByText('12.50')).toBeInTheDocument();
  });

  it('shows the final value at once when motion is reduced', () => {
    setReducedMotion(true);
    render(<Amount value={42350} animate />);
    expect(screen.getByText('42,350')).toBeInTheDocument();
  });

  it('starts from zero when animating', () => {
    setReducedMotion(false);
    render(<Amount value={42350} animate />);
    expect(screen.queryByText('42,350')).not.toBeInTheDocument();
    // Screen readers get the real figure straight away.
    expect(screen.getByLabelText('42,350')).toBeInTheDocument();
  });
});

describe('AppNav', () => {
  const items = [
    { href: '/today', label: 'Today', icon: <span>t</span> },
    { href: '/money', label: 'Money', icon: <span>m</span> },
    { href: '/settings', label: 'Settings', icon: <span>s</span> },
  ];

  it('marks the current section', () => {
    render(<AppNav items={items} current="/money" />);
    expect(screen.getByRole('link', { name: /Money/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Today/ })).not.toHaveAttribute('aria-current');
  });

  it('keeps a section current on its inner pages', () => {
    render(<AppNav items={items} current="/settings/notifications" />);
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('aria-current', 'page');
  });

  it('links to each section', () => {
    render(<AppNav items={items} current="/today" />);
    expect(screen.getByRole('link', { name: /Money/ })).toHaveAttribute('href', '/money');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
