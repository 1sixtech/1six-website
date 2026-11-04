/**
 * "adoption comes first." — the homepage's statement of method.
 *
 * The section keeps id="products" because hash navigation and older links
 * target it. Products themselves stay off the site, so the copy describes
 * the method (behavior over hope) rather than naming one.
 *
 * Line breaks come from a measured column plus balanced wrapping instead of
 * hard <br>s, so the paragraph re-flows cleanly at every width.
 */
export function ProductsHeading() {
  return (
    <section
      id="products"
      className="flex flex-col items-center justify-center px-[22px] pt-16 pb-12 md:px-6 md:pt-24 md:pb-32"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <h2
        className="text-center text-[28px] font-medium leading-[1.15] tracking-[-0.02em] md:text-[36px]"
        style={{ color: 'var(--color-text)' }}
      >
        adoption comes first.
      </h2>
      <div
        className="mt-6 flex max-w-[600px] flex-col gap-5 text-center text-[16px] font-normal leading-[1.45] tracking-[-0.01em] text-balance md:mt-8 md:text-[18px]"
        style={{ color: 'var(--color-text)' }}
      >
        <p>
          we don&apos;t build on hope; we build on behavior. by analyzing how people
          actually trade, watch, and engage, we design systems that align with those
          market realities.
        </p>
        <p>
          the first wave of internet-native protocols introduced true global finance.
          1six is engineering the next generation of global financial applications
          for the masses.
        </p>
      </div>
    </section>
  );
}
