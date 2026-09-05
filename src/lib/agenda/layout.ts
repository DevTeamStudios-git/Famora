export interface Interval {
  start: number;
  end: number;
}

export interface Placed<T> extends Interval {
  item: T;
  /** 0-based horizontal slot */
  column: number;
  /** total slots in this event's overlap cluster */
  columns: number;
}

const MIN_MS = 15 * 60_000;

/**
 * Greedy interval-graph colouring. Sort by start (longest first on ties), walk
 * forward accumulating a "cluster" of transitively-overlapping events, then
 * place each into the leftmost column that has freed up.
 * [spec §18] "Overlapping events should intelligently share horizontal space."
 */
export function packIntervals<T>(
  items: readonly T[],
  read: (item: T) => Interval,
  minDurationMs = MIN_MS,
): Placed<T>[] {
  const normalised = items
    .map((item) => {
      const { start, end } = read(item);
      return { item, start, end: Math.max(end, start + minDurationMs) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed<T>[] = [];
  let cluster: typeof normalised = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const placed = cluster.map((ev) => {
      let column = columnEnds.findIndex((end) => end <= ev.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(ev.end);
      } else {
        columnEnds[column] = ev.end;
      }
      return { ...ev, column };
    });
    for (const p of placed) out.push({ ...p, columns: columnEnds.length });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const ev of normalised) {
    if (ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();
  return out;
}

/** Geometry for a positioned block inside a day column. */
export function blockStyle(
  placed: Placed<unknown>,
  dayStartMs: number,
  hourHeight: number,
): { top: number; height: number; left: string; width: string } {
  const msPerPx = 3_600_000 / hourHeight;
  const top = (placed.start - dayStartMs) / msPerPx;
  const height = Math.max((placed.end - placed.start) / msPerPx, 18);
  const widthPct = 100 / placed.columns;
  return {
    top,
    height,
    left: `${placed.column * widthPct}%`,
    // small overlap so borders read as layered, like a real calendar
    width: `calc(${widthPct}% - 2px)`,
  };
}
