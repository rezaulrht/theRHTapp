'use client';

import { Button } from '@pa/ui';
import { useState } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { useAssistant } from '@/components/useAssistant';
import { Sheet, SheetPresence } from '@/components/Sheet';
import { habits, pointsText, type AppliesTo, type HabitItem, type Timing } from '@/lib/habits';
import { Confirm, MoveButtons, Problems, Section, moved, useAction } from '../parts';
import { ItemForm, PRAYER_NAMES, WEEK } from './ItemForm';
import { RoutineBuilder } from './RoutineBuilder';

export function timingSummary(timing: Timing): string {
  if (timing.kind === 'fixed') {
    if (timing.start && timing.due) return `${timing.start} to ${timing.due}`;
    if (timing.due) return `By ${timing.due}`;
    if (timing.start) return `From ${timing.start}`;
    return 'Any time';
  }
  if (timing.kind === 'prayer') {
    const name = `${PRAYER_NAMES[timing.prayer]} prayer`;
    if (timing.start && timing.end) return `${name}, ${timing.start} to ${timing.end}`;
    if (timing.end) return `${name}, by ${timing.end}`;
    if (timing.start) return `${name}, from ${timing.start}`;
    return name;
  }
  return `${timing.target} times, every ${timing.everyMinutes} minutes, ${timing.start} to ${timing.end}`;
}

function daysSummary(appliesTo: AppliesTo, dayTypeName: (id: string) => string): string {
  if (appliesTo.kind === 'dayTypes') return appliesTo.dayTypeIds.map(dayTypeName).join(', ');
  if (appliesTo.days.length === 7) return 'Every day';
  return WEEK.filter((day) => appliesTo.days.includes(day.value))
    .map((day) => day.short)
    .join(', ');
}

function ItemRow({
  item,
  index,
  count,
  dayTypeName,
  onMove,
  onEdit,
  onChanged,
}: {
  item: HabitItem;
  index: number;
  count: number;
  dayTypeName(id: string): string;
  onMove(by: -1 | 1): void;
  onEdit(): void;
  onChanged(): Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const pause = useAction();
  const remove = useAction();

  return (
    <li className="border-b border-hairline py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-label={`Edit ${item.name}`}
          onClick={onEdit}
          className="min-w-0 flex-1 py-1 text-left transition-colors duration-150 hover:text-brass"
        >
          <span className={`block truncate ${item.paused ? 'text-sage' : 'text-ivory'}`}>
            {item.name}
            {item.paused ? <span className="ml-2 text-xs text-brass">Paused</span> : null}
          </span>
          <span className="block text-sm text-sage">
            {pointsText(item.points)} {item.points === 100 ? 'point' : 'points'} · {timingSummary(item.timing)} ·{' '}
            {daysSummary(item.appliesTo, dayTypeName)}
          </span>
        </button>
        <span className="flex items-center">
          <MoveButtons name={item.name} index={index} count={count} onMove={onMove} />
          <Button
            variant="quiet"
            aria-label={`${item.paused ? 'Resume' : 'Pause'} ${item.name}`}
            loading={pause.busy}
            onClick={async () => {
              if (await pause.run(() => habits.updateItem(item.id, { paused: !item.paused }))) await onChanged();
            }}
          >
            {item.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="quiet" aria-label={`Remove ${item.name}`} onClick={() => setConfirming(true)} className="-mr-6">
            Remove
          </Button>
        </span>
      </div>
      <Problems list={[...pause.problems([]), ...remove.problems([])]} />
      {confirming ? (
        <Confirm
          question={`Remove ${item.name} from the routine? Past days keep it, with the points it earned or lost.`}
          yes="Yes, remove it"
          no="Keep it"
          busy={remove.busy}
          onNo={() => setConfirming(false)}
          onYes={async () => {
            if (await remove.run(() => habits.removeItem(item.id))) await onChanged();
            else setConfirming(false);
          }}
        />
      ) : null}
    </li>
  );
}

/** The routine: every item, in order, with ways to change, pause, reorder and remove it. */
export function ItemsEditor({ items, onChanged }: { items: HabitItem[]; onChanged(): Promise<void> }) {
  const { settings } = useSettings();
  const dayTypes = settings?.['general.dayTypes'] ?? [];
  const dayTypeName = (id: string) => dayTypes.find((dayType) => dayType.id === id)?.name ?? id;
  const [editing, setEditing] = useState<HabitItem | 'new' | null>(null);
  const [building, setBuilding] = useState(false);
  const assistant = useAssistant();
  const reorder = useAction();

  async function move(index: number, by: -1 | 1) {
    if (await reorder.run(() => habits.reorderItems(moved(items, index, by)))) await onChanged();
  }

  return (
    <Section
      title="Routine"
      intro="Everything on your day, with its points and when it is due. Changes apply from today; past days keep the rules they were scored with."
    >
      {items.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sage">Nothing on the routine yet.</p>
      ) : (
        <ul aria-label="Routine" className="border-t border-hairline">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              dayTypeName={dayTypeName}
              onMove={(by) => void move(index, by)}
              onEdit={() => setEditing(item)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <Problems list={reorder.problems([])} />

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setEditing('new')}>
          Add an item
        </Button>
        {assistant ? (
          <Button variant="outline" onClick={() => setBuilding(true)}>
            Build with the assistant
          </Button>
        ) : null}
      </div>

      <SheetPresence>
        {building ? (
          <RoutineBuilder
            key="builder"
            onClose={() => setBuilding(false)}
            onAdded={() => {
              setBuilding(false);
              void onChanged();
            }}
          />
        ) : null}
        {editing ? (
          <Sheet key="item" title={editing === 'new' ? 'New item' : editing.name} onClose={() => setEditing(null)}>
            <ItemForm
              item={editing === 'new' ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void onChanged();
              }}
            />
          </Sheet>
        ) : null}
      </SheetPresence>
    </Section>
  );
}
