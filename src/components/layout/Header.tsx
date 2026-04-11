'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { LogoHeader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { emitHashScrollRequest, scrollToHashTarget } from '@/lib/hashScroll';

const NAV_ITEMS = [
  { label: 'THESIS', href: '/#thesis' },
  { label: 'PRODUCTS', href: '/#products' },
  // { label: 'INSIGHT', href: '/#insight' },
  { label: 'ABOUT', href: '/about' },
];

export function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const hasScrolled = useScrollReveal();
  // On the home route the header is hidden until first scroll (tied to the
  // intro reveal experience). On all other routes it should be visible from
  // first paint — there is no intro sequence to coordinate with.
  const isHomeRoute = pathname === '/';
  const isVisible = !isHomeRoute || hasScrolled;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // --- Scroll lock refs and helpers (declared before handleNavClick) ---
  const scrollYRef = useRef(0);
  // When true, the scroll lock effect skips its unlock (handleNavClick did it)
  const manualUnlockRef = useRef(false);

  // Menu scroll-lock interacts with ThesisSectionMobile via an html dataset
  // marker. Setting body.position:fixed + top:-\${scrollY}px is the standard
  // iOS menu-lock pattern, but it has a hidden side effect: the browser
  // emits a synthetic scroll event where window.scrollY instantly drops from
  // the saved value to 0 (because body is no longer in document flow).
  //
  // ThesisSectionMobile's onScroll handler interprets that phantom event as
  // a legitimate reverse-crossing (prev=1625 > cached=812, curr=0 <= cached)
  // and fires capture('bottom', cached), adding html.thesis-scroll-lock and
  // locking the entire page — the bug that was reported on 2026-04-11.
  //
  // Fix: set documentElement.dataset.menuOpen='1' BEFORE the body lock so
  // the mobile scroll handler can ignore the phantom event, and clear it
  // AFTER the restore scroll event fires so the unlock path is filtered too.
  const MENU_OPEN_ATTR = 'menuOpen';

  const unlockScroll = useCallback((restoreScroll: boolean) => {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    if (restoreScroll) {
      const savedY = scrollYRef.current;
      // Two-stage rAF: the inner frame runs AFTER the restoration scrollTo
      // has been dispatched, so dataset.menuOpen is still set during the
      // event's onScroll handler and the guard can filter it.
      requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
        requestAnimationFrame(() => {
          delete document.documentElement.dataset[MENU_OPEN_ATTR];
        });
      });
    } else {
      // Manual unlock path (handleNavClick) does NOT restore scroll — the
      // caller scrolls programmatically to a hash target instead. Clear the
      // flag immediately so the hash-scroll event is NOT filtered and can
      // reach the pending-hash-capture branch in ThesisSectionMobile.
      delete document.documentElement.dataset[MENU_OPEN_ATTR];
    }
  }, []);

  /**
   * Handle nav link clicks. For same-page hash links (/#thesis, /#products),
   * use programmatic scrollTo which generates 'scroll' events, not
   * 'wheel'/'touch' events, so it bypasses the ThesisSection's GSAP Observer.
   */
  const handleNavClick = useCallback((e: React.MouseEvent, href: string) => {
    const hashMatch = href.match(/^\/?#(.+)$/);
    if (!hashMatch) {
      // Non-hash link (e.g. /about): close menu, let Next.js Link handle navigation
      setMenuOpen(false);
      return;
    }

    e.preventDefault();
    const hash = hashMatch[1];

    if (pathname === '/') {
      // Manually unlock scroll (without restoring position) before
      // closing menu, so the body is scrollable for scrollToHash.
      // Mark as manual so the menuOpen effect doesn't double-unlock.
      manualUnlockRef.current = true;
      unlockScroll(false);
      setMenuOpen(false);
      emitHashScrollRequest(hash);
      history.pushState(null, '', `#${hash}`);
      requestAnimationFrame(() => {
        scrollToHashTarget(hash);
      });
    } else {
      setMenuOpen(false);
      router.push(`/#${hash}`, { scroll: false });
    }
  }, [pathname, router, unlockScroll]);

  useEffect(() => {
    if (!headerRef.current) return;
    if (isVisible) {
      gsap.to(headerRef.current, {
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      });
    }
  }, [isVisible]);

  // Menu open animation (needs menuRef, only runs when menu mounts)
  useEffect(() => {
    if (!menuRef.current || !menuOpen) return;
    gsap.fromTo(
      menuRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
  }, [menuOpen]);

  // Scroll lock: freeze body in place while menu is open.
  // Uses position:fixed instead of overflow:hidden to avoid
  // interfering with GSAP ScrollTrigger pin calculations.
  //
  // See `unlockScroll` comment for the menu-open dataset flag lifecycle —
  // the flag must be SET before the body lock (so the phantom scrollY=0
  // event emitted by position:fixed is filtered by ThesisSectionMobile's
  // onScroll guard) and CLEARED after the restore scrollTo (so the
  // restoration event is also filtered).
  useEffect(() => {
    if (menuOpen) {
      scrollYRef.current = window.scrollY;
      // Must run BEFORE body.position:fixed so the phantom scroll event is
      // filtered at its source.
      document.documentElement.dataset[MENU_OPEN_ATTR] = '1';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
    } else {
      if (manualUnlockRef.current) {
        // handleNavClick already unlocked AND already cleared the dataset
        // flag (via unlockScroll(false)). Just reset the sentinel.
        manualUnlockRef.current = false;
      } else {
        unlockScroll(true);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
    };
  }, [menuOpen, unlockScroll]);

  // Close menu on Escape key
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <>
      {/* Header: mobile 54px / desktop 45px */}
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-50 h-[54px] md:h-[45px]"
        style={{
          transform: isHomeRoute ? 'translateY(-100%)' : 'translateY(0)',
          backgroundColor: 'var(--color-header-bg)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div className="relative mx-auto h-full w-full max-w-[1440px]">
          {/* Logo: mobile left-[22px] / desktop left-[calc(4.17%+24.5px)] */}
          <Link
            href="/"
            className="absolute top-1/2 -translate-y-1/2 left-[22px] md:left-[calc(4.17%+24.5px)]"
          >
            <LogoHeader className="h-[14px] w-[48px] md:h-[21px] md:w-[73px] text-[var(--color-accent)]" />
          </Link>

          {/* Desktop Nav */}
          <nav className="absolute top-1/2 -translate-y-1/2 right-0 hidden items-center md:flex"
            style={{ right: 'calc(8.33% - 38px)' }}>
            <div className="flex items-center gap-8">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-[12px] font-normal leading-[11px] tracking-[-0.12px] text-[var(--color-text)] transition-opacity hover:opacity-60"
                  onClick={(e) => handleNavClick(e, item.href)}
                >
                  {item.label}
                </Link>
              ))}
              <ThemeToggle />
            </div>
          </nav>

          {/* Mobile Hamburger — 44x44 minimum tap target (Apple HIG).
              Visual icon is 20x7, padding expands the hit area without
              changing the visual position. right-[10px] = 22px - 12px padding. */}
          <button
            className="absolute top-1/2 right-[10px] -translate-y-1/2 flex flex-col items-center justify-center gap-[5px] px-3 py-5 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span className="block h-[1px] w-5" style={{ backgroundColor: 'var(--color-text)' }} />
            <span className="block h-[1px] w-5" style={{ backgroundColor: 'var(--color-text)' }} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay — Figma: full-screen, left-aligned nav, 15px */}
      {menuOpen && (
        <div
          ref={menuRef}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          {/* Menu header: same height as mobile header, with logo + close button */}
          <div className="flex h-[54px] shrink-0 items-center justify-between px-[22px]">
            <LogoHeader className="h-[14px] w-[48px] text-[var(--color-accent)]" />
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              style={{ color: 'var(--color-text)' }}
              className="text-xl"
            >
              ✕
            </button>
          </div>

          {/* Nav links: left-aligned, Figma: 15px Regular, 50px gap */}
          <nav className="flex flex-col gap-[50px] px-[22px] pt-[40px]">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-[15px] font-normal tracking-[-0.15px] uppercase"
                style={{ color: 'var(--color-text)' }}
                onClick={(e) => handleNavClick(e, item.href)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Bottom: copyright + theme toggle */}
          <div className="mt-auto px-[22px] pb-[36px]">
            <div className="mb-4">
              <ThemeToggle />
            </div>
            <p className="text-[12px] text-[var(--color-sub-text1)]">
              &copy; 2025 - 2026 1SIX Technologies Inc.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
