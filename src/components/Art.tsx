// The app's own artwork, drawn in code: a striped evening sun, palms and a city skyline over water.

import { useId } from "react";

function Palm({ x, base, height, lean, reach = 34 }: { x: number; base: number; height: number; lean: number; reach?: number }) {
  const top = base - height;
  const tipX = x + lean;
  const fronds = [-155, -120, -85, -50, -15, 20];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      <path d={`M${x} ${base} Q${x + lean * 0.2} ${base - height * 0.5} ${tipX} ${top}`} strokeWidth={reach / 8.5} />
      {fronds.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        const endX = tipX + Math.cos(radians) * reach;
        const endY = top + Math.sin(radians) * reach + reach * 0.47;
        const midX = tipX + Math.cos(radians) * reach * 0.65;
        const midY = top + Math.sin(radians) * reach * 0.65 - reach * 0.18;
        return <path key={angle} d={`M${tipX} ${top} Q${midX} ${midY} ${endX} ${endY}`} strokeWidth={reach / 10} />;
      })}
    </g>
  );
}

/** The small corner drawing behind the text: sun and two palms, tinted by the theme. */
export function Sunset({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 320 220" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sun-top)" />
          <stop offset="0.55" stopColor="var(--sun-mid)" />
          <stop offset="1" stopColor="var(--sun-low)" />
        </linearGradient>
        <mask id={`${id}-stripes`}>
          <rect width="320" height="220" fill="#fff" />
          <rect x="60" y="118" width="200" height="4" fill="#000" />
          <rect x="60" y="134" width="200" height="6" fill="#000" />
          <rect x="60" y="152" width="200" height="8" fill="#000" />
          <rect x="60" y="172" width="200" height="10" fill="#000" />
        </mask>
      </defs>
      <circle cx="160" cy="120" r="84" fill={`url(#${id}-sun)`} mask={`url(#${id}-stripes)`} />
      <rect x="0" y="200" width="320" height="3" fill="var(--teal)" opacity="0.8" />
      <Palm x={58} base={200} height={120} lean={16} />
      <Palm x={264} base={200} height={96} lean={-14} />
    </svg>
  );
}

const buildings: [x: number, width: number, height: number][] = [
  [20, 34, 44],
  [58, 26, 70],
  [88, 40, 52],
  [132, 22, 96],
  [158, 36, 64],
  [198, 28, 118],
  [230, 44, 58],
  [372, 40, 62],
  [416, 26, 104],
  [446, 38, 76],
  [488, 24, 132],
  [516, 42, 56],
  [562, 30, 84],
  [596, 30, 48],
];

const HORIZON = 196;

/** The full picture: night sky, sun, a lit skyline, palms in front and the sun's reflection on water. */
export function Postcard({ className, label }: { className?: string; label?: string }) {
  const id = useId();
  const windows: React.ReactNode[] = [];
  buildings.forEach(([x, width, height], b) => {
    for (let row = 0; row * 9 + 8 < height - 4; row += 1) {
      for (let column = 0; column * 7 + 5 < width - 3; column += 1) {
        const pick = (row * 7 + column * 13 + b * 5) % 6;
        if (pick > 1) continue;
        windows.push(
          <rect
            key={`${b}-${row}-${column}`}
            x={x + 4 + column * 7}
            y={HORIZON - height + 6 + row * 9}
            width="3"
            height="4"
            fill={pick === 0 ? "#ff7ac0" : "#7df3f5"}
            opacity="0.85"
          />,
        );
      }
    }
  });

  return (
    <svg
      className={className}
      viewBox="0 0 640 280"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#150a33" />
          <stop offset="0.42" stopColor="#5a1a8c" />
          <stop offset="0.62" stopColor="#d43f8d" />
          <stop offset="0.72" stopColor="#ff9a3c" />
        </linearGradient>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe66d" />
          <stop offset="0.55" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#ff3d8b" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1466" />
          <stop offset="1" stopColor="#120726" />
        </linearGradient>
        <mask id={`${id}-stripes`}>
          <rect width="640" height="280" fill="#fff" />
          <rect x="200" y="124" width="240" height="4" fill="#000" />
          <rect x="200" y="140" width="240" height="6" fill="#000" />
          <rect x="200" y="158" width="240" height="8" fill="#000" />
          <rect x="200" y="178" width="240" height="10" fill="#000" />
        </mask>
      </defs>
      <rect width="640" height="280" fill={`url(#${id}-sky)`} />
      {[
        [48, 28],
        [122, 52],
        [206, 20],
        [300, 40],
        [402, 24],
        [476, 58],
        [560, 30],
        [612, 66],
        [84, 86],
        [530, 92],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="#fff" opacity="0.7" />
      ))}
      <circle cx="320" cy="132" r="92" fill={`url(#${id}-sun)`} mask={`url(#${id}-stripes)`} />
      <g fill="#170a2e">
        {buildings.map(([x, width, height]) => (
          <rect key={x} x={x} y={HORIZON - height} width={width} height={height} />
        ))}
      </g>
      {windows}
      <rect y={HORIZON} width="640" height={280 - HORIZON} fill={`url(#${id}-sea)`} />
      <rect y={HORIZON} width="640" height="2.5" fill="#2de2e6" />
      {[0, 1, 2, 3, 4, 5].map((step) => (
        <rect
          key={step}
          x={320 - (86 - step * 13)}
          y={HORIZON + 10 + step * 12}
          width={(86 - step * 13) * 2}
          height="3"
          rx="1.5"
          fill={step % 2 ? "#ff9a3c" : "#ff4fa3"}
          opacity={0.75 - step * 0.1}
        />
      ))}
      <g color="#0d0620">
        <Palm x={566} base={HORIZON + 18} height={120} lean={-22} reach={38} />
        <Palm x={612} base={HORIZON + 30} height={178} lean={-18} reach={52} />
        <Palm x={24} base={HORIZON + 30} height={160} lean={14} reach={48} />
      </g>
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" className="logo" />;
}
