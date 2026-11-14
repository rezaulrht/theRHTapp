import { Button } from '@pa/ui';
import type { SaveState } from './useSettingsDraft';

/** The save button and its outcome, shared by every settings form. */
export function SaveBar({
  state,
  formError,
  otherErrors = [],
}: {
  state: SaveState;
  formError: string | null;
  otherErrors?: string[];
}) {
  const problems = [...(formError ? [formError] : []), ...otherErrors];
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <Button type="submit" loading={state === 'saving'}>
        Save changes
      </Button>
      <p role="status" className="flex items-center gap-2 text-sm text-brass">
        {state === 'saved' ? (
          <>
            {/* A tick that draws itself, so the save is felt as well as read. */}
            <svg
              data-saved-tick
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5l3.2 3.2L13 4.8" pathLength={1} className="draw-in" />
            </svg>
            Saved
          </>
        ) : (
          ''
        )}
      </p>
      {problems.length > 0 ? (
        <div role="alert" className="basis-full text-sm text-alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SectionHeading({ children }: { children: string }) {
  return <h2 className="mb-4 mt-10 font-display text-2xl text-ivory first:mt-0">{children}</h2>;
}
