import { redirect } from 'next/navigation';
import { settingsSections } from './sections';

export default function SettingsIndexPage(): never {
  redirect(settingsSections[0]!.href);
}
