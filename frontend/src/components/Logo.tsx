interface LogoProps {
  size?: number;
  className?: string;
  title?: string;
}

export default function Logo({size = 40, className, title = "Auditix"}: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="auditix-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.5" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <path
        d="M20 3 L34 9 V20 C34 28 28 34 20 37 C12 34 6 28 6 20 V9 Z"
        fill="url(#auditix-logo-grad)"
      />
      <path
        d="M14 20.5 L18.5 25 L27 16"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30 6 L31.2 9 L34 10 L31.2 11 L30 14 L28.8 11 L26 10 L28.8 9 Z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}
