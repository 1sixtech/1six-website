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

      <div className="h-20" /> {/* 80px gap between Map and Product cards (Figma spec) */}

      <ScrollRevealWrapper y={40} duration={0.8} delay={0}>
        <ProductCard
          product="nevada-tv"
          title="Nevada TV"
          description="a 24/7/365 realtime broadcasting layer for the crypto-native world. streaming markets, traders, and narratives without interruption."
          ctaLabel="Start Watching"
          ctaHref="https://live.nevada.app"
        />
      </ScrollRevealWrapper>

      <ScrollRevealWrapper y={40} duration={0.8} delay={0.15}>
        <ProductCard
          product="nevada-trade"
          title="Nevada Trade"
          description="the first trading execution layer where markets are lived. a social trading environment where users watch, discuss, and experience together."
          ctaLabel="Start Trading"
          ctaHref="https://trade.nevada.app"
        />
      </ScrollRevealWrapper>

      <div className="h-[100px] md:h-[140px]" />

      {/* Insight section hidden until content is ready */}
    </>
  );
}
