
/**
 * Vaaniq brand marks — recreated from the logo as inline SVG so they're crisp at
 * any size and theme with `currentColor`.
 *
 *  • <VaaniqWave/>  — just the audio-waveform bars. Drop-in for a brand icon sitting
 *                     inside the teal brand square (use text-white).
 *  • <VaaniqMark/>  — the full speech-bubble + waveform lockup (standalone icon).
 *  • <VaaniqLogo/>  — the mark + "Vaaniq" wordmark, for headers/auth/login.
 */

const WAVE_BARS = [
  { cx: 5,    h: 6  },
  { cx: 8.5,  h: 11 },
  { cx: 12,   h: 15 },
  { cx: 15.5, h: 11 },
  { cx: 19,   h: 6  },
];

/** Waveform bars only — inherits color via currentColor. */
export function VaaniqWave({ className = "icon-md" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {WAVE_BARS.map((b, i) => (
        <rect key={i} x={b.cx - 1.2} y={12 - b.h / 2} width={2.4} height={b.h} rx={1.2} />
      ))}
    </svg>
  );
}

/**
 * Full speech-bubble mark. The bubble is `currentColor` (set text-brand-500),
 * the waveform is the cream brand tint. Includes a bottom-right tail.
 */
export function VaaniqMark({ className = "w-9 h-9", wave = "#FBF7EE" }: { className?: string; wave?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      <path
        d="M13 4 H27 C32.5 4 36 7.5 36 13 V21 C36 26.5 32.5 30 27 30 L29 36 L23 30 H13 C7.5 30 4 26.5 4 21 V13 C4 7.5 7.5 4 13 4 Z"
        fill="currentColor"
      />
      <g fill={wave}>
        {[
          { cx: 11.5, h: 8 },
          { cx: 15.7, h: 14 },
          { cx: 20,   h: 20 },
          { cx: 24.3, h: 14 },
          { cx: 28.5, h: 8 },
        ].map((b, i) => (
          <rect key={i} x={b.cx - 1.3} y={17 - b.h / 2} width={2.6} height={b.h} rx={1.3} />
        ))}
      </g>
    </svg>
  );
}

/** Brand mark + wordmark lockup. */
export function VaaniqLogo({ className = "", markClass = "w-9 h-9", wordClass = "text-xl" }: {
  className?: string; markClass?: string; wordClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <VaaniqMark className={`${markClass} text-brand-500`} />
      <span className={`font-semibold tracking-tight text-neutral-900 ${wordClass}`}>Vaaniq</span>
    </span>
  );
}
