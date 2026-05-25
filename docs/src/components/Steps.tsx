import React from 'react';

interface StepProps {
  title: string;
  children: React.ReactNode;
}

interface StepsProps {
  children: React.ReactNode;
}

export function Steps({children}: StepsProps): React.JSX.Element {
  return <div className="ax-steps">{children}</div>;
}

export function Step({title, children}: StepProps): React.JSX.Element {
  return (
    <div className="ax-step">
      <span className="ax-step__number" aria-hidden="true" />
      <div className="ax-step__body">
        <h3 className="ax-step__title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
