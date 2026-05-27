import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {translate} from '@docusaurus/Translate';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import {findFeature} from '@site/src/data/features';
import {FEATURE_CONTENT} from '@site/src/data/featuresContent';
import FeaturePagePlaceholder from '@site/src/components/FeaturePagePlaceholder';

interface FeaturePageProps {
  slug: string;
}

export default function FeaturePage({slug}: FeaturePageProps): React.JSX.Element {
  const meta = findFeature(slug);
  const content = FEATURE_CONTENT[slug];

  if (!meta || !content) {
    throw new Error(`FeaturePage: unknown feature slug "${slug}"`);
  }

  React.useEffect(() => {
    document.body.classList.add('ax-marketing');
    return () => {
      document.body.classList.remove('ax-marketing');
    };
  }, []);

  const {withBaseUrl} = useBaseUrlUtils();
  const resolve = (s: string): string => (/^https?:\/\//.test(s) ? s : withBaseUrl(s));

  const title = translate({id: `featurePage.${slug}.title`, message: content.title});
  const lead = translate({id: `featurePage.${slug}.lead`, message: content.lead});
  const body = translate({id: `featurePage.${slug}.body`, message: content.body});
  const ctaLabel = translate({id: `featurePage.${slug}.cta`, message: content.cta});
  const bulletsHeading = translate({
    id: 'featurePage.common.bulletsHeading',
    message: 'What you can do',
  });
  const otherFeaturesHeading = translate({
    id: 'featurePage.common.otherFeaturesHeading',
    message: 'Other features',
  });
  const backHomeLabel = translate({
    id: 'featurePage.common.backHome',
    message: '← Back to all features',
  });

  const bullets = content.bullets.map((fallback, idx) =>
    translate({id: `featurePage.${slug}.bullet.${idx + 1}`, message: fallback}),
  );

  return (
    <Layout
      title={translate({
        id: `featurePage.${slug}.meta.title`,
        message: `${content.title} · Auditix`,
      })}
      description={translate({
        id: `featurePage.${slug}.meta.description`,
        message: content.lead,
      })}>
      <section className={`ax-hero ax-feature-hero${meta.variant === 'ai' ? ' ax-feature-hero--ai' : ''}`}>
        <span className="ax-hero__pill">
          <span aria-hidden="true">{meta.icon}</span>
          <span>
            {translate({
              id: 'featurePage.common.eyebrow',
              message: 'Auditix feature',
            })}
          </span>
        </span>
        <h1 className="ax-hero__title">
          {meta.variant === 'ai' ? <span className="ax-ai-accent">{title}</span> : title}
        </h1>
        <p className="ax-hero__subtitle">{lead}</p>
      </section>

      <main className="ax-container">
        <section className="ax-feature-page__intro">
          <div className="ax-feature-page__media">
            <div className="ax-feature-page__frame">
              <div className="ax-feature-page__bar">
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__dot" />
                <span className="ax-feature-page__bar-title">{title}</span>
              </div>
              <div className="ax-feature-page__shot">
                {meta.imageSources ? (
                  <ThemedImage
                    alt={translate({
                      id: `featurePage.${slug}.image.alt`,
                      message: `${content.title} screenshot`,
                    })}
                    sources={{
                      light: resolve(meta.imageSources.light),
                      dark: resolve(meta.imageSources.dark),
                    }}
                  />
                ) : (
                  <FeaturePagePlaceholder icon={meta.icon} title={title} />
                )}
              </div>
            </div>
          </div>

          <div className="ax-feature-page__copy">
            <p className="ax-feature-page__body">{body}</p>
            {meta.docLink && (
              <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
                <Link to={meta.docLink} className="ax-btn ax-btn--primary">
                  {ctaLabel} →
                </Link>
                <Link to="/" className="ax-btn ax-btn--secondary">
                  {backHomeLabel}
                </Link>
              </div>
            )}
            {!meta.docLink && (
              <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
                <Link to="/" className="ax-btn ax-btn--secondary">
                  {backHomeLabel}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="ax-feature-page__bullets">
          <h2 className="ax-section-title">{bulletsHeading}</h2>
          <ul className="ax-bullets">
            {bullets.map((b, idx) => (
              <li key={idx} className="ax-bullets__item">
                <span className="ax-bullets__check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        <FeaturePageRelated currentSlug={slug} heading={otherFeaturesHeading} />
      </main>
    </Layout>
  );
}

interface FeaturePageRelatedProps {
  currentSlug: string;
  heading: string;
}

function FeaturePageRelated({currentSlug, heading}: FeaturePageRelatedProps): React.JSX.Element {
  const others = Object.keys(FEATURE_CONTENT).filter((s) => s !== currentSlug);
  const sample = others.slice(0, 4);
  return (
    <section className="ax-feature-page__related">
      <h2 className="ax-section-title">{heading}</h2>
      <div className="ax-grid ax-grid--cols-4">
        {sample.map((s) => {
          const meta = findFeature(s);
          const c = FEATURE_CONTENT[s];
          if (!meta || !c) {
            return null;
          }
          const title = translate({id: `featurePage.${s}.title`, message: c.title});
          const lead = translate({id: `featurePage.${s}.lead`, message: c.lead});
          return (
            <Link key={s} to={`/features/${s}`} className="ax-card">
              <span className="ax-card__icon" aria-hidden="true">
                {meta.icon}
              </span>
              <h3 className="ax-card__title">{title}</h3>
              <p className="ax-card__body">{lead}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
