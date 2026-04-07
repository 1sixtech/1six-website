import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
});

export const metadata: Metadata = {
  title: '1SIX - Leading web3 industry to cross the chasm',
  description:
    '1SIX exists to push the industry past the 16% adoption line. Building infrastructure for crypto-native broadcasting and trading.',
  openGraph: {
    title: '1SIX Technologies',
    description: 'Leading web3 industry to cross the chasm',
    type: 'website',
    url: 'https://1six.tech',
  },
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
                var theme = localStorage.getItem('theme') || 'light';
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
              if (history.scrollRestoration) history.scrollRestoration = 'manual';
              window.addEventListener('pageshow', function(e) {
                if (e.persisted) window.location.reload();
              });
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
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
      </body>
    </html>
  );
}
