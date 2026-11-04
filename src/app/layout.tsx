import type { Metadata, Viewport } from 'next';
import './fonts/pretendard-variable.css';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Analytics } from '@vercel/analytics/next';
import { HomeIntroMount } from '@/components/intro/HomeIntroMount';
import { THEME_INIT_SCRIPT } from '@/lib/themeInit';

/**
 * Pretendard's official dynamic subset (fonts/pretendard-variable.css) is
 * fetched slice by slice through unicode-range. The slice with the Latin
 * letters, digits and common punctuation is on every page, so it is
 * preloaded; the rest arrive only when a page shows one of their characters.
 */
const PRETENDARD_LATIN_SLICE = '/fonts/pretendard-1.3.9/PretendardVariable.subset.91.woff2';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://1six.tech'),

  title: {
    template: '%s | 1SIX',
    default: '1SIX - Internet-native finance for the next 84%',
  },

  description:
    'The next wave of global finance — built on behavior, not hope.',

  // Products stay off the site for now, metadata included.
  keywords: [
    '1SIX',
    '1SIX Technologies',
    'internet-native finance',
    'web3 infrastructure',
    'blockchain adoption',
  ],

  authors: [{ name: '1SIX Technologies' }],
  creator: '1SIX Technologies',
  publisher: '1SIX Technologies',

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://1six.tech',
    siteName: '1SIX Technologies',
    title: '1SIX - Internet-native finance for the next 84%',
    description:
      'The next wave of global finance — built on behavior, not hope.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1SIX — we haven\'t crossed the 16% yet. Internet-native finance for the next 84%.',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    site: '@1sixtech',
    creator: '@1sixtech',
    title: '1SIX - Internet-native finance for the next 84%',
    description:
      'The next wave of global finance — built on behavior, not hope.',
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
    'The next wave of global finance — built on behavior, not hope.',
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={PRETENDARD_LATIN_SLICE}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Must run before the first paint (theme, Safari's status bar tint,
            the Home intro lock): see THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
          className="fixed top-0 left-0 z-[110] -translate-y-full bg-[var(--color-accent)] px-4 py-2 text-[14px] font-medium text-black transition-transform duration-200 ease-out focus:translate-y-0"
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
