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
        adoption comes first.
      </h2>
      <p
        className="mt-2 max-w-[889px] text-center text-[15px] md:text-[18px] font-normal leading-[1.3] tracking-[-0.3px] md:tracking-[-0.36px]"
        style={{ color: 'var(--color-text)' }}
      >
        We don&apos;t build on hope; we build on behavior.
        <br className="hidden md:inline" />
        By analyzing how people actually trade, watch, and engage,
        <br className="hidden md:inline" />
        we design systems that align with those market realities.
        <br/>
        <br/>
        the first wave of internet-native protocols introduced true global finance,
        <br className="hidden md:inline" />
        1six is engineering the next generation of global financial applications
        for the masses.
      </p>
    </section>
  );
}
