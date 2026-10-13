/** Pystysuuntainen puolikaukalo (punaviivasta päätyyn) mittasuhteiltaan oikein: 85 ft × 100 ft → 850 × 1000. */
export default function HalfRink({ className = '' }: { className?: string }) {
  const red = '#c8102e', blue = '#0b4ea2';
  return (
    <svg viewBox="0 0 850 1000" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <clipPath id="rink-clip"><path d="M0 0 H850 V720 A280 280 0 0 1 570 1000 H280 A280 280 0 0 1 0 720 Z" /></clipPath>
        {/* Kevyesti kulunut jää: sävyvaihtelu + luistimen jäljet */}
        <radialGradient id="ice-g" cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#f4f8fb" /><stop offset="0.7" stopColor="#e3edf3" /><stop offset="1" stopColor="#d3e0e8" />
        </radialGradient>
        <filter id="ice-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.65  0 0 0 0 0.75  0 0 0 0.16 0" />
        </filter>
        <filter id="ice-cloud">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3" />
          <feColorMatrix values="0 0 0 0 0.75  0 0 0 0 0.82  0 0 0 0 0.88  0 0 0 0.22 0" />
        </filter>
      </defs>
      <g clipPath="url(#rink-clip)">
        <rect width="850" height="1000" fill="url(#ice-g)" />
        <rect width="850" height="1000" filter="url(#ice-cloud)" />
        <rect width="850" height="1000" filter="url(#ice-noise)" transform="rotate(-8 425 500)" />
        {/* Punaviiva + keskiympyrän puolikas ja aloituspiste */}
        <rect y="0" width="850" height="12" fill={red} opacity="0.85" />
        <path d="M275 0 A150 150 0 0 0 575 0" fill="none" stroke={blue} strokeWidth="4" opacity="0.7" />
        <circle cx="425" cy="0" r="12" fill={blue} opacity="0.8" />
        {/* Siniviiva */}
        <rect y="354" width="850" height="12" fill={blue} opacity="0.85" />
        {/* Keskialueen aloituspisteet */}
        {[205, 645].map((x) => <circle key={x} cx={x} cy="310" r="10" fill={red} opacity="0.8" />)}
        {/* Päädyn aloitusympyrät + pisteet + hash-merkit */}
        {[205, 645].map((x) => (
          <g key={x} stroke={red} strokeWidth="4" fill="none" opacity="0.75">
            <circle cx={x} cy="690" r="150" />
            <circle cx={x} cy="690" r="10" fill={red} stroke="none" />
            <path d={`M${x - 30} 536 v-20 M${x + 30} 536 v-20 M${x - 30} 844 v20 M${x + 30} 844 v20`} />
            <path d={`M${x - 20} 674 h-40 M${x + 20} 674 h40 M${x - 20} 706 h-40 M${x + 20} 706 h40 M${x - 20} 674 v-25 M${x + 20} 674 v-25 M${x - 20} 706 v25 M${x + 20} 706 v25`} />
          </g>
        ))}
        {/* Maaliviiva, maalialue, maali ja trapetsi */}
        <rect y="888" width="850" height="4" fill={red} opacity="0.8" />
        <path d="M365 890 A60 60 0 0 1 485 890 Z" fill="#7cb7e8" fillOpacity="0.45" stroke={red} strokeWidth="3" />
        <rect x="395" y="890" width="60" height="38" rx="10" fill="none" stroke={red} strokeWidth="5" opacity="0.9" />
        <path d="M335 890 L285 1000 M515 890 L565 1000" stroke={red} strokeWidth="3" opacity="0.7" />
      </g>
      {/* Laidat */}
      <path d="M0 0 H850 V720 A280 280 0 0 1 570 1000 H280 A280 280 0 0 1 0 720 Z" fill="none" stroke="#e2e8f0" strokeWidth="10" opacity="0.9" />
    </svg>
  );
}
