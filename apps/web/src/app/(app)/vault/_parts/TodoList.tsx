'use client';

import { Button, Field, Toggle } from '@pa/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { vault, type VaultTodo } from '@/lib/vault';
import { dayLabel } from '@/lib/money-text';

/** A folder's to-do list: a line of text, an optional due date, and a tick. */
export function TodoList({ folderId, todos, onChanged }: { folderId: string; todos: VaultTodo[]; onChanged(): void }) {
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remind, setRemind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    await run(() => vault.createTodo(folderId, { text: text.trim(), dueDate: dueDate || null, remind: Boolean(dueDate) && remind }));
    setText('');
    setDueDate('');
    setRemind(false);
    setBusy(false);
  }

  return (
    <section aria-labelledby="todo-heading" className="mt-12">
      <h2 id="todo-heading" className="mb-3 font-display text-xl text-ivory">
        To do
      </h2>
      {todos.length > 0 ? (
        <ul aria-label="To-do list" className="mb-4 border-t border-hairline">
          <AnimatePresence initial={false}>
            {todos.map((todo) => (
              <motion.li
                key={todo.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="flex items-center gap-3 border-b border-hairline py-2"
              >
                <input
                  type="checkbox"
                  aria-label={`Done: ${todo.text}`}
                  checked={todo.done}
                  onChange={(event) => void run(() => vault.updateTodo(todo.id, { done: event.target.checked }))}
                  className="size-5 shrink-0 accent-[var(--color-brass)]"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block ${todo.done ? 'text-sage line-through' : 'text-ivory'}`}>{todo.text}</span>
                  {todo.dueDate ? (
                    <span className="text-sm text-sage">
                      Due {dayLabel(todo.dueDate)}
                      {todo.remind ? ' · reminder at 9 am' : ''}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${todo.text}`}
                  onClick={() => void run(() => vault.deleteTodo(todo.id))}
                  className="grid size-10 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-alert"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      <form onSubmit={add} method="post" noValidate className="grid max-w-xl gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
        <Field label="New to-do" autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} />
        <Field label="Due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="[color-scheme:dark]" />
        <Button type="submit" variant="outline" loading={busy} disabled={!text.trim()}>
          Add
        </Button>
        {dueDate ? (
          <Toggle className="sm:col-span-3" label="Remind me that morning" checked={remind} onChange={(event) => setRemind(event.target.checked)} />
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
