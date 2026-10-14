import { Alert, Platform } from 'react-native';
import { FREE_CUSTOM_CATEGORY_LIMIT, FREE_GOAL_LIMIT, FREE_IMPORT_LIMIT, FREE_RECURRING_LIMIT } from './types';

export interface ProFeature {
  icon: string;
  title: string;
  free: string;
  pro: string;
}

/** What Pro adds. Every item works today. */
export const PRO_FEATURES: ProFeature[] = [
  {
    icon: 'cloud-upload',
    title: 'Import z banku i Excela',
    free: `${FREE_IMPORT_LIMIT} plik`,
    pro: 'Bez limitu',
  },
  {
    icon: 'repeat',
    title: 'Stałe płatności i subskrypcje',
    free: `${FREE_RECURRING_LIMIT}`,
    pro: 'Bez limitu',
  },
  {
    icon: 'document-text',
    title: 'Podsumowanie miesiąca',
    free: 'Skrót',
    pro: 'Pełne',
  },
  {
    icon: 'speedometer',
    title: 'Limity dla kategorii',
    free: '–',
    pro: 'Tak',
  },
  {
    icon: 'download',
    title: 'Eksport do Excela',
    free: '–',
    pro: 'Tak',
  },
  {
    icon: 'flag',
    title: 'Cele oszczędnościowe',
    free: `${FREE_GOAL_LIMIT}`,
    pro: 'Bez limitu',
  },
  {
    icon: 'pricetags',
    title: 'Własne kategorie',
    free: `${FREE_CUSTOM_CATEGORY_LIMIT}`,
    pro: 'Bez limitu',
  },
];

/**
 * Explains that something needs Pro and offers to open the Pro screen.
 * `openPro` is usually () => router.push('/pro/upgrade').
 */
export function promptPro(message: string, openPro: () => void, title = 'Funkcja CashFlo Pro'): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}\n\nPokazać, co daje Pro?`)) openPro();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Nie teraz', style: 'cancel' },
    { text: 'Zobacz Pro', onPress: openPro },
  ]);
}
