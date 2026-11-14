import type { Metadata } from 'next';
import { NotificationsForm } from './NotificationsForm';
import { TestReminder } from './TestReminder';

export const metadata: Metadata = { title: 'Notification settings' };

export default function NotificationSettingsPage() {
  return (
    <>
      <NotificationsForm />
      <div className="mt-10">
        <TestReminder />
      </div>
    </>
  );
}
