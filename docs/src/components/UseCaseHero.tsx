import React from 'react';

interface UseCaseHeroProps {
  duration: string;
  difficulty: string;
  prerequisites?: string;
  outcome: string;
}

export default function UseCaseHero({
  duration,
  difficulty,
  prerequisites,
  outcome,
}: UseCaseHeroProps): React.JSX.Element {
  return (
    <div className="ax-usecase">
      <div className="ax-usecase__cell">
        <span className="ax-usecase__label">⏱ Duration</span>
        <span className="ax-usecase__value">{duration}</span>
      </div>
      <div className="ax-usecase__cell">
        <span className="ax-usecase__label">🎯 Difficulty</span>
        <span className="ax-usecase__value">{difficulty}</span>
      </div>
      {prerequisites && (
        <div className="ax-usecase__cell">
          <span className="ax-usecase__label">✅ Prerequisites</span>
          <span className="ax-usecase__value">{prerequisites}</span>
        </div>
      )}
      <div className="ax-usecase__cell">
        <span className="ax-usecase__label">🏁 Outcome</span>
        <span className="ax-usecase__value">{outcome}</span>
      </div>
    </div>
  );
}
