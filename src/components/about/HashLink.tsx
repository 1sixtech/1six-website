'use client';

import type { AnchorHTMLAttributes, MouseEvent } from 'react';

interface HashLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: `#${string}`;
}

/**
 * In-page link that glides to its band instead of jumping, then hands focus
 * to the band so keyboard and screen-reader users continue from there.
 *
 * Smooth scrolling is applied per click rather than through
 * `html { scroll-behavior: smooth }`: Next.js would otherwise animate every
 * route change too, because the root layout does not opt into its
 * `data-scroll-behavior` handling. Reduced motion jumps instantly. Without
 * JavaScript it is a plain anchor.
 */
export function HashLink({ href, onClick, children, ...rest }: HashLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = document.getElementById(decodeURIComponent(href.slice(1)));
    if (!target) return;

    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion || event.detail === 0 ? 'auto' : 'smooth', block: 'start' });
    if (window.location.hash !== href) {
      window.history.pushState(null, '', href);
    }
    target.focus({ preventScroll: true });
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
