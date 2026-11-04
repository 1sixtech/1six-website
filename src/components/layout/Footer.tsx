import Link from 'next/link';
import { LogoFooter } from '@/components/ui/Logo';
import { CONTACT_EMAIL } from '@/lib/site';

interface FooterLinkItem {
  label: string;
  href: string;
}

const COMPANY_LINKS: FooterLinkItem[] = [
  { label: 'Thesis', href: '/#thesis' },
  { label: 'Research', href: '/research' },
  { label: 'About', href: '/about' },
  { label: 'Investors', href: '/about#investors' },
];

const CONTACT_LINKS: FooterLinkItem[] = [
  { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
];

// A column is a label over its links, and the two must not read alike:
// the label is small uppercase in the quieter gray, the links are larger
// sentence-case text in the stronger gray. 4px of vertical padding makes
// every row a 30px target (WCAG 2.5.8 asks for 24).
const linkClass =
  'inline-block py-[4px] text-[15px] font-normal leading-[1.45] tracking-normal text-[var(--color-sub-text2)] transition-[color,opacity] duration-150 ease-out hover:text-[var(--color-accent-text)] active:opacity-50';

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: FooterLinkItem[];
}) {
  return (
    <div className="text-right">
      <p className="mb-2 text-[12px] font-normal leading-[1.2] tracking-[0.06em] text-[var(--color-sub-text1)]">
        {title}
      </p>
      <ul className="flex flex-col items-end">
        {links.map((link) => (
          <li key={link.label}>
            {link.href.startsWith('mailto:') ? (
              <a href={link.href} className={linkClass}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className={linkClass}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const COPYRIGHT = '© 2025–2026 1SIX Technologies Inc. All rights reserved.';

export function Footer() {
  return (
    <footer
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: 'var(--color-footer-bg, var(--color-bg))' }}
    >
      {/* ===== MOBILE FOOTER (<768px) ===== */}
      <div className="block md:hidden px-[22px] py-10">
        <LogoFooter className="h-[48px] w-[50px] text-[var(--color-accent)] mb-8" />

        <div className="mb-8 flex flex-wrap justify-end gap-x-12 gap-y-6">
          <FooterColumn title="CONTACT" links={CONTACT_LINKS} />
          <FooterColumn title="COMPANY" links={COMPANY_LINKS} />
        </div>

        <p className="text-[12px] font-normal leading-[1.4] tracking-[0.01em] text-[var(--color-sub-text1)]">
          {COPYRIGHT}
        </p>
      </div>

      {/* ===== DESKTOP FOOTER (>=768px) — absolute positioned, Figma-accurate ===== */}
      <div className="hidden md:block relative mx-auto h-[304px] w-full max-w-[1440px]">
        <div className="absolute" style={{ left: '3.33%', top: '10.53%' }}>
          <LogoFooter className="h-[48px] w-[50px] text-[var(--color-accent)]" />
        </div>

        <p
          className="absolute text-[12px] font-normal leading-[1.4] tracking-[0.01em] text-[var(--color-sub-text1)]"
          style={{ left: '3.33%', top: '86.84%' }}
        >
          {COPYRIGHT}
        </p>

        <div className="absolute right-[3.33%] top-[10.53%] flex gap-16">
          <FooterColumn title="CONTACT" links={CONTACT_LINKS} />
          <FooterColumn title="COMPANY" links={COMPANY_LINKS} />
        </div>
      </div>
    </footer>
  );
}
