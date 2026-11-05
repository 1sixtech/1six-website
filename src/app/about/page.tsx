import { preload } from 'react-dom';
import type { Metadata } from 'next';
import { AboutCrossing } from '@/components/about/AboutCrossing';
import { BACKERS, FIRMS } from '@/components/about/aboutData';
import { getResearchEvidence } from '@/components/about/researchEvidence';
import './about.css';

/** The backers named in search snippets and share cards, from the one confirmed list. */
const BACKED_BY = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format([
  ...BACKERS.map((backer) => backer.name),
  ...FIRMS,
]);
const DESCRIPTION = `Meet the 1SIX team — tech diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by ${BACKED_BY}.`;

/**
 * The Pretendard slice with the curly apostrophe (U+2019) of the h1 "we
 * don’t dream.": the root layout preloads only the slices every page uses.
 */
const APOSTROPHE_SLICE = '/fonts/pretendard-1.3.9/PretendardVariable.subset.71.woff2';

export const metadata: Metadata = {
  title: 'About',
  description:
    DESCRIPTION,
  openGraph: {
    title: 'About | 1SIX',
    description:
      DESCRIPTION,
    url: 'https://1six.tech/about',
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
    title: 'About | 1SIX',
    description:
      DESCRIPTION,
  },
  alternates: {
    canonical: 'https://1six.tech/about',
  },
};

export default function AboutPage() {
  preload(APOSTROPHE_SLICE, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  return <AboutCrossing evidence={getResearchEvidence()} />;
}
