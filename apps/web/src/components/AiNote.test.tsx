import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiNote } from './AiNote';

describe('AiNote', () => {
  it('shows nothing until it is pressed, then the text, and can ask again', async () => {
    const load = vi.fn().mockResolvedValueOnce({ text: 'First answer.' }).mockResolvedValueOnce({ text: 'Second answer.' });
    render(<AiNote label="Find patterns" load={load} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Find patterns' }));
    expect(await screen.findByText('First answer.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(await screen.findByText('Second answer.')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says plainly when it fails, and keeps the button to try again', async () => {
    render(<AiNote label="Budget advice" load={() => Promise.reject(new Error('The assistant could not be reached.'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Budget advice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant could not be reached.');
    expect(screen.getByRole('button', { name: 'Budget advice' })).toBeInTheDocument();
  });
});
