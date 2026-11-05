// Composition is designed for 16:9. Narrow screens are not scaled copies: vertical subjects keep their
// distance (a standing rocket suits portrait) while horizontal vistas pull back, and off-centre framing
// that exists to leave room for type collapses to the centre.
const REFERENCE_ASPECT = 16 / 9;

export function framingFor(aspect) {
  const narrow = aspect < 1;
  return {
    narrow,
    // pull-back multiplier for shots protecting horizontal coverage
    h: aspect >= REFERENCE_ASPECT ? 1 : Math.pow(REFERENCE_ASPECT / aspect, narrow ? 0.72 : 0.6),
    // pull-back multiplier for shots protecting the vehicle's height
    v: aspect >= 1 ? 1 : 1.12,
    fovAdd: narrow ? 8 : aspect < 1.3 ? 3 : 0,
    compX: aspect >= 1.25 ? 1 : aspect >= 1 ? 0.5 : 0,
    compY: narrow ? 1 : 0,
  };
}
