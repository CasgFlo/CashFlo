import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api from './api';

export type ProPlan = 'monthly' | 'yearly' | 'lifetime';

export const PRO_PLANS: { id: ProPlan; name: string; price: string; period: string; note?: string; badge?: string }[] = [
  { id: 'yearly', name: 'Roczny', price: '99,99 zł', period: 'na rok', note: 'ok. 8,33 zł miesięcznie, 58% taniej niż miesięczny', badge: 'Najlepsza cena' },
  { id: 'monthly', name: 'Miesięczny', price: '19,99 zł', period: 'na miesiąc', note: 'Anulujesz w każdej chwili' },
  { id: 'lifetime', name: 'Bezterminowy', price: '199 zł', period: 'jednorazowo', note: 'Płacisz raz, Pro zostaje na zawsze' },
];

export const PLAN_NAMES: Record<ProPlan, string> = {
  monthly: 'miesięczny',
  yearly: 'roczny',
  lifetime: 'bezterminowy',
};

const isWeb = Platform.OS === 'web';
const webOrigin = () => (isWeb && typeof window !== 'undefined' ? window.location.origin : undefined);

/**
 * Opens Stripe's payment page for a plan.
 * On the phone it resolves with the checkout session id once the payment page closes;
 * in the browser the page itself navigates to Stripe and back, so it resolves with null.
 */
export async function startCheckout(plan: ProPlan): Promise<string | null> {
  const { data } = await api.post('/payments/checkout', {
    plan,
    platform: isWeb ? 'web' : 'native',
    origin_url: webOrigin(),
  });
  if (isWeb) {
    window.location.href = data.url;
    return null;
  }
  await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL('pro/success'));
  return data.session_id as string;
}

/** Opens Stripe's page for changing the payment method or cancelling the subscription. */
export async function openSubscriptionPortal(): Promise<void> {
  const { data } = await api.post('/payments/portal', {
    platform: isWeb ? 'web' : 'native',
    origin_url: webOrigin(),
  });
  if (isWeb) {
    window.location.href = data.url;
    return;
  }
  await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL('more'));
}
