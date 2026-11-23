import type { Metadata } from 'next';
import { AssistantSettings } from './AssistantSettings';

export const metadata: Metadata = { title: 'Assistant settings' };

export default function AssistantSettingsPage() {
  return <AssistantSettings />;
}
