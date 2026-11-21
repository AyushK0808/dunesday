// Original, hand-built scenery for each film's world. No studio artwork is used.

export function DuneScene({ className, viewBox = "0 0 800 420" }: { className?: string; viewBox?: string }) {
  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="dune-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1F1724" />
          <stop offset="0.45" stopColor="#5B2F2A" />
          <stop offset="0.75" stopColor="#C9733A" />
          <stop offset="1" stopColor="#F0B467" />
        </linearGradient>
        <radialGradient id="dune-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFF1CF" />
          <stop offset="0.55" stopColor="#FBD38D" stopOpacity="0.95" />
          <stop offset="1" stopColor="#F3A04A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dune-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C77B43" />
          <stop offset="1" stopColor="#8E4A2A" />
        </linearGradient>
        <linearGradient id="dune-mid" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#A85C31" />
          <stop offset="0.55" stopColor="#7A3D22" />
          <stop offset="1" stopColor="#5C2C19" />
        </linearGradient>
        <linearGradient id="dune-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4C2416" />
          <stop offset="1" stopColor="#1E1218" />
        </linearGradient>
        <filter id="dune-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.75  0 0 0 0 0.5  0 0 0 0.09 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="800" height="420" fill="url(#dune-sky)" />
      <g className="art-sun">
        <circle cx="575" cy="238" r="150" fill="url(#dune-sun)" opacity="0.55" />
        <circle cx="575" cy="238" r="46" fill="#FFE7B5" />
      </g>
      {/* heat haze bands */}
      <rect y="228" width="800" height="3" fill="#FFD9A0" opacity="0.18" />
      <rect y="240" width="800" height="2" fill="#FFD9A0" opacity="0.12" />
      <path d="M0 262 C 110 236 210 246 320 254 C 430 262 520 230 640 236 C 710 240 760 248 800 244 V420 H0 Z" fill="url(#dune-far)" />
      <path d="M0 306 C 120 276 230 268 350 292 C 430 308 500 282 590 270 C 680 258 740 274 800 284 V420 H0 Z" fill="url(#dune-mid)" />
      <path d="M350 292 C 430 308 500 282 590 270 C 680 258 740 274 800 284" fill="none" stroke="#F6C383" strokeOpacity="0.55" strokeWidth="1.4" />
      <path d="M0 352 C 150 312 260 346 420 336 C 560 327 640 302 800 318 V420 H0 Z" fill="url(#dune-near)" />
      <path d="M0 352 C 150 312 260 346 420 336 C 560 327 640 302 800 318" fill="none" stroke="#E79A55" strokeOpacity="0.45" strokeWidth="1.2" />
      {/* wind ripples on the near dune */}
      <g fill="none" stroke="#E8A564" strokeOpacity="0.14" strokeWidth="1">
        <path d="M40 378 C 160 360 260 380 400 370" />
        <path d="M120 396 C 240 380 360 398 520 386" />
        <path d="M460 360 C 560 350 660 338 780 344" />
      </g>
      <rect width="800" height="420" filter="url(#dune-grain)" />
    </svg>
  );
}

const RIVETS = [
  [36, 40], [764, 40], [36, 380], [764, 380], [400, 40], [400, 380], [36, 210], [764, 210],
];

export function IronScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="iron-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A3230" />
          <stop offset="0.5" stopColor="#161D1B" />
          <stop offset="1" stopColor="#0C110F" />
        </linearGradient>
        <filter id="iron-brush" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.002 0.6" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.7  0 0 0 0 0.78  0 0 0 0 0.76  0 0 0 0.11 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <radialGradient id="iron-rivet" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#B9C2C0" />
          <stop offset="0.45" stopColor="#5D6866" />
          <stop offset="1" stopColor="#1A2120" />
        </radialGradient>
        <radialGradient id="iron-fog" cx="0.55" cy="0.55" r="0.55">
          <stop offset="0" stopColor="#45C79A" stopOpacity="0.32" />
          <stop offset="1" stopColor="#45C79A" stopOpacity="0" />
        </radialGradient>
        <filter id="iron-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect width="800" height="420" fill="url(#iron-base)" />
      <rect width="800" height="420" filter="url(#iron-brush)" />
      {/* plate seams */}
      <g stroke="#060908" strokeWidth="3">
        <line x1="400" y1="0" x2="400" y2="420" />
        <line x1="0" y1="210" x2="800" y2="210" />
      </g>
      <g stroke="#56615E" strokeOpacity="0.35" strokeWidth="1">
        <line x1="402.5" y1="0" x2="402.5" y2="420" />
        <line x1="0" y1="212.5" x2="800" y2="212.5" />
      </g>
      {RIVETS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y + 1.5} r="8" fill="#050807" opacity="0.7" />
          <circle cx={x} cy={y} r="7" fill="url(#iron-rivet)" />
        </g>
      ))}
      <ellipse cx="420" cy="56" rx="380" ry="130" fill="url(#iron-fog)" className="art-fog" />
      {/* the fissure */}
      <g className="art-crack">
        <path
          d="M-10 70 L84 52 L142 80 L236 58 L292 88 L388 66 L440 30 L534 48 L596 14 L688 30 L812 -4"
          fill="none"
          stroke="#45C79A"
          strokeWidth="18"
          filter="url(#iron-glow)"
          opacity="0.7"
        />
        <path
          d="M-10 70 L84 52 L142 80 L236 58 L292 88 L388 66 L440 30 L534 48 L596 14 L688 30 L812 -4"
          fill="none"
          stroke="#9DF0CB"
          strokeWidth="3"
          strokeLinejoin="miter"
        />
        <path d="M292 88 L278 106 L292 116" fill="none" stroke="#7FE3B8" strokeWidth="1.6" opacity="0.85" />
        <path d="M534 48 L560 80 L622 90" fill="none" stroke="#7FE3B8" strokeWidth="1.4" opacity="0.8" />
        <path d="M142 80 L126 102" fill="none" stroke="#7FE3B8" strokeWidth="1.2" opacity="0.7" />
      </g>
    </svg>
  );
}

export function PlainScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="plain-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A2536" />
          <stop offset="1" stopColor="#16131D" />
        </linearGradient>
      </defs>
      <rect width="800" height="420" fill="url(#plain-bg)" />
    </svg>
  );
}

export function Scene({ theme, className }: { theme: string; className?: string }) {
  if (theme === "dune") return <DuneScene className={className} />;
  if (theme === "doom") return <IronScene className={className} />;
  return <PlainScene className={className} />;
}
