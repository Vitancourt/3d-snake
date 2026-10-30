// Boxes are { x, z, hw, hd, y0, y1 }: center x/z, half width (x), half depth (z), vertical range.
export function overlap(a, b) {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw &&
    Math.abs(a.z - b.z) < a.hd + b.hd &&
    a.y0 < b.y1 &&
    b.y0 < a.y1
  );
}
