import Link from 'next/link';
import type { PathStep } from '@/lib/vault';

/** Vault › Education › Physics. The last step is where you are, so it is not a link. */
export function Breadcrumbs({ path, current = true }: { path: PathStep[]; current?: boolean }) {
  const steps = [{ id: 'root', name: 'Vault' }, ...path];
  return (
    <nav aria-label="Where this is" className="mb-3 text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sage">
        {steps.map((step, index) => {
          const last = current && index === steps.length - 1;
          return (
            <li key={step.id} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">›</span> : null}
              {last ? (
                <span aria-current="page" className="truncate text-ivory">
                  {step.name}
                </span>
              ) : (
                <Link
                  href={step.id === 'root' ? '/vault' : `/vault/f/${step.id}`}
                  className="truncate transition-colors duration-150 hover:text-brass"
                >
                  {step.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
