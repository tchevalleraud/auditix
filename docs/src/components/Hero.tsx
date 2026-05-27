import React from 'react';
import Link from '@docusaurus/Link';

interface HeroProps {
  pill?: string;
  title?: React.ReactNode;
  subtitle: React.ReactNode;
  primaryCta?: {label: string; to: string};
  secondaryCta?: {label: string; to: string};
}

export default function Hero({
  pill,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: HeroProps): React.JSX.Element {
  return (
    <section className="ax-hero">
      {pill && <div className="ax-hero__pill">{pill}</div>}
      {title && <h1 className="ax-hero__title">{title}</h1>}
      <p className="ax-hero__subtitle">{subtitle}</p>
      <div className="ax-hero__ctas">
        {primaryCta && (
          <Link to={primaryCta.to} className="ax-btn ax-btn--primary">
            {primaryCta.label} →
          </Link>
        )}
        {secondaryCta && (
          <Link to={secondaryCta.to} className="ax-btn ax-btn--secondary">
            {secondaryCta.label}
          </Link>
        )}
      </div>
    </section>
  );
}
