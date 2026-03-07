const cls = "shrink-0";

interface FlagProps {
  className?: string;
  size?: number;
}

export function FlagUS({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stripes */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <rect key={i} y={i * (40 / 13)} width="60" height={40 / 13} fill={i % 2 === 0 ? "#B22234" : "#fff"} />
      ))}
      {/* Canton */}
      <rect width="24" height="21.54" fill="#3C3B6E" />
      {/* Stars (simplified grid) */}
      {[3, 7, 11, 15, 19].map((y) =>
        [2.4, 7.2, 12, 16.8, 21.6].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#fff" />
        ))
      )}
      {[5, 9, 13, 17].map((y) =>
        [4.8, 9.6, 14.4, 19.2].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#fff" />
        ))
      )}
    </svg>
  );
}

export function FlagFR({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="40" fill="#002395" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#ED2939" />
    </svg>
  );
}

export function FlagES({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="10" fill="#AA151B" />
      <rect y="10" width="60" height="20" fill="#F1BF00" />
      <rect y="30" width="60" height="10" fill="#AA151B" />
    </svg>
  );
}

export function FlagIT({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="40" fill="#009246" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#CE2B37" />
    </svg>
  );
}

export function FlagDE({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="13.33" fill="#000" />
      <rect y="13.33" width="60" height="13.34" fill="#DD0000" />
      <rect y="26.67" width="60" height="13.33" fill="#FFCC00" />
    </svg>
  );
}

export function FlagJP({ className = cls, size = 20 }: FlagProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="12" fill="#BC002D" />
    </svg>
  );
}

const flagComponents = {
  en: FlagUS,
  fr: FlagFR,
  es: FlagES,
  it: FlagIT,
  de: FlagDE,
  ja: FlagJP,
} as const;

export default flagComponents;
