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
  return ;
}
