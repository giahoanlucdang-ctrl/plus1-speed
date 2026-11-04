// Sweep the whole axis segment, not just the endpoint. No speed-dependent
// substep limit: even a move longer than the wall still hits its near face.
export function sweepAxis(pos, axis, delta, boxes, size, canStep = null) {
  const start = pos[axis];
  const end = start + delta;
  if (!delta) return null;
  const low = { x: size.w / 2, y: 0, z: size.d / 2 };
  const high = { x: size.w / 2, y: size.h, z: size.d / 2 };
  const others = ['x', 'y', 'z'].filter(a => a !== axis);
  const candidates = boxes.filter(box => !box.off &&
    Math.min(start, end) - low[axis] < box.max[axis] &&
    Math.max(start, end) + high[axis] > box.min[axis]);
  const face = box => delta > 0 ? box.min[axis] - high[axis] : box.max[axis] + low[axis];
  candidates.sort((a, b) => delta > 0 ? face(a) - face(b) : face(b) - face(a));
  for (const box of candidates) {
    if (!others.every(a => pos[a] - low[a] < box.max[a] && pos[a] + high[a] > box.min[a])) continue;
    if (canStep?.(box)) continue;
    pos[axis] = delta > 0 ? Math.min(end, face(box)) : Math.max(end, face(box));
    return box;
  }
  pos[axis] = end;
  return null;
}
