import { format, isToday, isYesterday, isSameYear } from 'date-fns';
import { pl } from 'date-fns/locale';

const NBSP = ' ';

/** 1234.5 -> "1 234,50 zł" (Polish number format). */
export function formatCurrency(amount: number, options?: { hideZeroDecimals?: boolean }): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const showFraction = !(options?.hideZeroDecimals && fraction === '00');
  return `${negative ? '−' : ''}${grouped}${showFraction ? `,${fraction}` : ''}${NBSP}zł`;
}

/** Amount with + for income and − for expenses. */
export function formatSignedCurrency(amount: number, type: 'income' | 'expense'): string {
  return `${type === 'income' ? '+' : '−'}${formatCurrency(Math.abs(amount))}`;
}

/**
 * Reads an amount typed by the user. Accepts "12,50", "12.50" and "1 200".
 * Returns NaN when the text is not a valid amount.
 */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return parseFloat(cleaned);
}

/** Keeps only what can be part of an amount while typing (digits and one decimal separator). */
export function sanitizeAmountInput(text: string): string {
  let result = text.replace(/[^\d.,]/g, '').replace(/\./g, ',');
  const firstComma = result.indexOf(',');
  if (firstComma !== -1) {
    result = result.slice(0, firstComma + 1) + result.slice(firstComma + 1).replace(/,/g, '').slice(0, 2);
  }
  return result;
}

/**
 * Dates from the server are UTC but may come without a time zone marker.
 * Read them as UTC so they show the right day and time on the phone.
 */
export function parseServerDate(value: string): Date {
  return new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
}

/** "Dziś", "Wczoraj", "12 października" or "12 października 2025". */
export function formatDayLabel(date: Date): string {
  if (isToday(date)) return 'Dziś';
  if (isYesterday(date)) return 'Wczoraj';
  return format(date, isSameYear(date, new Date()) ? 'd MMMM' : 'd MMMM yyyy', { locale: pl });
}

/** "Październik 2026" */
export function formatMonthLabel(year: number, month: number): string {
  const label = format(new Date(year, month - 1, 1), 'LLLL yyyy', { locale: pl });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "12 paź" */
export function formatShortDate(date: Date): string {
  return format(date, 'd MMM', { locale: pl });
}

/** Turns an error from the server into a message for the user. */
export function apiErrorMessage(error: any, fallback: string): string {
  if (!error?.response) {
    return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
  }
  const detail = error.response?.data?.detail;
  const known: Record<string, string> = {
    'Invalid credentials': 'Nieprawidłowy e-mail lub hasło.',
    'Email already registered': 'Konto z tym adresem e-mail już istnieje.',
    'Invalid or expired code': 'Kod jest nieprawidłowy albo wygasł.',
    'Password reset is not available': 'Reset hasła jest chwilowo niedostępny. Napisz do nas: cashflo2026@gmail.com.',
    'Could not send e-mail': 'Nie udało się wysłać e-maila. Spróbuj za chwilę.',
    'Category already exists': 'Taka kategoria już istnieje.',
    'Receipt image is too large': 'Zdjęcie paragonu jest za duże. Przytnij je i spróbuj ponownie.',
    'Payments are not configured': 'Płatności są chwilowo niedostępne.',
    'Could not start payment': 'Nie udało się rozpocząć płatności. Spróbuj ponownie.',
    'User already has Pro': 'Masz już CashFlo Pro.',
  };
  if (typeof detail === 'string') {
    if (known[detail]) return known[detail];
    if (detail.startsWith('Free users can create')) {
      return detail.includes('goal')
        ? 'W wersji darmowej możesz mieć 1 cel. Przejdź na Pro, aby dodać więcej.'
        : 'W wersji darmowej możesz dodać 3 własne kategorie. Przejdź na Pro, aby dodać więcej.';
    }
  }
  return fallback;
}
