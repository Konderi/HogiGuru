/** Ed Cherry Trophy: kultainen pokaali, jonka kannesta nousee kirsikkaterttu (yksi haara, kaksi marjaa). */
export default function CherryTrophy({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Ed Cherry Trophy" role="img">
      <defs>
        <linearGradient id="ect-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#b7791f" /><stop offset=".45" stopColor="#fcd34d" /><stop offset="1" stopColor="#b7791f" />
        </linearGradient>
        <radialGradient id="ect-cherry" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fb7185" /><stop offset=".6" stopColor="#be123c" /><stop offset="1" stopColor="#7f1d1d" />
        </radialGradient>
      </defs>
      {/* Kirsikkaterttu: varsi lähtee pokaalin reunalta */}
      <path d="M32 26 C32 16 36 9 44 5" stroke="#4d7c0f" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M44 5 C40 12 36 16 23 20" stroke="#4d7c0f" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M44 5 C47 3 52 4 54 7 C50 8 47 8 44 5Z" fill="#65a30d" />
      <circle cx="23" cy="22" r="5.5" fill="url(#ect-cherry)" />
      <circle cx="33" cy="26" r="5.5" fill="url(#ect-cherry)" />
      <circle cx="21.5" cy="20.3" r="1.5" fill="#fff" opacity=".7" />
      <circle cx="31.5" cy="24.3" r="1.5" fill="#fff" opacity=".7" />
      {/* Pokaali */}
      <path d="M14 28 C6 28 6 40 17 41" stroke="url(#ect-gold)" strokeWidth="3" fill="none" />
      <path d="M50 28 C58 28 58 40 47 41" stroke="url(#ect-gold)" strokeWidth="3" fill="none" />
      <path d="M14 27 H50 C50 40 43 46 32 46 C21 46 14 40 14 27Z" fill="url(#ect-gold)" />
      <rect x="29" y="45" width="6" height="7" fill="url(#ect-gold)" />
      <rect x="21" y="52" width="22" height="4" rx="1" fill="url(#ect-gold)" />
      <rect x="18" y="56" width="28" height="5" rx="1.5" fill="#78350f" />
    </svg>
  );
}
