import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Analytics } from '@vercel/analytics/next';
import { HomeIntroMount } from '@/components/intro/HomeIntroMount';

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://1six.tech'),

  title: {
    template: '%s | 1SIX',
    default: '1SIX - Leading Web3 Industry to Cross the Chasm',
  },

  description:
    '1SIX builds infrastructure for crypto-native broadcasting and trading, pushing the web3 industry past the 16% adoption line.',

  keywords: [
    '1SIX',
    '1SIX Technologies',
    'web3 infrastructure',
    'crypto broadcasting',
    'crypto trading',
    'blockchain adoption',
    'Nevada TV',
    'Nevada Trade',
    'decentralized media',
    'crypto streaming',
    'social trading',
  ],

  authors: [{ name: '1SIX Technologies' }],
  creator: '1SIX Technologies',
  publisher: '1SIX Technologies',

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://1six.tech',
    siteName: '1SIX Technologies',
    title: '1SIX - Leading Web3 Industry to Cross the Chasm',
    description:
      '1SIX builds infrastructure for crypto-native broadcasting and trading, pushing the web3 industry past the 16% adoption line.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1SIX Technologies - Leading web3 industry to cross the chasm',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    site: '@1sixtech',
    creator: '@1sixtech',
    title: '1SIX - Leading Web3 Industry to Cross the Chasm',
    description:
      '1SIX builds infrastructure for crypto-native broadcasting and trading, pushing the web3 industry past the 16% adoption line.',
    images: ['/og-image.png'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  alternates: {
    canonical: 'https://1six.tech',
  },

  icons: {
    icon: '/favicon.png',
    apple: '/apple-icon.png',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '1SIX Technologies',
  url: 'https://1six.tech',
  logo: 'https://1six.tech/favicon.png',
  description:
    '1SIX builds infrastructure for crypto-native broadcasting and trading, pushing the web3 industry past the 16% adoption line.',
  sameAs: [
    'https://x.com/1sixtech',
    'https://www.youtube.com/@nevada-app',
    'https://discord.gg/wR4srtyhuU',
    'https://www.threads.com/@live.nevada.app',
    'https://www.instagram.com/live.nevada.app',
    'https://www.tiktok.com/@live.nevada.app',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* Blocking script to prevent theme flash (FOIT) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('theme');
                var theme;
                if (stored === 'dark' || stored === 'light') {
                  theme = stored;
                } else {
                  // First visit: dark on mobile, light on desktop
                  theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
                  localStorage.setItem('theme', theme);
                }
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
              if (history.scrollRestoration) history.scrollRestoration = 'manual';
              // Stable viewport height for mobile: Chrome Android recalculates
              // viewport units (svh/lvh/dvh) during address bar collapse/expand,
              // triggering style+layout recalculation on every animation frame.
              // Capture innerHeight once and expose it as a CSS custom property
              // so mobile full-viewport sections can use a fixed pixel value
              // instead of svh. Updated only on orientation change (NOT resize,
              // which fires during the very address bar animation we're avoiding).
              // Safari iOS is unaffected (scroll is OS-level) but the fixed value
              // is harmless there. Falls back to 100svh via CSS var() when unset.
              if (window.matchMedia('(max-width:767px)').matches) {
                document.documentElement.style.setProperty('--stable-svh', window.innerHeight + 'px');
                window.addEventListener('orientationchange', function() {
                  setTimeout(function() {
                    document.documentElement.style.setProperty('--stable-svh', window.innerHeight + 'px');
                  }, 150);
                });
              }
              // intro orchestration: see block below
              if (window.location.pathname === '/') {
                // intro-lock is applied BEFORE first paint so the browser
                // cannot scroll during the hero scramble — in either mode:
                //
                //  - Full intro: locked during fill+reveal+scramble,
                //    HeroSection's scramble onComplete removes it.
                //  - Skip mode (reduced-motion / session repeat): locked
                //    just during the scramble. HeroSection's scramble
                //    onComplete (or its 2.5s safety fallback) removes it.
                //
                // The two modes are distinguished by data attributes:
                //  - data-intro-active="true": render the full overlay
                //    with fill/reveal animations (IntroOrchestrator).
                //  - data-intro-skip="true":   suppress the overlay via
                //    CSS (display:none) so there is no logo flash.
                document.documentElement.classList.add('intro-lock');
                var shouldIntro = true;
                try {
                  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    shouldIntro = false;
                  }
                  if (sessionStorage.getItem('introSeen') === '1') {
                    shouldIntro = false;
                  }
                } catch (e) {
                  // sessionStorage may throw in private browsing — fail open (show intro)
                }
                if (shouldIntro) {
                  document.documentElement.dataset.introActive = 'true';
                } else {
                  document.documentElement.dataset.introSkip = 'true';
                }
              }
              window.addEventListener('pageshow', function(e) {
                if (e.persisted) window.location.reload();
              });
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        {/* Skip to content link for keyboard users */}
        <a
          href="#main-content"
          className="fixed top-0 left-0 z-[100] -translate-y-full bg-[var(--color-accent)] px-4 py-2 text-white transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
        </ThemeProvider>
        <HomeIntroMount />
        <Analytics />
      </body>
    </html>
  );
}
