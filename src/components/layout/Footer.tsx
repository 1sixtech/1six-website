import Link from 'next/link';
import { LogoFooter } from '@/components/ui/Logo';

const COMPANY_LINKS = [
  { label: 'About', href: '/#about' },
  { label: 'Team', href: '/team' },
  { label: 'Investors', href: '/team#investors' },
  { label: 'Careers', href: '/team#careers' },
];

const PRODUCT_LINKS = [
  { label: 'Nevada TV', href: '#' },
  { label: 'Nevada Trade', href: '#' },
  { label: 'Mojave', href: '#' },
];

const CONNECT_LINKS = [
  { label: 'Youtube', href: 'https://www.youtube.com/@nevada-app' },
  { label: 'Twitter', href: 'https://x.com/1sixtech' },
  { label: 'Threads', href: 'https://www.threads.com/@live.nevada.app' },
  { label: 'Instagram', href: 'https://www.instagram.com/live.nevada.app' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@live.nevada.app' },
  { label: 'Discord', href: 'https://discord.gg/wR4srtyhuU' },
];

const linkClass =
  'text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)] transition-colors hover:text-[var(--color-accent)]';

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)]">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {links.map((link) => (
          <Link key={link.label} href={link.href} className={linkClass}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: 'var(--color-footer-bg, var(--color-bg))' }}
    >
      {/* ===== MOBILE FOOTER (<768px) ===== */}
      <div className="block md:hidden px-[22px] py-10">
        {/* Logo */}
        <LogoFooter className="h-[48px] w-[50px] text-[var(--color-accent)] mb-8" />

        {/* 2-column: COMPANY + PRODUCTS */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <FooterColumn title="COMPANY" links={COMPANY_LINKS} />
          <FooterColumn title="PRODUCTS" links={PRODUCT_LINKS} />
        </div>

        {/* CONNECT */}
        <div className="mb-8">
          <FooterColumn title="CONNECT" links={CONNECT_LINKS} />
        </div>

        {/* Copyright */}
        <p className="text-[12px] font-normal leading-[1.2] tracking-[-0.12px] text-[var(--color-sub-text1)]">
          &copy; 2025 - 2026 1SIX Technologies Inc. All rights reserved.
        </p>
      </div>

      {/* ===== DESKTOP FOOTER (>=768px) — absolute positioned, Figma-accurate ===== */}
      <div className="hidden md:block relative mx-auto h-[304px] w-full max-w-[1440px]">
        {/* Logo */}
        <div className="absolute" style={{ left: '3.33%', top: '10.53%' }}>
          <LogoFooter className="h-[48px] w-[50px] text-[var(--color-accent)]" />
        </div>

        {/* Copyright */}
        <p
          className="absolute text-[12px] font-normal leading-[1.2] tracking-[-0.12px] text-[var(--color-sub-text1)]"
          style={{ left: '3.33%', top: '86.84%' }}
        >
          &copy; 2025 - 2026 1SIX Technologies Inc. All rights reserved.
        </p>

        {/* COMPANY */}
        <p className="absolute text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)]"
          style={{ left: '70.63%', top: '10.53%' }}>COMPANY</p>
        <div className="absolute flex flex-col gap-1" style={{ left: 'calc(75% + 22px)', top: '32px' }}>
          {COMPANY_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass}>{link.label}</Link>
          ))}
        </div>

        {/* PRODUCTS */}
        <p className="absolute text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)]"
          style={{ left: '70.14%', top: '40.13%' }}>PRODUCTS</p>
        <div className="absolute flex flex-col gap-1" style={{ left: 'calc(75% + 22px)', top: '122px' }}>
          {PRODUCT_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass}>{link.label}</Link>
          ))}
        </div>

        {/* CONNECT */}
        <p className="absolute text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)]"
          style={{ left: '86.53%', top: '10.53%' }}>CONNECT</p>
        <div className="absolute flex flex-col gap-1" style={{ left: 'calc(91.67% + 10px)', top: '32px' }}>
          {CONNECT_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass}>{link.label}</Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
