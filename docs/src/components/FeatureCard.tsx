import React from 'react';
import Link from '@docusaurus/Link';

interface FeatureCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  to?: string;
  ai?: boolean;
}

export default function FeatureCard({icon, title, description, to, ai}: FeatureCardProps): React.JSX.Element {
  const className = `ax-card${ai ? ' ax-card--ai' : ''}`;
  const inner = (
    <>
      {icon && <span className="ax-card__icon">{icon}</span>}
      <h3 className="ax-card__title">{title}</h3>
      <p className="ax-card__body">{description}</p>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
