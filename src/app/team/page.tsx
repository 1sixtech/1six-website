import type { Metadata } from 'next';
import { TeamHero } from '@/components/team/TeamHero';
import { TeamProfiles } from '@/components/team/TeamProfiles';
import { InvestorsSection } from '@/components/team/InvestorsSection';

export const metadata: Metadata = {
  title: 'Team & Investors',
  description:
    'Meet the 1SIX team — crypto diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, and leading web3 funds.',
  openGraph: {
    title: 'Team & Investors | 1SIX',
    description:
      'Meet the 1SIX team — crypto diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, and leading web3 funds.',
    url: 'https://1six.tech/team',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1SIX Team & Investors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Team & Investors | 1SIX',
    description:
      'Meet the 1SIX team — crypto diehards from Harvard, MIT, Ethereum, and ICPC World Finals. Backed by Naval Ravikant, Charlie Songhurst, and leading web3 funds.',
  },
  alternates: {
    canonical: 'https://1six.tech/team',
  },
};

export default function TeamPage() {
  return (
    <>
      <TeamHero />
      <TeamProfiles />
      <InvestorsSection />
      {/* CareersSection hidden until content is ready */}
    </>
  );
}
