import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {translate} from '@docusaurus/Translate';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import FeaturePagePlaceholder from '@site/src/components/FeaturePagePlaceholder';
import {RELEASES, Release} from '@site/src/data/changelog';

function formatDate(iso: string | null, locale: string): string {
  if (!iso) {
    return translate({id: 'changelog.tba', message: 'Coming soon'});
  }
  try {
    return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ChangelogPage(): React.JSX.Element {
  React.useEffect(() => {
    document.body.classList.add('ax-marketing');
    return () => {
      document.body.classList.remove('ax-marketing');
    };
  }, []);

  const heroTitle = translate({id: 'changelog.hero.title', message: 'Changelog'});
  const heroLead = translate({
    id: 'changelog.hero.lead',
    message: 'Every Auditix release, with a screenshot for each major version, exact dates and the full list of new features and sub-features.',
  });

  return (
    <Layout
      title={translate({id: 'changelog.meta.title', message: 'Changelog · Auditix'})}
      description={translate({
        id: 'changelog.meta.description',
        message: 'Release history of Auditix — features, sub-features and fixes for every version.',
      })}>
      <section className="ax-hero ax-feature-hero">
        <span className="ax-hero__pill">
          <span aria-hidden="true">📜</span>
          <span>{translate({id: 'changelog.pill', message: 'Release history'})}</span>
        </span>
        <h1 className="ax-hero__title">{heroTitle}</h1>
        <p className="ax-hero__subtitle">{heroLead}</p>
      </section>

      <main className="ax-container">
        <section className="ax-changelog">
          {RELEASES.map((release, idx) => (
            <ReleaseBlock key={release.version} release={release} index={idx} />
          ))}
        </section>
      </main>
    </Layout>
  );
}

interface ReleaseBlockProps {
  release: Release;
  index: number;
}

function ReleaseBlock({release, index}: ReleaseBlockProps): React.JSX.Element {
  const {withBaseUrl} = useBaseUrlUtils();
  const resolve = (s: string): string => (/^https?:\/\//.test(s) ? s : withBaseUrl(s));

  // Detect locale through document.documentElement.lang at runtime. Safer than
  // relying on Docusaurus context here; SSR will render in EN, hydration fixes FR.
  const [locale, setLocale] = React.useState<string>('en');
  React.useEffect(() => {
    setLocale(document.documentElement.lang || 'en');
  }, []);

  const dateLabel = formatDate(release.date, locale);
  const summary = translate({
    id: `changelog.${release.version}.summary`,
    message: release.summary,
  });
  const tagline = release.tagline
    ? translate({
        id: `changelog.${release.version}.tagline`,
        message: release.tagline,
      })
    : null;

  const versionLabel = `v${release.version}`;
  const imageSide = index % 2 === 0 ? 'right' : 'left';

  if (release.kind === 'major') {
    return (
      <article
        className={`ax-changelog__release ax-changelog__release--major ax-changelog__release--image-${imageSide}`}>
        <div className="ax-changelog__intro">
          <div className="ax-changelog__copy">
            <div className="ax-changelog__meta">
              <span className="ax-changelog__badge ax-changelog__badge--major">
                {translate({id: 'changelog.kind.major', message: 'Major'})}
              </span>
              <time className="ax-changelog__date">{dateLabel}</time>
            </div>
            <h2 className="ax-changelog__title">
              {versionLabel}
              {tagline && <span className="ax-changelog__tagline"> — {tagline}</span>}
            </h2>
            <p className="ax-changelog__summary">{summary}</p>
          </div>

          <div className="ax-changelog__media">
            <div className="ax-feature-page__frame">
              <div className="ax-feature-page__bar">
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__bar-title">{versionLabel}</span>
              </div>
              <div className="ax-feature-page__shot">
                {release.imageSources ? (
                  <ThemedImage
                    alt={`${versionLabel} screenshot`}
                    sources={{
                      light: resolve(release.imageSources.light),
                      dark: resolve(release.imageSources.dark),
                    }}
                  />
                ) : (
                  <FeaturePagePlaceholder icon={release.icon ?? '✨'} title={versionLabel} />
                )}
              </div>
            </div>
          </div>
        </div>

        {release.features && release.features.length > 0 && (
          <div className="ax-changelog__features">
            {release.features.map((f, i) => (
              <div key={i} className="ax-changelog__feature">
                <h3 className="ax-changelog__feature-title">
                  {f.icon && <span aria-hidden="true">{f.icon}</span>}
                  <span>
                    {translate({
                      id: `changelog.${release.version}.feature.${i}.title`,
                      message: f.title,
                    })}
                  </span>
                </h3>
                <p className="ax-changelog__feature-desc">
                  {translate({
                    id: `changelog.${release.version}.feature.${i}.desc`,
                    message: f.description,
                  })}
                </p>
                {f.items && f.items.length > 0 && (
                  <ul className="ax-changelog__feature-items">
                    {f.items.map((item, j) => (
                      <li key={j}>
                        {translate({
                          id: `changelog.${release.version}.feature.${i}.item.${j}`,
                          message: item,
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <article className="ax-changelog__release ax-changelog__release--minor">
      <div className="ax-changelog__meta">
        <span
          className={`ax-changelog__badge ax-changelog__badge--${release.kind === 'minor' ? 'minor' : 'patch'}`}>
          {release.kind === 'minor'
            ? translate({id: 'changelog.kind.minor', message: 'Minor'})
            : translate({id: 'changelog.kind.patch', message: 'Patch'})}
        </span>
        <time className="ax-changelog__date">{dateLabel}</time>
      </div>
      <h2 className="ax-changelog__title ax-changelog__title--small">
        {versionLabel}
        {tagline && <span className="ax-changelog__tagline"> — {tagline}</span>}
      </h2>
      <p className="ax-changelog__summary">{summary}</p>
      {release.bullets && release.bullets.length > 0 && (
        <ul className="ax-changelog__bullets">
          {release.bullets.map((b, i) => (
            <li key={i}>
              {translate({
                id: `changelog.${release.version}.bullet.${i}`,
                message: b,
              })}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
