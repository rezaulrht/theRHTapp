import type { Metadata } from 'next';
import { PushControl } from '@/components/PushControl';
import { SectionHeading } from '../SaveBar';
import { NotificationsForm } from './NotificationsForm';
import { TestReminder } from './TestReminder';

export const metadata: Metadata = { title: 'Notification settings' };

export default function NotificationSettingsPage() {
  return (
    <>
      <SectionHeading>This device</SectionHeading>
      <div className="mb-10">
        <PushControl />
      </div>
      <NotificationsForm />
      <div className="mt-10">
        <TestReminder />
      </div>
    </>
  );
}
