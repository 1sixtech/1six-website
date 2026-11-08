/**
 * About page content. Every entry here is a confirmed fact; do not add
 * names, roles, or claims without confirmation (see PRODUCT.md).
 */

export interface OriginGroup {
  /** The discipline the entry proves, shown as its origin tag. */
  discipline: string;
  names: string[];
}

export interface Backer {
  name: string;
  role: string;
}

export const ORIGINS: OriginGroup[] = [
  {
    discipline: 'institutions',
    names: ['Harvard College', 'Schwarzman Scholars'],
  },
  {
    discipline: 'competitive programming',
    names: ['IOI Medalists', 'ICPC World Finalists', 'Codeforces Grandmasters'],
  },
];

export const BACKERS: Backer[] = [
  { name: 'Naval Ravikant', role: 'investor in Twitter, Notion, Perplexity & more' },
  { name: 'Charlie Songhurst', role: 'Facebook, Board of Directors' },
  { name: 'Ken Ng', role: 'Uniswap Foundation, co-founder' },
  { name: 'Loi Luu', role: 'WBTC creator' },
];

export const FIRMS = ['Lemniscap', 'Lambda'];

// Pending confirmation; intentionally not rendered. See PRODUCT.md.
export const PENDING_PARTNERS = [
  'USA Esports Association',
  'KeSPA',
  'AESF',
  'IESF',
  'Lighter',
] as const;

export { CONTACT_EMAIL } from '@/lib/site';
