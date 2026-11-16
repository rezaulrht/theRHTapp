'use client';

import { FieldValues } from '../../_parts/FieldValues';
import { FolderView } from '../../_parts/FolderView';
import { RemindersPanel } from '../../_parts/RemindersPanel';

/** One folder of the Vault, with its own fields and reminders below its contents. */
export function FolderPage({ id }: { id: string }) {
  return (
    <FolderView
      key={id}
      id={id}
      after={(contents) =>
        contents.folder ? (
          <div className="mt-12 grid gap-10 border-t border-hairline pt-8 lg:grid-cols-2">
            <FieldValues key={contents.folder.id} owner={{ folderId: contents.folder.id }} values={contents.folder.values} />
            <RemindersPanel owner={`folder:${contents.folder.id}`} defaultTitle={contents.folder.name} />
          </div>
        ) : null
      }
    />
  );
}
