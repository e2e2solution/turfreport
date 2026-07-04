export default function SportMiniAnim({ sport }) {
  switch (sport) {
    case 'turf':
      return (
        <div className="sport-mini-anim sport-mini-turf" aria-hidden="true">
          <svg viewBox="0 0 48 48" className="sport-mini-svg">
            <circle cx="22" cy="9" r="3.5" fill="currentColor" />
            <path d="M22 13v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 25l-5 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <g className="sport-kick-leg">
              <path d="M22 25l8 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </g>
            <path d="M22 17l-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M22 17l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle className="sport-turf-ball" cx="36" cy="36" r="3.5" fill="currentColor" />
          </svg>
        </div>
      );
    case 'badminton':
      return (
        <div className="sport-mini-anim sport-mini-badminton" aria-hidden="true">
          <svg viewBox="0 0 48 48" className="sport-mini-svg">
            <circle cx="20" cy="10" r="3.5" fill="currentColor" />
            <path d="M20 14v11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M20 25l-4 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M20 25l5 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M20 18l-5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <g className="sport-racket-arm">
              <path d="M20 18l8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <ellipse cx="31" cy="17" rx="4" ry="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </g>
            <circle className="sport-shuttle" cx="38" cy="8" r="2" fill="currentColor" />
          </svg>
        </div>
      );
    case 'gym':
      return (
        <div className="sport-mini-anim sport-mini-gym" aria-hidden="true">
          <svg viewBox="0 0 48 48" className="sport-mini-svg">
            <circle cx="22" cy="10" r="3.5" fill="currentColor" />
            <path d="M22 14v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 27l-5 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 27l5 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 18l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <g className="sport-curl-arm">
              <path d="M22 18l7 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="28" y1="18" x2="34" y2="18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
              <rect x="27" y="16" width="2" height="4" rx="0.5" fill="currentColor" />
              <rect x="33" y="16" width="2" height="4" rx="0.5" fill="currentColor" />
            </g>
          </svg>
        </div>
      );
    case 'coaching':
      return (
        <div className="sport-mini-anim sport-mini-coaching" aria-hidden="true">
          <svg viewBox="0 0 48 48" className="sport-mini-svg">
            <circle cx="21" cy="10" r="3.5" fill="currentColor" />
            <path d="M21 14v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M21 26l-4 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <g className="sport-coach-kick">
              <path d="M21 26l9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </g>
            <path d="M21 17l-5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M21 17l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle className="sport-coach-ball" cx="35" cy="37" r="3.2" fill="currentColor" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}
