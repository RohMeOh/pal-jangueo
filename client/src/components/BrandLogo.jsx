/** Pa'l Jangueo wordmark: Nunito outline + a solid white star. */
export default function BrandLogo({ footer = false }) {
  return (
    <span className={`pj-brand${footer ? ' pj-brand-footer' : ''}`} role="img" aria-label="Pa'l Jangueo">
      <span className="pj-brand-outline" aria-hidden="true">PA’L</span>
      <span className="pj-brand-star" aria-hidden="true">★</span>
      <span className="pj-brand-outline" aria-hidden="true">JANGUEO</span>
      <span className="pj-brand-dot" aria-hidden="true" />
    </span>
  );
}
