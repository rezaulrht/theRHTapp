'use client';

import type { HTMLAttributes, MouseEvent } from 'react';

/**
 * A panel with a soft brass light that follows the pointer, and a hairline
 * that draws itself around the edge on hover. On a phone, where there is no
 * pointer to follow, it gives slightly when pressed instead.
 */
export function SpotlightPanel({ className, children, onMouseMove, ...rest }: HTMLAttributes<HTMLDivElement>) {
  function track(event: MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
    onMouseMove?.(event);
  }

  return (
    <div
      onMouseMove={track}
      className={`group/spot relative isolate overflow-hidden rounded-[var(--radius-panel)] bg-panel p-5 transition-transform duration-300 ease-out active:scale-[0.985] md:p-6 ${className ?? ''}`}
      {...rest}
    >
      {/* The light. Only on devices that can hover; it would stick under a finger. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 [@media(hover:hover)]:group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(22rem circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--color-brass) 16%, transparent), transparent 65%)',
        }}
      />
      {/* The hairline: an outline whose dash is pulled back to nothing, then let out. */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" fill="none">
        <rect
          pathLength={1}
          className="stroke-brass/60 [stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/spot:[stroke-dashoffset:0] group-focus-within/spot:[stroke-dashoffset:0]"
          style={{ x: '0.5px', y: '0.5px', width: 'calc(100% - 1px)', height: 'calc(100% - 1px)', rx: 'var(--radius-panel)' }}
          strokeWidth={1}
        />
      </svg>
      {children}
    </div>
  );
}
