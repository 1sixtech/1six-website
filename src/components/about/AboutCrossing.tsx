import { CrossingRoot } from './CrossingRoot';
import { CrossingMark } from './CrossingMark';
import { OnwardLink } from './OnwardLink';
import { BACKERS, CONTACT_EMAIL, FIRMS, ORIGINS } from './aboutData';
import type { ResearchEvidence } from './researchEvidence';

interface AboutCrossingProps {
  evidence: ResearchEvidence;
}

/** Inline list of names separated by the mosaic's own slash glyph. */
function NameList({ names, className = '' }: { names: string[]; className?: string }) {
  return (
    <ul className={`crossing-names ${className}`.trim()}>
      {names.map((name, index) => (
        <li key={name}>
          {name}
          {index < names.length - 1 && (
            <span className="crossing-names__sep" aria-hidden="true">
              /
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * About — "The crossing".
 *
 * The left third pins the ASCII "16" with CSS sticky while four bands scroll
 * past on the right. The mark starts 16% filled (the first 16%) and each
 * band carries a quarter of the next 84%, so it reads 100% at the contact.
 */
export function AboutCrossing({ evidence }: AboutCrossingProps) {
  return (
    <CrossingRoot>
      <div className="crossing-meter" aria-hidden="true">
        <span className="crossing-meter__fill" />
      </div>

      <div className="crossing-frame">
        <div className="crossing-grid">
          <CrossingMark />

          <div className="crossing-bands">
            <section
              className="crossing-band crossing-band--statement"
              data-crossing-band="0"
              aria-labelledby="about-title"
            >
              <h1 id="about-title" className="crossing-display">
                <span>we don’t dream.</span> <span>we build.</span>
              </h1>
              <p className="crossing-lead">
                we are a team of diehards. we don’t spend days and nights ruminating on
                ideals. we take action to make them real.
              </p>
              <p className="crossing-body">
                we bring experience from Harvard, Ethereum, PhD programs, world-class
                competitive programming (ICPC World Finals), special forces, and many
                other uncommon paths of life to cross the first{' '}
                <span className="crossing-figure">16%</span>.
              </p>
              <OnwardLink href="#origins">where we come from</OnwardLink>
            </section>

            <section
              id="origins"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="1"
              aria-labelledby="origins-title"
            >
              <h2 id="origins-title" className="crossing-heading">
                where we come from.
              </h2>
              <dl className="crossing-ledger">
                {ORIGINS.map(({ discipline, names }) => (
                  <div key={discipline} className="crossing-ledger__row">
                    <dt className="crossing-tag">{discipline}</dt>
                    <dd>
                      <NameList names={names} />
                    </dd>
                  </div>
                ))}
              </dl>
              <OnwardLink href="#investors">who backs us</OnwardLink>
            </section>

            <section
              id="investors"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="2"
              aria-labelledby="investors-title"
            >
              <h2 id="investors-title" className="crossing-heading">
                backed by
              </h2>
              <ul className="crossing-backers">
                {BACKERS.map(({ name, role }) => (
                  <li key={name} className="crossing-backer">
                    <p className="crossing-backer__name">{name}</p>
                    <p className="crossing-backer__role">{role}</p>
                  </li>
                ))}
              </ul>
              <div className="crossing-firms">
                <NameList names={FIRMS} className="crossing-firms__names" />
                <p className="crossing-firms__more">and more</p>
              </div>
              <OnwardLink href="#method">how we measure</OnwardLink>
            </section>

            <section
              id="method"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="3"
              aria-labelledby="method-title"
            >
              <h2 id="method-title" className="crossing-heading">
                we measure.
              </h2>
              <figure className="crossing-evidence">
                {evidence.takeaways.length > 0 && (
                  <blockquote cite={evidence.href}>
                    <ul className="crossing-takeaways">
                      {evidence.takeaways.map(({ label, text }) => (
                        <li key={label || text}>
                          {label && <strong>{label}</strong>} {text}
                        </li>
                      ))}
                    </ul>
                  </blockquote>
                )}
                <figcaption className="crossing-evidence__source">
                  <span className="crossing-meta">
                    1six research{' '}
                    <span aria-hidden="true">·</span>{' '}
                    <time dateTime={evidence.date}>{evidence.dateLabel}</time>
                  </span>
                  <OnwardLink href={evidence.href} direction="right" cite className="crossing-source">
                    {evidence.title}
                  </OnwardLink>
                </figcaption>
              </figure>
            </section>

            <section
              id="contact"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="4"
              aria-labelledby="contact-title"
            >
              <h2 id="contact-title" className="crossing-heading">
                write to us.
              </h2>
              <p className="crossing-body crossing-contact__lede">
                investors and candidates reach 1six at
              </p>
              <a className="crossing-email" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              <p className="crossing-close">
                we build for <span className="crossing-close__figure">the next 84%</span>.
              </p>
              <span className="crossing-end" data-crossing-end aria-hidden="true" />
            </section>
          </div>
        </div>
      </div>
    </CrossingRoot>
  );
}
