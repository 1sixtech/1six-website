import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <h1
        className="text-[72px] font-bold tracking-[-1.44px]"
        style={{ color: 'var(--color-accent)' }}
      >
        404
      </h1>
      <p
        className="text-[24px] font-normal tracking-[-0.48px]"
        style={{ color: 'var(--color-text)' }}
      >
        page not found.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-[3px] border border-[var(--color-accent)] px-4 py-2 text-[14px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white"
      >
        back to home
      </Link>
    </div>
  );
}
