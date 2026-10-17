// Vanha yläpalkin logo (kilpi + kiekko), talletettu 17.10.2026 ennen HG-vaakunaa.
export function LegacyLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
      </defs>
      <path d="M32 3 56 12v20c0 15-10.5 25-24 29C18.5 57 8 47 8 32V12z" fill="#0b1630" stroke="url(#lg)" strokeWidth="3" />
      <ellipse cx="32" cy="38" rx="14" ry="5" fill="#e2e8f0" />
      <path d="M18 38v4c0 2.8 6.3 5 14 5s14-2.2 14-5v-4" fill="#94a3b8" />
      <path d="M22 26 32 14l10 12" fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

