import { CrossingRoot } from './CrossingRoot';
import { CrossingMark } from './CrossingMark';
import { OnwardLink } from './OnwardLink';
import { BACKERS, CONTACT_EMAIL, FIRMS, ORIGINS, PARTNERS } from './aboutData';

interface NameListProps {
  names: string[];
  /** One name per line, no separators (a wrapping run would strand a slash). */
  stacked?: boolean;
  className?: string;
}

/** List of names: an inline run separated by the mosaic's own slash glyph, or a stacked column. */
function NameList({ names, stacked = false, className = '' }: NameListProps) {
  const classes = ['crossing-names', stacked && 'crossing-names--stacked', className]
    .filter(Boolean)
    .join(' ');
  return (
    <ul className={classes}>
      {names.map((name, index) => (
        <li key={name}>
          {name}
          {!stacked && index < names.length - 1 && (
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
 * The left third pins the ASCII "16" with CSS sticky while the story scrolls
 * past on the right. The mark starts 16% filled (the first 16%) and follows the scroll, so it reads 100% at the contact.
 */
export function AboutCrossing() {
  return (
    <CrossingRoot>
      {/* Mobile: the mark scrolls away, so the crossing rides under the
          header instead: the section being read, and the fill as a live
          count. The label starts hidden: the statement's title is on
          screen at the top, and CrossingRoot shows the label once a title
          has gone up under the strip. */}
      <div className="crossing-meter" data-title="shown" aria-hidden="true">
        <span className="crossing-meter__label" data-crossing-label-target>
          about
        </span>
        <span className="crossing-meter__count" data-crossing-count>16%</span>
        <span className="crossing-meter__fill" />
      </div>

      <div className="crossing-frame">
        <div className="crossing-grid">
          <CrossingMark />

          <div className="crossing-bands">
            <section
              className="crossing-band crossing-band--statement"
              data-crossing-band="0"
              data-crossing-label="about"
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
                we bring experience from Harvard College, Schwarzman Scholars, and
                world-class competitive programming to cross the first{' '}
                <span className="crossing-figure">16%</span>.
              </p>
              <OnwardLink href="#products">what we build</OnwardLink>
            </section>

            <section
              id="products"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="1"
              data-crossing-label="products"
              aria-labelledby="products-title"
            >
              <h2 id="products-title" className="crossing-heading">products.</h2>
              <div className="crossing-product">
                <p className="crossing-tag">01 / esports</p>
                <a className="crossing-product__name" href="https://predict.everywhere.trade">
                  <span>predict.</span><span>everywhere.trade</span>
                </a>
                <p className="crossing-body">An esports-focused prediction market.</p>
                <a className="crossing-product__visit" href="https://predict.everywhere.trade">
                  Visit website <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="crossing-product__coming">More Coming Soon</p>
              <OnwardLink href="#origins">where we come from</OnwardLink>
            </section>

            <section
              id="origins"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="2"
              data-crossing-label="where we come from"
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
                      <NameList names={names} stacked />
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
              data-crossing-band="3"
              data-crossing-label="backed by"
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
              <OnwardLink href="#partnerships">who we work with</OnwardLink>
            </section>

            <section
              id="partnerships"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="4"
              data-crossing-label="partnerships"
              aria-labelledby="partnerships-title"
            >
              <h2 id="partnerships-title" className="crossing-heading">
                partnerships.
              </h2>
              <ul className="crossing-partners">
                {PARTNERS.map((partner) => <li key={partner}>{partner}</li>)}
              </ul>
              <OnwardLink href="#contact">work with us</OnwardLink>
            </section>

            <section
              id="contact"
              tabIndex={-1}
              className="crossing-band"
              data-crossing-band="5"
              data-crossing-label="work with us"
              aria-labelledby="contact-title"
            >
              <h2 id="contact-title" className="crossing-heading">
                work with us.
              </h2>
              <p className="crossing-close">
                we build for <span className="crossing-close__figure">the next 84%</span>.
                <br />want to build together?
              </p>
              <a className="crossing-email" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              <span className="crossing-end" data-crossing-end aria-hidden="true" />
            </section>
          </div>
        </div>
      </div>
    </CrossingRoot>
  );
}
