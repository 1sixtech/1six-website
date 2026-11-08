import type { Metadata } from 'next';
import { HeroSection } from '@/components/home/HeroSection';
import { ThesisSection } from '@/components/home/ThesisSection';
import { ThesisGraph } from '@/components/home/ThesisGraph';
import { ProductsHeading } from '@/components/home/ProductsHeading';
import { ProductMap } from '@/components/home/ProductMap';
import { ScrollRevealWrapper } from '@/components/ui/ScrollRevealWrapper';
import { ScrollToTop } from '@/components/ui/ScrollToTop';

export const metadata: Metadata = {
  title: 'Thesis',
  description: 'From experiment to everyday, everywhere. Internet-native finance for the next 84%.',
  alternates: { canonical: 'https://1six.tech/thesis' },
  openGraph: {
    title: 'Thesis | 1SIX',
    url: 'https://1six.tech/thesis',
    description: 'From experiment to everyday, everywhere. Internet-native finance for the next 84%.',
  },
};

export default function ThesisPage() {
  return (
    <>
      <ScrollToTop />
      <HeroSection />
      <ThesisSection />
      <ThesisGraph />

      <ScrollRevealWrapper>
        <ProductsHeading />
      </ScrollRevealWrapper>

      {/* Closes the page: the ASCII map with "the next 84%" as its caption */}
      <ProductMap />
    </>
  );
}
