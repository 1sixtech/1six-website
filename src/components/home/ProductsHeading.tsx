/**
 * Products Heading — Figma-accurate
 *
 * Figma specs:
 * - "PRODUCTS" label: 20px, #646464, centered
 * - "adoption comes first." 24px Medium, centered
 * - Subtitle: 18px, centered, max-width ~889px
 * - Positioned relative to full-width container
 */
export function ProductsHeading() {
  return (
    <section
      id="products"
      className="flex flex-col items-center justify-center gap-3 px-[22px] md:px-0 py-16 md:py-20"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <h2
        className="text-[24px] font-medium leading-[1.15] tracking-[-0.48px]"
        style={{ color: 'var(--color-text)' }}
      >
        adoption comes first
      </h2>
      <p
        className="mt-2 max-w-[889px] text-center text-[15px] md:text-[18px] font-normal leading-[1.3] tracking-[-0.3px] md:tracking-[-0.36px]"
        style={{ color: 'var(--color-text)' }}
      >
        we don&apos;t build on hope. we start with how people actually trade, watch,
        <br className="hidden md:inline" />
        and participate, then design systems that align with those market realities.
      </p>
    </section>
  );
}
