import React from 'react';
import Link from '@docusaurus/Link';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';

interface FeatureSpotlightProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  imageSources: {light: string; dark: string};
  imageAlt: string;
  imageTitle?: string;
  imageSide?: 'left' | 'right';
  variant?: 'default' | 'ai';
  cta?: {label: string; to: string};
  extra?: React.ReactNode;
}

export default function FeatureSpotlight({
  eyebrow,
  title,
  description,
  imageSources,
  imageAlt,
  imageTitle,
  imageSide = 'right',
  variant = 'default',
  cta,
  extra,
}: FeatureSpotlightProps): React.JSX.Element {
  const {withBaseUrl} = useBaseUrlUtils();
  const resolve = (s: string): string => (/^https?:\/\//.test(s) ? s : withBaseUrl(s));

  const classes = [
    'ax-spotlight',
    imageSide === 'left' ? 'ax-spotlight--image-left' : 'ax-spotlight--image-right',
    variant === 'ai' ? 'ax-spotlight--ai' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <div className="ax-spotlight__copy">
        {eyebrow && <span className="ax-eyebrow">{eyebrow}</span>}
        <h2 className="ax-spotlight__title">{title}</h2>
        <p className="ax-spotlight__lead">{description}</p>
        {extra && <div className="ax-spotlight__extra">{extra}</div>}
        {cta && (
          <div className="ax-spotlight__ctas">
            <Link to={cta.to} className="ax-btn ax-btn--secondary">
              {cta.label} →
            </Link>
          </div>
        )}
      </div>
      <div className="ax-spotlight__image">
        <div className="ax-spotlight__frame">
          <div className="ax-spotlight__bar">
            <span className="ax-spotlight__dot" />
            <span className="ax-spotlight__dot" />
            <span className="ax-spotlight__dot" />
            {imageTitle && <span className="ax-spotlight__bar-title">{imageTitle}</span>}
          </div>
          <div className="ax-spotlight__media">
            <ThemedImage
              alt={imageAlt}
              sources={{light: resolve(imageSources.light), dark: resolve(imageSources.dark)}}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
