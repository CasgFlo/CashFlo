// Well-known paid services. Kept short on purpose: it only pre-selects "To subskrypcja"
// when adding a repeated payment, and the user can always switch it off.
const SERVICES = [
  'netflix', 'spotify', 'hbo', 'disney', 'youtube', 'canal+', 'player.pl', 'polsat box', 'skyshowtime',
  'prime video', 'amazon prime', 'apple music', 'apple tv', 'icloud', 'tidal', 'deezer', 'audioteka',
  'storytel', 'legimi', 'empik go', 'xbox', 'playstation', 'nintendo', 'chatgpt', 'adobe', 'microsoft 365',
  'dropbox', 'multisport', 'medicover', 'luxmed', 'duolingo', 'babbel', 'tinder', 'patreon', 'twitch',
  'allegro smart', 'siłownia', 'silownia', 'subskrypcja',
];

/** Whether a repeated expense is probably a subscription (Netflix, Spotify, a gym...). */
export function looksLikeSubscription(description: string, category: string): boolean {
  const text = ` ${description.toLowerCase()} `;
  if (SERVICES.some((s) => text.includes(s))) return true;
  return category === 'Rozrywka';
}
