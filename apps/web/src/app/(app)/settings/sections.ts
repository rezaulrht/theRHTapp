export interface SettingsSection {
  href: string;
  label: string;
}

/**
 * The pages listed in the settings sub-navigation. Money, Habits and Vault
 * each add their own entry here when they are built.
 */
export const settingsSections: SettingsSection[] = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/money', label: 'Money' },
  { href: '/settings/habits', label: 'Habits' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/data', label: 'Data' },
];
