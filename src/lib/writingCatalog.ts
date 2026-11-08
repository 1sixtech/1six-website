export const WRITING_CATEGORIES = [
  { id: 'research', label: 'Research', empty: 'No research articles yet.' },
  { id: 'op-ed', label: 'Op-ed', empty: 'No op-eds yet.' },
  { id: 'announcements', label: 'Announcements', empty: 'No announcements yet.' },
] as const;

export type WritingCategory = typeof WRITING_CATEGORIES[number]['id'];

export interface Writer {
  slug: string;
  name: string;
  bio: string;
  credentials: string[];
}

/** Public author details supplied in the November 2026 website brief. */
export const WRITERS: Writer[] = [
  {
    slug: 'dean-n',
    name: 'Dean N.',
    bio: 'Dean writes about financial infrastructure and how it performs in practice.',
    credentials: ['First Prize, ICPC Asia Regional — 2021 & 2022'],
  },
];

export function getWriter(slug: string): Writer | undefined {
  return WRITERS.find((writer) => writer.slug === slug);
}

export function getWriterByName(name: string): Writer | undefined {
  return WRITERS.find((writer) => writer.name === name.trim());
}

export function isWritingCategory(value: string): value is WritingCategory {
  return WRITING_CATEGORIES.some((category) => category.id === value);
}

export function categoryLabel(category: WritingCategory): string {
  return WRITING_CATEGORIES.find((item) => item.id === category)!.label;
}

/** URL filters are allowlisted; an unknown query shows the complete index. */
export function selectWritingCategory(value: string | null): WritingCategory | 'all' {
  return value && isWritingCategory(value) ? value : 'all';
}
