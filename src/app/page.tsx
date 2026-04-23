import { HeroSection } from '@/components/home/HeroSection';
import { ThesisSection } from '@/components/home/ThesisSection';
import { ThesisGraph } from '@/components/home/ThesisGraph';
import { ProductsHeading } from '@/components/home/ProductsHeading';
import { ProductMap } from '@/components/home/ProductMap';
import { ProductCard } from '@/components/home/ProductCard';
import { ScrollRevealWrapper } from '@/components/ui/ScrollRevealWrapper';
import { ScrollToTop } from '@/components/ui/ScrollToTop';

export default function HomePage() {
  return (
    <>
      <ScrollToTop />
      <HeroSection />
      <ThesisSection />
      <ThesisGraph />

      <ScrollRevealWrapper y={30} duration={0.8}>
        <ProductsHeading />
      </ScrollRevealWrapper>

      <ProductMap />

      <div className="h-[100px] md:h-[140px]" />

      {/* Insight section hidden until content is ready */}
    </>
  );
}
