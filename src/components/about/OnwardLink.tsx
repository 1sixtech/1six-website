import Link from 'next/link';
import { HashLink } from './HashLink';

type Direction = 'down' | 'right';

interface OnwardLinkProps {
  href: string;
  /** Link text. The last word is kept on one line with the arrow. */
  children: string;
  /** `down` for the next band on this page, `right` for another page. */
  direction?: Direction;
  /** Render the label as a `<cite>` (for a cited work's title). */
  cite?: boolean;
  className?: string;
}

const ARROW_PATHS: Record<Direction, string[]> = {
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
  right: ['M5 12h14', 'm12 5 7 7-7 7'],
};

function OnwardArrow({ direction }: { direction: Direction }) {
  return (
    <svg
      className="crossing-onward__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ARROW_PATHS[direction].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * The single explicit next step that closes each band: either the next
 * band on this page or the page that band points to.
 */
export function OnwardLink({
  href,
  children,
  direction = 'down',
  cite = false,
  className = '',
}: OnwardLinkProps) {
  const split = children.lastIndexOf(' ');
  const head = split > 0 ? children.slice(0, split + 1) : '';
  const tail = split > 0 ? children.slice(split + 1) : children;
  const Label = cite ? 'cite' : 'span';

  const content = (
    <Label className="crossing-onward__label">
      {head && <span className="crossing-onward__text">{head}</span>}
      <span className="crossing-onward__tail">
        <span className="crossing-onward__text">{tail}</span>
        <OnwardArrow direction={direction} />
      </span>
    </Label>
  );
  const classes = `crossing-onward ${className}`.trim();

  if (href.startsWith('#')) {
    return (
      <HashLink href={href as `#${string}`} className={classes} data-direction={direction}>
        {content}
      </HashLink>
    );
  }

  return (
    <Link href={href} className={classes} data-direction={direction}>
      {content}
    </Link>
  );
}
