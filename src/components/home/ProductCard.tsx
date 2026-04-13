'use client';

import type { ReactNode } from 'react';

import { AsciiProductCanvas } from '@/components/ascii/AsciiProduct';

interface ProductCardProps {
  product: 'nevada-tv' | 'nevada-trade';
  title: string;
  description: ReactNode;
  ctaLabel: string;
  ctaHref: string;
}

export function ProductCard({
  product,
  title,
  description,
  ctaLabel,
  ctaHref,
}: ProductCardProps) {
  return (
    <div className="w-full py-3">
      {/*
        Mobile (<768px): mx-[22px], vertical card, auto height
        Desktop (>=768px): max-w-[1440px] mx-auto, left-offset, horizontal 890x270
      */}
      <div className="mx-[22px] md:mx-auto md:w-full md:max-w-[1440px]">
        <div
          className="flex flex-col overflow-hidden rounded-lg md:ml-[calc(16.67%+35px)] md:w-[890px] md:h-[270px] md:flex-row md:rounded-none"
          style={{ backgroundColor: 'var(--color-card2)' }}
        >
          {/* ASCII art: mobile full-width 300px tall / desktop 320px wide full height */}
          <div
            className="relative h-[300px] w-full shrink-0 overflow-hidden md:h-auto md:w-[320px]"
            style={{ backgroundColor: 'var(--color-card)' }}
          >
            <AsciiProductCanvas product={product} />
          </div>

          {/* Content */}
          <div className="relative flex flex-1 flex-col justify-between p-5 md:p-7">
            <div>
              <p
                className="mb-2 text-[20px] md:text-[24px] font-medium leading-[1.2] tracking-[-0.4px] md:tracking-[-0.48px]"
                style={{ color: 'var(--color-text)' }}
              >
                {title}
              </p>
              <p
                className="max-w-[478px] text-[15px] md:text-[18px] font-normal leading-[1.25] tracking-[-0.3px] md:tracking-[-0.36px]"
                style={{ color: 'var(--color-text)' }}
              >
                {description}
              </p>
            </div>

            {/* CTA: mobile filled bg / desktop border-only absolute */}
            <div className="mt-4 flex justify-end md:mt-0 md:absolute md:bottom-[28px] md:right-[28px]">
              <a
                href={ctaHref}
                className="inline-flex h-[38px] w-[83px] items-center justify-center gap-[6px] rounded-[5.077px] text-[13px] font-normal tracking-[-0.13px] transition-colors bg-[var(--color-accent)] text-[#F7F2F2] md:h-[30px] md:w-[113px] md:rounded-[3.46px] md:bg-transparent md:text-[var(--color-accent)] md:border md:border-[var(--color-accent)] md:gap-0 md:hover:bg-[var(--color-accent)] md:hover:text-[#F7F2F2] md:hover:border-[var(--color-accent)]"
              >
                <span className="md:hidden">Start</span>
                <span className="hidden md:inline">{ctaLabel}</span>
                <svg
                  className="shrink-0 md:hidden"
                  width="11"
                  height="8"
                  viewBox="0 0 11 8"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10.354 4.354a.5.5 0 0 0 0-.708L7.172.464a.5.5 0 1 0-.708.708L9.293 4 6.464 6.828a.5.5 0 1 0 .708.708l3.182-3.182ZM0 4.5h10v-1H0v1Z"
                    fill="currentColor"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
