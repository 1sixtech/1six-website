import Link from 'next/link';
import { LogoFooter } from '@/components/ui/Logo';

const COMPANY_LINKS = [
  { label: 'Thesis', href: '/#thesis' },
  { label: 'About', href: '/about' },
  { label: 'Investors', href: '/about#investors' },
];

const linkClass =
  'text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)] transition-colors hover:text-[var(--color-accent)]';

function FooterColumn({
  title,
  links,
  alignRight = false,
}: {
  title: string;
  links: { label: string; href: string }[];
  alignRight?: boolean;
}) {
  const alignClass = alignRight ? 'text-right' : '';

  return (
    <div>
      <p
        className={`mb-3 text-[12px] font-normal leading-[1.2] tracking-[0.53px] text-[var(--color-sub-text1)] ${alignClass}`}
      >
        {title}
      </p>
      <div className={`flex flex-col gap-1 ${alignRight ? 'items-end' : ''}`}>
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={`${linkClass} ${alignClass}`}
          >
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

        {/* COMPANY */}
        <div className="grid grid-cols-1 justify-items-end gap-8 mb-8">
          <FooterColumn title="COMPANY" links={COMPANY_LINKS} alignRight />
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
        <div className="absolute right-[3.33%] top-[10.53%]">
          <FooterColumn title="COMPANY" links={COMPANY_LINKS} alignRight />
        </div>
      </div>
    </footer>
  );
}
