import { Category } from './types';
import { chartPalette } from '../contexts/ThemeContext';

export type CategoryLookup = (name: string, type?: 'expense' | 'income') => Category | undefined;

/** Find a category by name (and type), so lists and charts can show its icon and color. */
export function makeCategoryLookup(categories: Category[]): CategoryLookup {
  const byKey = new Map<string, Category>();
  const byName = new Map<string, Category>();
  for (const c of categories) {
    byKey.set(`${c.type || 'expense'}:${c.name.toLowerCase()}`, c);
    if (!byName.has(c.name.toLowerCase())) byName.set(c.name.toLowerCase(), c);
  }
  return (name, type) => {
    const key = name.toLowerCase();
    return (type && byKey.get(`${type}:${key}`)) || byName.get(key);
  };
}

/** Color for a category in charts: its own color, or one from the chart palette. */
export function categoryColor(lookup: CategoryLookup, name: string, index: number): string {
  return lookup(name, 'expense')?.color || chartPalette[index % chartPalette.length];
}

// Icons offered when creating a category
export const CATEGORY_ICON_CHOICES = [
  'cart', 'fast-food', 'cafe', 'beer', 'car', 'bus', 'airplane', 'home',
  'flash', 'water', 'wifi', 'phone-portrait', 'tv', 'game-controller', 'film', 'musical-notes',
  'shirt', 'cut', 'medical', 'fitness', 'paw', 'school', 'book', 'gift',
  'heart', 'briefcase', 'card', 'cash', 'wallet', 'trending-up', 'construct', 'ellipsis-horizontal',
];

// Colors offered when creating a category
export const CATEGORY_COLOR_CHOICES = [
  '#E8655A', '#E38B3C', '#F2B53A', '#7CB342', '#178A55', '#0F6B54',
  '#2E9CB8', '#4C7BD9', '#5B67D6', '#9C6ADE', '#D9577E', '#7D8A84',
];
