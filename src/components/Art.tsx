// The app's own artwork: a striped evening sun over water with two palms.

function Palm({ x, height, lean }: { x: number; height: number; lean: number }) {
  const top = 200 - height;
  const tipX = x + lean;
  const fronds = [-150, -115, -80, -45, -10, 25];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      <path d={`M${x} 200 Q${x + lean * 0.2} ${200 - height * 0.5} ${tipX} ${top}`} strokeWidth="4" />
      {fronds.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        const endX = tipX + Math.cos(radians) * 34;
        const endY = top + Math.sin(radians) * 34 + 16;
        const midX = tipX + Math.cos(radians) * 22;
        const midY = top + Math.sin(radians) * 22 - 6;
        return <path key={angle} d={`M${tipX} ${top} Q${midX} ${midY} ${endX} ${endY}`} strokeWidth="3.4" />;
      })}
    </g>
  );
}

export function Sunset({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 220"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id="art-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sun-top)" />
          <stop offset="0.55" stopColor="var(--sun-mid)" />
          <stop offset="1" stopColor="var(--sun-low)" />
        </linearGradient>
        <mask id="art-stripes">
          <rect width="320" height="220" fill="#fff" />
          <rect x="60" y="118" width="200" height="4" fill="#000" />
          <rect x="60" y="134" width="200" height="6" fill="#000" />
          <rect x="60" y="152" width="200" height="8" fill="#000" />
          <rect x="60" y="172" width="200" height="10" fill="#000" />
        </mask>
      </defs>
      <circle cx="160" cy="120" r="84" fill="url(#art-sun)" mask="url(#art-stripes)" />
      <rect x="0" y="200" width="320" height="3" fill="var(--teal)" opacity="0.8" />
      <g className="art-palms">
        <Palm x={58} height={120} lean={16} />
        <Palm x={264} height={96} lean={-14} />
      </g>
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" className="logo" />;
}
