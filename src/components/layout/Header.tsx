'use client';

import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { LogoHeader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CONTACT_EMAIL, COPYRIGHT, NAV_ITEMS, isCurrentRoute } from '@/lib/site';

export function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const hasScrolled = useScrollReveal();
  // On the thesis route the header is hidden until first scroll (tied to the
  // intro reveal experience). On all other routes it should be visible from
  // first paint — there is no intro sequence to coordinate with.
  const isThesisRoute = pathname === '/thesis';
  const isWritingRoute = pathname.startsWith('/writing');
  const isVisible = !isThesisRoute || hasScrolled;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close from inside the dialog (close button, Escape) and hand focus back
  // to the trigger. Nav-link closes skip this: they navigate or scroll
  // programmatically, and refocusing the trigger there would compete with
  // that handoff.
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    requestAnimationFrame(() => {
      menuButtonRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // --- Scroll lock refs and helpers (declared before handleNavClick) ---
  const scrollYRef = useRef(0);
  // When true, the scroll lock effect skips its unlock (handleNavClick did it)
  const manualUnlockRef = useRef(false);
  // True between a menu open and its close, so the unlock path only runs
  // after the menu was actually opened (never on first mount)
  const wasMenuOpenRef = useRef(false);

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

  // Release a mobile menu lock before Next.js scrolls the destination to
  // the top. Restoring the old position here would undo that navigation.
  const handleNavClick = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!menuOpen) return;
    manualUnlockRef.current = true;
    unlockScroll(false);
    setMenuOpen(false);
  }, [menuOpen, unlockScroll]);

  useEffect(() => {
    if (!headerRef.current) return;
    if (isVisible) {
      gsap.to(headerRef.current, {
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      });
    } else if (isThesisRoute) {
      // Returning to the thesis route after visiting another page:
      // useScrollReveal resets isVisible to false, React applies
      // style={{ transform: 'translateY(-100%)' }}, and we need GSAP's
      // internal transform cache to match so the next gsap.to({y:0})
      // correctly interpolates from -100% instead of seeing a stale
      // cached y=0 and producing a zero-length (invisible) tween.
      gsap.set(headerRef.current, { y: '-100%' });
    }
  }, [isVisible, isThesisRoute]);

  // Menu open: the surface fades in, then the links settle in a short
  // stagger. Focus moves into the dialog so keyboard and screen-reader
  // users land inside it (aria-modal promises that). Reduced motion keeps
  // the fade and drops the travel. Layout effect: the from-state must be
  // applied before the first paint of the menu, or it flashes in fully
  // opaque for one frame.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !menuOpen) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power2.out' });
      if (!reduceMotion) {
        gsap.fromTo(
          '[data-menu-item]',
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.04, delay: 0.05 },
        );
      }
    }, menu);
    return () => ctx.revert();
  }, [menuOpen]);

  // aria-modal promises the page behind is out of reach: while the menu is
  // open its siblings (the header, the page, the footer) are inert, so focus
  // cannot reach them from anywhere, not only by Tab from inside the menu.
  useEffect(() => {
    const menu = menuRef.current;
    const parent = menu?.parentElement;
    if (!menu || !menuOpen || !parent) return;
    const behind = Array.from(parent.children).filter(
      (el): el is HTMLElement => el !== menu && el instanceof HTMLElement && !el.inert,
    );
    behind.forEach((el) => { el.inert = true; });
    return () => behind.forEach((el) => { el.inert = false; });
  }, [menuOpen]);

  // Keep Tab inside the open dialog.
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !menuRef.current) return;
    const focusables = menuRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, []);

  // Scroll lock: freeze body in place while menu is open.
  // Uses position:fixed instead of overflow:hidden to avoid
  // interfering with GSAP ScrollTrigger pin calculations.
  //
  // See `unlockScroll` comment for the menu-open dataset flag lifecycle —
  // the flag must be SET before the body lock (so the phantom scrollY=0
  // event emitted by position:fixed is filtered by ThesisSectionMobile's
  // onScroll guard) and CLEARED after the restore scrollTo (so the
  // restoration event is also filtered).
  //
  // The restore only runs when a menu was actually open. On first mount
  // menuOpen is already false, and an unconditional unlockScroll(true)
  // scrolled to the saved Y (0) one frame after load — throwing away the
  // browser's own scroll to a URL fragment, so a shared /#investors or
  // /writing/...#results link always landed at the top. Thesis uses
  // ScrollToTop to coordinate fragment navigation with its scroll pin.
  useEffect(() => {
    if (menuOpen) {
      wasMenuOpenRef.current = true;
      scrollYRef.current = window.scrollY;
      // Must run BEFORE body.position:fixed so the phantom scroll event is
      // filtered at its source.
      document.documentElement.dataset[MENU_OPEN_ATTR] = '1';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
    } else {
      if (!wasMenuOpenRef.current) return;
      wasMenuOpenRef.current = false;
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
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, closeMenu]);

  return (
    <>
      {/* Header: mobile 54px / desktop 45px (--site-header-h in globals.css,
          which About's sticky strip and mark also read). ThemeProvider's
          iOS status-bar retint finds this element by .site-header. Surface
          styles live in globals.css (.site-header) so reduced-transparency
          can override them; the transform stays inline because GSAP owns it. */}
      <header
        ref={headerRef}
        data-surface={isWritingRoute ? 'solid' : 'glass'}
        className="site-header fixed top-0 left-0 right-0 z-50 h-[var(--site-header-h)]"
        style={{ transform: isThesisRoute ? 'translateY(-100%)' : 'translateY(0)' }}
      >
        <div className="relative mx-auto h-full w-full max-w-[1440px]">
          {/* Logo: mobile left-[22px] / desktop left-[calc(4.17%+24.5px)].
              The link spans the header's full height and centres the mark
              with flex, so the hit area grows (vertically to the header,
              sideways by padding and a matching negative margin) without
              moving the mark off the header's centre line. */}
          <Link
            href="/"
            aria-label="1SIX home"
            className="absolute inset-y-0 left-[22px] md:left-[calc(4.17%+24.5px)] -mx-3 flex items-center px-3 transition-opacity duration-100 ease-out active:opacity-50"
          >
            <LogoHeader className="h-[14px] w-[48px] md:h-[21px] md:w-[73px] text-[var(--color-accent)]" />
          </Link>

          {/* Desktop Nav */}
          <nav
            aria-label="Primary"
            className="absolute top-1/2 -translate-y-1/2 right-0 hidden items-center md:flex"
            style={{ right: 'calc(8.33% - 38px)' }}
          >
            <div className="flex items-center gap-8">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isCurrentRoute(pathname, item.href) ? 'page' : undefined}
                  className="nav-link relative py-4 text-[12px] font-normal leading-none tracking-[0.06em] text-[var(--color-text)] transition-opacity duration-150 ease-out hover:opacity-60 active:opacity-50"
                  onClick={(e) => handleNavClick(e)}
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
            ref={menuButtonRef}
            className="absolute top-1/2 right-[10px] -translate-y-1/2 flex flex-col items-center justify-center gap-[5px] px-3 py-5 transition-opacity duration-100 ease-out active:opacity-50 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
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
          onKeyDown={handleMenuKeyDown}
        >
          {/* Menu header: same height as mobile header, with logo + close button */}
          <div className="flex h-[var(--site-header-h)] shrink-0 items-center justify-between pl-[22px] pr-[10px]">
            <LogoHeader className="h-[14px] w-[48px] text-[var(--color-accent)]" />
            <button
              ref={closeButtonRef}
              onClick={closeMenu}
              aria-label="Close menu"
              className="flex h-11 w-11 items-center justify-center text-[var(--color-text)] transition-opacity duration-100 ease-out active:opacity-50"
            >
              {/* Same 1px stroke as the hamburger it replaces */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                <path d="M3.5 3.5L16.5 16.5M16.5 3.5L3.5 16.5" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            </button>
          </div>

          {/* Nav links: left-aligned, Figma: 15px Regular, 50px rhythm
              (34px gap + 8px padding top and bottom keeps 50px between
              labels while giving each link a 34px-tall target). */}
          <nav aria-label="Primary" className="flex flex-col gap-[34px] px-[22px] pt-[32px]">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-menu-item
                aria-current={isCurrentRoute(pathname, item.href) ? 'page' : undefined}
                className="py-2 text-[15px] font-normal tracking-[0.04em] uppercase text-[var(--color-text)] transition-opacity duration-100 ease-out active:opacity-50 aria-[current=page]:text-[var(--color-accent-text)]"
                onClick={(e) => handleNavClick(e)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Bottom: contact, theme toggle, copyright */}
          <div className="mt-auto px-[22px] pb-[36px]">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              data-menu-item
              className="mb-6 inline-block py-2 text-[15px] text-[var(--color-text)] underline decoration-[color-mix(in_srgb,var(--color-text)_22%,transparent)] underline-offset-[6px] transition-opacity duration-100 ease-out active:opacity-50"
            >
              {CONTACT_EMAIL}
            </a>
            <div className="mb-4" data-menu-item>
              <ThemeToggle />
            </div>
            <p className="text-[12px] text-[var(--color-sub-text1)]">{COPYRIGHT}</p>
          </div>
        </div>
      )}
    </>
  );
}
