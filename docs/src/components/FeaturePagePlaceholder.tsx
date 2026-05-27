import React from 'react';

interface FeaturePagePlaceholderProps {
  icon: string;
  title: string;
  className?: string;
}

/**
 * Inline SVG placeholder used by feature pages when no real screenshot exists.
 * Renders a 16:9 panel with the brand gradient + the feature emoji glyph and
 * label. Works in both light and dark mode without an extra source.
 */
export default function FeaturePagePlaceholder({
  icon,
  title,
  className,
}: FeaturePagePlaceholderProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${title} — screenshot coming soon`}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fpp-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <pattern id="fpp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#fpp-bg)" />
      <rect width="100%" height="100%" fill="url(#fpp-grid)" />
      <text
        x="640"
        y="340"
        textAnchor="middle"
        fontSize="180"
        fontFamily="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">
        {icon}
      </text>
      <text
        x="640"
        y="470"
        textAnchor="middle"
        fontSize="52"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={700}
        fill="white">
        {title}
      </text>
      <text
        x="640"
        y="525"
        textAnchor="middle"
        fontSize="22"
        fontFamily="Inter, system-ui, sans-serif"
        fill="rgba(255,255,255,0.75)">
        Screenshot coming soon
      </text>
    </svg>
  );
}
