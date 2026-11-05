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
    discipline: 'research & academia',
    names: ['MIT', 'Harvard', 'Tsinghua', 'Schwarzman Scholars', 'PhD programs'],
  },
  {
    discipline: 'protocols',
    names: ['Ethereum Foundation', 'Starknet Foundation'],
  },
  {
    discipline: 'competitive programming',
    names: ['ICPC World Finalists', 'Codeforces Grandmasters'],
  },
  {
    discipline: 'markets',
    names: ['Needham & Co.'],
  },
  {
    discipline: 'service',
    names: ['special forces'],
  },
];

export const BACKERS: Backer[] = [
  { name: 'Naval Ravikant', role: 'investor in Twitter, Notion, Perplexity & more' },
  { name: 'Charlie Songhurst', role: 'Facebook, Board of Directors' },
  { name: 'Ken Ng', role: 'Uniswap Foundation, co-founder' },
  { name: 'Loi Luu', role: 'WBTC creator' },
];

export const FIRMS = ['Lemniscap', 'Lambda'];

export { CONTACT_EMAIL } from '@/lib/site';

/**
 * Fill level per band, in percent: the statement starts at the first 16%,
 * and each of the four bands after it carries a quarter of the next 84%.
 */
export const CROSSING_LEVELS = [16, 37, 58, 79, 100] as const;
