/**
 * Screen-space collision pass for /map pins. Shops are placed greedily in priority order
 * (selected → my shops → live offer → the rest); a shop whose projected point is within `radius`
 * px of an already-placed anchor joins that anchor's group instead of drawing its own pin.
 * So my-shop pins always win over other shops, and a group renders as one pin (+N badge) or one
 * count bubble.
 */
export interface ClusterInput {
  id: string;
  x: number;
  y: number;
  isMember?: boolean;
  hasPromo?: boolean;
}

export interface PinGroup {
  /** The pin that stays visible. */
  anchor: string;
  /** Every shop in the group, anchor first. */
  members: string[];
}

export function priority(p: ClusterInput, selected: string | null): number {
  if (p.id === selected) return 0;
  if (p.isMember) return 1;
  if (p.hasPromo) return 2;
  return 3;
}

export function clusterPins(points: ClusterInput[], opts: { radius?: number; selected?: string | null } = {}): PinGroup[] {
  const radius = opts.radius ?? 44;
  const selected = opts.selected ?? null;
  const ordered = points
    .map((p, i) => ({ p, i, rank: priority(p, selected) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const groups: { anchor: ClusterInput; members: string[] }[] = [];
  const r2 = radius * radius;
  for (const { p } of ordered) {
    let best: (typeof groups)[number] | null = null;
    let bestD = Infinity;
    for (const g of groups) {
      const d = (g.anchor.x - p.x) ** 2 + (g.anchor.y - p.y) ** 2;
      if (d <= r2 && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) best.members.push(p.id);
    else groups.push({ anchor: p, members: [p.id] });
  }
  return groups.map((g) => ({ anchor: g.anchor.id, members: g.members }));
}

/**
 * The densest spot: the shop with the most neighbours within `metres`, and those neighbours.
 * Used to open the map on the busiest strip at street zoom instead of fitting a whole city.
 */
export function densestGroup<T extends { lat: number; lng: number }>(points: T[], metres = 500): T[] {
  if (points.length <= 1) return points;
  const near = (a: T, b: T) => {
    const dy = (a.lat - b.lat) * 111_320;
    const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    return dx * dx + dy * dy <= metres * metres;
  };
  let best: T[] = [points[0]!];
  for (const p of points) {
    const n = points.filter((q) => near(p, q));
    if (n.length > best.length) best = n;
  }
  return best;
}
