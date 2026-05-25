import React from 'react';

interface FeatureGridProps {
  children: React.ReactNode;
}

export default function FeatureGrid({children}: FeatureGridProps): React.JSX.Element {
  return <div className="ax-grid">{children}</div>;
}
