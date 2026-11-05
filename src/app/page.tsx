import { HeroSection } from '@/components/home/HeroSection';
import { ThesisSection } from '@/components/home/ThesisSection';
import { ThesisGraph } from '@/components/home/ThesisGraph';
import { ProductsHeading } from '@/components/home/ProductsHeading';
import { ProductMap } from '@/components/home/ProductMap';
import { ScrollRevealWrapper } from '@/components/ui/ScrollRevealWrapper';
import { ScrollToTop } from '@/components/ui/ScrollToTop';

export default function HomePage() {
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
