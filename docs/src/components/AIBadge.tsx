import React from 'react';

interface AIBadgeProps {
  label?: string;
}

export default function AIBadge({label = 'AI-powered'}: AIBadgeProps): React.JSX.Element {
  return (
    <span className="ax-ai-badge" title="This feature uses an LLM provider">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2L14 8L20 10L14 12L12 18L10 12L4 10L10 8L12 2Z" fill="currentColor" />
        <path d="M19 14L20 17L23 18L20 19L19 22L18 19L15 18L18 17L19 14Z" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}
