import { preload } from 'react-dom';
import type { Metadata } from 'next';
import { AboutCrossing } from '@/components/about/AboutCrossing';
import { BACKERS, FIRMS } from '@/components/about/aboutData';
import '@/components/about/about.css';

/** The backers named in search snippets and share cards, from the one confirmed list. */
const BACKED_BY = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format([
  ...BACKERS.map((backer) => backer.name),
  ...FIRMS,
]);
const DESCRIPTION = `We don't dream. We build. Meet 1SIX, the team building internet-native finance for the next 84%. Backed by ${BACKED_BY}.`;

/**
 * The Pretendard slice with the curly apostrophe (U+2019) of the h1 "we
 * don’t dream.": the root layout preloads only the slices every page uses.
 */
const APOSTROPHE_SLICE = '/fonts/pretendard-1.3.9/PretendardVariable.subset.71.woff2';

export const metadata: Metadata = {
  description:
    DESCRIPTION,
  openGraph: {
    title: '1SIX — we don’t dream. we build.',
    description:
      DESCRIPTION,
    url: 'https://1six.tech',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1SIX — we haven\'t crossed the 16% yet. Internet-native finance for the next 84%.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '1SIX — we don’t dream. we build.',
    description:
      DESCRIPTION,
  },
  alternates: {
    canonical: 'https://1six.tech',
  },
};

export default function HomePage() {
  preload(APOSTROPHE_SLICE, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  return <AboutCrossing />;
}
