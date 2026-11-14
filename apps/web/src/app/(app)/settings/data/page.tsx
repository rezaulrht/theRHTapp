import type { Metadata } from 'next';
import { SectionHeading } from '../SaveBar';

export const metadata: Metadata = { title: 'Data settings' };

export default function DataSettingsPage() {
  return (
    <>
      <SectionHeading>Your data</SectionHeading>
      <p className="mb-6 max-w-prose text-sage">
        Download everything you have entered as one file. It holds your settings and reminders now, and
        will include your money, habits and vault records as those sections are built. Passwords and
        device keys are never included.
      </p>
      {/* A plain link, so the browser handles the download itself. */}
      <a
        href="/api/export"
        download
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-brass px-6 text-sm font-medium text-brass transition-colors duration-150 hover:bg-brass hover:text-ground"
      >
        Download my data
      </a>
    </>
  );
}
