'use client';

// The `error` prop is part of the Next.js error boundary contract but is
// intentionally not surfaced to the user here — we show a generic message
// rather than leak internal error details. The destructured type is kept
// as documentation of the Next.js contract.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex h-dvh w-full flex-col items-center justify-center gap-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <h1
        className="text-[36px] font-normal tracking-[-0.72px]"
        style={{ color: 'var(--color-text)' }}
      >
        something went wrong.
      </h1>
      <p className="text-[18px] text-[var(--color-sub-text2)]">
        An unexpected error occurred.
      </p>
      <button
        onClick={reset}
        className="mt-4 inline-block rounded-[3px] border border-[var(--color-accent)] px-4 py-2 text-[14px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white"
      >
        try again
      </button>
    </div>
  );
}
