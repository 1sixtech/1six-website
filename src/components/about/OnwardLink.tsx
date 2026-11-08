import { HashLink } from './HashLink';

interface OnwardLinkProps {
  href: `#${string}`;
  /** The last word stays on one line with its arrow. */
  children: string;
}

/** The next section in the home story. */
export function OnwardLink({ href, children }: OnwardLinkProps) {
  const split = children.lastIndexOf(' ');
  const head = split > 0 ? children.slice(0, split + 1) : '';
  const tail = split > 0 ? children.slice(split + 1) : children;

  return (
    <HashLink href={href} className="crossing-onward">
      <span className="crossing-onward__label">
        {head && <span className="crossing-onward__text">{head}</span>}
        <span className="crossing-onward__tail">
          <span className="crossing-onward__text">{tail}</span>
          <svg className="crossing-onward__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 5v14m7-7-7 7-7-7" />
          </svg>
        </span>
      </span>
    </HashLink>
  );
}
