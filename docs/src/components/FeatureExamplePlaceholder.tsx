import React from 'react';

interface FeatureExamplePlaceholderProps {
  slug: string;
  icon: string;
  title: string;
  exampleId: string;
}

interface GradientStops {
  from: string;
  via?: string;
  to: string;
}

const FEATURE_GRADIENTS: Record<string, GradientStops> = {
  'ai-assistant': {from: '#4338ca', via: '#7c3aed', to: '#ec4899'},
  topology: {from: '#4338ca', to: '#7c3aed'},
  collection: {from: '#4f46e5', to: '#0ea5e9'},
  compliance: {from: '#047857', to: '#0d9488'},
  reports: {from: '#ea580c', to: '#e11d48'},
  monitoring: {from: '#0ea5e9', to: '#4f46e5'},
  lifecycle: {from: '#d97706', to: '#e11d48'},
  scalable: {from: '#0ea5e9', to: '#0891b2'},
  'multi-tenant': {from: '#7c3aed', to: '#4f46e5'},
  labs: {from: '#ec4899', to: '#9333ea'},
  backup: {from: '#334155', to: '#4f46e5'},
  'auth-sso': {from: '#10b981', to: '#4338ca'},
  api: {from: '#475569', to: '#d946ef'},
};

const DEFAULT_GRADIENT: GradientStops = {from: '#4f46e5', via: '#7c3aed', to: '#ec4899'};

export default function FeatureExamplePlaceholder({
  slug,
  icon,
  title,
  exampleId,
}: FeatureExamplePlaceholderProps): React.JSX.Element {
  const grad = FEATURE_GRADIENTS[slug] ?? DEFAULT_GRADIENT;
  const gradId = `fexp-bg-${slug}-${exampleId}`;
  const gridId = `fexp-grid-${slug}-${exampleId}`;

  return (
    <svg
      viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${title} — animation coming soon`}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={grad.from} />
          {grad.via && <stop offset="50%" stopColor={grad.via} />}
          <stop offset="100%" stopColor={grad.to} />
        </linearGradient>
        <pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${gradId})`} />
      <rect width="100%" height="100%" fill={`url(#${gridId})`} />
      <text
        x="640"
        y="320"
        textAnchor="middle"
        fontSize="160"
        fontFamily="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">
        {icon}
      </text>
      <text
        x="640"
        y="460"
        textAnchor="middle"
        fontSize="44"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={700}
        fill="white">
        {title}
      </text>
      <text
        x="640"
        y="510"
        textAnchor="middle"
        fontSize="20"
        fontFamily="Inter, system-ui, sans-serif"
        fill="rgba(255,255,255,0.75)">
        Animation coming soon
      </text>
    </svg>
  );
}
