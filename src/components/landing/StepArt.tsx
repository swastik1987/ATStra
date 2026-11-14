/** Illustrations for the three "How it works" steps. Decorative: the step text carries the meaning. */

const A = "#1D4FD8";
const TINT = "#E8EEFC";
const SOFT = "#C9D6FF";
const INK = "#14181F";
const LINE = "#D9DEE6";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 280 160" className="w-full h-auto" aria-hidden="true">
      <rect width="280" height="160" rx="14" fill="#F4F6F9" />
      <circle cx="248" cy="24" r="40" fill={TINT} opacity="0.7" />
      {children}
    </svg>
  );
}

/** A two-column PDF turning into ordered lines. */
export function StepUploadArt() {
  return (
    <Frame>
      <g transform="translate(34 26)">
        <rect width="86" height="110" rx="6" fill="#FFFFFF" stroke={LINE} />
        <rect x="8" y="10" width="24" height="90" rx="3" fill={TINT} />
        <rect x="12" y="16" width="16" height="3" rx="1.5" fill={A} />
        <rect x="12" y="24" width="14" height="2.5" rx="1.25" fill={SOFT} />
        <rect x="12" y="30" width="15" height="2.5" rx="1.25" fill={SOFT} />
        {[14, 24, 34, 50, 60, 70, 84, 94].map((y, i) => (
          <rect key={y} x="38" y={y} width={i % 3 === 0 ? 30 : 40} height="3" rx="1.5" fill={i % 3 === 0 ? INK : LINE} />
        ))}
        <rect x="58" y="-8" width="34" height="16" rx="4" fill={A} />
        <text x="75" y="3.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, sans-serif">PDF</text>
      </g>
      <path d="M132 81h22m-6-6 6 6-6 6" stroke={A} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(166 30)">
        <rect width="86" height="102" rx="6" fill="#FFFFFF" stroke={LINE} />
        {[12, 24, 36, 48, 60, 72, 84].map((y, i) => (
          <g key={y}>
            <circle cx="12" cy={y + 1.5} r="4.5" fill={TINT} />
            <text x="12" y={y + 4} textAnchor="middle" fontSize="6" fontWeight="700" fill={A} fontFamily="Inter, sans-serif">{i + 1}</text>
            <rect x="22" y={y} width={i % 2 ? 44 : 56} height="3" rx="1.5" fill={i === 0 ? INK : LINE} />
          </g>
        ))}
      </g>
    </Frame>
  );
}

/** A job posting with highlighted terms feeding a score. */
export function StepJobArt() {
  return (
    <Frame>
      <g transform="translate(26 24)">
        <rect width="132" height="112" rx="6" fill="#FFFFFF" stroke={LINE} />
        <rect x="10" y="10" width="70" height="5" rx="2.5" fill={INK} />
        <rect x="10" y="20" width="44" height="3" rx="1.5" fill={LINE} />
        {[
          [34, [["", 30], ["SQL", 22], ["", 40]]],
          [46, [["", 18], ["Looker", 32], ["", 34]]],
          [58, [["", 44], ["", 30]]],
          [70, [["A/B testing", 48], ["", 30]]],
          [82, [["", 36], ["", 18], ["Python", 30]]],
          [94, [["", 52]]],
        ].map(([y, parts]) => {
          let x = 10;
          return (parts as [string, number][]).map(([label, w], i) => {
            const el = label ? (
              <g key={`${y}-${i}`}>
                <rect x={x} y={(y as number) - 3} width={w} height="9" rx="3" fill={TINT} />
                <text x={x + w / 2} y={(y as number) + 3.6} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#163BA3" fontFamily="Inter, sans-serif">{label}</text>
              </g>
            ) : (
              <rect key={`${y}-${i}`} x={x} y={y as number} width={w} height="3" rx="1.5" fill={LINE} />
            );
            x += w + 5;
            return el;
          });
        })}
      </g>
      <g transform="translate(176 40)">
        <rect width="82" height="80" rx="10" fill="#FFFFFF" stroke={LINE} />
        <circle cx="41" cy="36" r="22" fill="none" stroke={TINT} strokeWidth="6" />
        <circle cx="41" cy="36" r="22" fill="none" stroke={A} strokeWidth="6" strokeLinecap="round" strokeDasharray="100 138" transform="rotate(-90 41 36)" />
        <text x="41" y="40.5" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK} fontFamily="Space Grotesk, sans-serif">72</text>
        <text x="41" y="71" textAnchor="middle" fontSize="7" fontWeight="600" fill="#556070" fontFamily="Inter, sans-serif">out of 100</text>
      </g>
    </Frame>
  );
}

/** A suggestion being accepted and a styled Word file coming out. */
export function StepDocxArt() {
  return (
    <Frame>
      <g transform="translate(24 34)">
        <rect width="118" height="40" rx="7" fill="#FFFFFF" stroke={LINE} />
        <rect x="10" y="10" width="62" height="3" rx="1.5" fill={INK} />
        <rect x="10" y="18" width="80" height="3" rx="1.5" fill={LINE} />
        <rect x="10" y="26" width="34" height="8" rx="3" fill={A} />
        <text x="27" y="32" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, sans-serif">Accept</text>
        <rect x="48" y="26" width="24" height="8" rx="3" fill="#FFFFFF" stroke={LINE} />
      </g>
      <g transform="translate(24 82)">
        <rect width="118" height="40" rx="7" fill="#FFFFFF" stroke={LINE} />
        <rect x="10" y="10" width="54" height="3" rx="1.5" fill={INK} />
        <rect x="10" y="18" width="88" height="3" rx="1.5" fill={LINE} />
        <circle cx="104" cy="29" r="7" fill={TINT} />
        <path d="m100.5 29 2.5 2.5 4.5-4.5" stroke={A} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M152 81h18m-6-6 6 6-6 6" stroke={A} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(182 20)">
        <rect width="76" height="120" rx="6" fill="#FFFFFF" stroke={LINE} />
        <rect x="0" y="0" width="76" height="28" rx="6" fill="#1E1B4B" />
        <rect x="0" y="20" width="76" height="8" fill="#1E1B4B" />
        <rect x="9" y="8" width="40" height="5" rx="2.5" fill="#FFFFFF" />
        <rect x="9" y="17" width="28" height="3" rx="1.5" fill="#C7D2FE" />
        {[38, 72].map((y) => (
          <g key={y}>
            <rect x="9" y={y} width="30" height="3.5" rx="1.75" fill="#3730A3" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <circle cx="11" cy={y + 11 + i * 8} r="1.4" fill="#3730A3" />
                <rect x="15" y={y + 10 + i * 8} width={i === 1 ? 40 : 50} height="2.5" rx="1.25" fill={LINE} />
              </g>
            ))}
          </g>
        ))}
        <rect x="48" y="104" width="22" height="10" rx="3" fill={A} />
        <text x="59" y="111.2" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, sans-serif">DOCX</text>
      </g>
    </Frame>
  );
}
