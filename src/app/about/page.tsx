import type { Metadata } from 'next';
import { AboutCrossing } from '@/components/about/AboutCrossing';
import { getResearchEvidence } from '@/components/about/researchEvidence';
import './about.css';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Meet the 1SIX team — tech diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, Ken Ng, Loi Luu, Lemniscap, and Lambda.',
  openGraph: {
    title: 'About | 1SIX',
    description:
      'Meet the 1SIX team — tech diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, Ken Ng, Loi Luu, Lemniscap, and Lambda.',
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
      'Meet the 1SIX team — tech diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, Ken Ng, Loi Luu, Lemniscap, and Lambda.',
  },
  alternates: {
    canonical: 'https://1six.tech/about',
  },
};

export default function AboutPage() {
  return <AboutCrossing evidence={getResearchEvidence()} />;
}
