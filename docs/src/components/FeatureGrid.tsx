import React from 'react';

interface FeatureGridProps {
  children: React.ReactNode;
  cols?: 2 | 4;
}

export default function FeatureGrid({children, cols}: FeatureGridProps): React.JSX.Element {
  const className = cols ? `ax-grid ax-grid--cols-${cols}` : 'ax-grid';
  return <div className={className}>{children}</div>;
}
