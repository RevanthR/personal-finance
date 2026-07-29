// A small hand-drawn scene instead of a stock illustration: a tilted card,
// a sparkline rising off it (draws itself once on mount), and a few coins
// bobbing gently forever after. Two tones only — primary blue for the card,
// the same amber as the ₹ mark for the coins — so it reads as part of this
// app's system, not a dropped-in clipart pack.
export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 220 140"
      width={176}
      height={112}
      style={{ width: "11rem", height: "auto" }}
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="110" cy="122" rx="70" ry="8" fill="var(--foreground)" opacity="0.06" />

      <g className="login-illo-card" style={{ transformOrigin: "70px 90px" }}>
        <rect x="18" y="58" width="104" height="64" rx="14" fill="var(--primary)" />
        <rect x="18" y="76" width="104" height="10" fill="var(--primary-foreground)" opacity="0.14" />
        <circle cx="34" cy="104" r="6" fill="var(--primary-foreground)" opacity="0.5" />
        <text x="48" y="109" fontSize="13" fontWeight="700" fill="var(--primary-foreground)" opacity="0.85">₹</text>
      </g>

      <path
        className="login-illo-line"
        d="M40 92 L64 70 L82 82 L104 48 L128 58 L152 30"
        stroke="var(--positive)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="152" cy="30" r="5" fill="var(--positive)" />

      <g className="login-illo-coin login-illo-coin-1">
        <circle cx="182" cy="70" r="16" fill="var(--warning)" />
        <text x="182" y="75" fontSize="15" fontWeight="700" fill="white" textAnchor="middle">₹</text>
      </g>
      <g className="login-illo-coin login-illo-coin-2">
        <circle cx="24" cy="34" r="10" fill="var(--warning)" opacity="0.85" />
      </g>
      <g className="login-illo-coin login-illo-coin-3">
        <circle cx="196" cy="108" r="8" fill="var(--warning)" opacity="0.7" />
      </g>
    </svg>
  );
}
