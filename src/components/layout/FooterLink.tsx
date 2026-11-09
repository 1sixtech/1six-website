'use client';

import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { scrollToPageTop } from '@/lib/hashScroll';
import { isPlainLeftClick } from '@/lib/site';

interface FooterLinkProps {
  href: string;
  className: string;
  children: ReactNode;
}

/**
 * The footer's Thesis link, pressed on Thesis, goes to Hero as the header's
 * does. Left to Next it does nothing on plain /thesis. From a section link it
 * jumps to the top and keeps the hash, and on a phone that jump looks like
 * scrolling back into Thesis, which locks the visitor on the last slide.
 *
 * Focus moves too: left on this link, far below the screen, the next Tab would
 * scroll straight back down to the footer. The header's link needs no such
 * handoff because the header stays on screen. The landmark is focusable only
 * for this moment: permanently, any click inside it would take focus, and the
 * next Tab would leave the visitor's place in a long article.
 */
export function FooterLink({ href, className, children }: FooterLinkProps) {
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== '/thesis' || href !== '/thesis' || !isPlainLeftClick(event)) return;
    event.preventDefault();
    scrollToPageTop();
    const main = document.getElementById('main-content');
    if (!main) return;
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    const release = () => main.removeAttribute('tabindex');
    main.addEventListener('blur', release, { once: true });
    // Browser Back keeps focus where it is, and main outlives the route.
    window.addEventListener('popstate', release, { once: true });
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
