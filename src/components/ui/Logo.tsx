/**
 * 1SIX Logo components — SVG extracted from Figma
 * The fill color uses currentColor so it inherits text color from parent.
 * For the accent version (Header), use text-[var(--color-accent)].
 */

/** Header logo: "1SIX" text mark, 73x21px in Figma */
export function LogoHeader({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="73"
      height="21"
      viewBox="0 0 73 21.03"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M72.96 0.04L73 0H68.52L68.48 0.04L60.3 8.26V12.77L68.52 21.03H73L62.94 10.91C62.72 10.69 62.72 10.33 62.94 10.11L72.96 0.04Z" fill="currentColor"/>
      <path d="M50.69 21.03L58.9 12.77V8.26L50.73 0.04L50.69 0H46.2L46.24 0.04L56.27 10.12C56.48 10.33 56.48 10.69 56.27 10.91L46.2 21.03H50.69Z" fill="currentColor"/>
      <path d="M43.85 0.04H40.68V21.02H43.85V0.04Z" fill="currentColor"/>
      <path d="M29.58 8.32L27.34 10.58L33.84 17.12C34.11 17.39 33.92 17.84 33.55 17.84H16.14V21.03H37.02V15.8L29.58 8.32Z" fill="currentColor"/>
      <path d="M16.14 5.27L23.58 12.75L25.82 10.49L19.31 3.95C19.05 3.68 19.24 3.23 19.61 3.23H37.02V0.04H16.14V5.27Z" fill="currentColor"/>
      <path d="M7.44 0.04L0 7.52L2.24 9.78L8.75 3.24C9.01 2.97 9.46 3.16 9.46 3.53V21.03H12.63V0.04H7.44Z" fill="currentColor"/>
    </svg>
  );
}

/** Footer logo: "16" symbol mark, 50x48px in Figma */
export function LogoFooter({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="50"
      height="48"
      viewBox="0 0 49.91 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9.95 0L0 15.23H6.89L16.82 0H9.95Z" fill="currentColor"/>
      <path d="M34.4 17.66C25.85 17.66 18.89 24.46 18.89 32.83C18.89 41.19 25.85 48 34.4 48C42.95 48 49.91 41.2 49.91 32.83C49.91 24.46 42.95 17.66 34.4 17.66ZM34.4 42.25C29.09 42.25 24.76 38.02 24.76 32.83C24.76 27.63 29.09 23.4 34.4 23.4C39.71 23.4 44.03 27.63 44.03 32.83C44.03 38.02 39.71 42.25 34.4 42.25Z" fill="currentColor"/>
      <path d="M13.06 18.36H6.9V47.28H13.06V18.36Z" fill="currentColor"/>
      <path d="M32.3 0L22.35 15.23H29.24L39.16 0H32.3Z" fill="currentColor"/>
    </svg>
  );
}
