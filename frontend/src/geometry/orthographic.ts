import { DrawingLine, Point3D, ScreenPoint } from '../types/drawing';
import { gridToWorld, COS_30 } from './isometric';

export interface OrthoLine2D {
  id: string;
  start: ScreenPoint;
  end: ScreenPoint;
  layerId: string;
  depth: number; // Camera depth for front-line priority
}

export type OrthoViewType = 'top' | 'front' | 'side';

export interface Point3DResolved {
  x: number;
  y: number;
  z: number;
}

/**
 * Resolves true 3D spatial coordinates (X, Y, Z) from drawn 2D isometric lines
 */
export function resolve3DCoordinates(
  lines: DrawingLine[],
  unitSize: number = 28
): Map<string, Point3DResolved> {
  const coordMap = new Map<string, Point3DResolved>();
  if (lines.length === 0) return coordMap;

  const keyOf = (p: Point3D) =>
    `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10},${Math.round((p.z || 0) * 10) / 10}`;

  // Build adjacency graph of vertices
  interface Edge {
    toKey: string;
    toPt: Point3D;
    fromPt: Point3D;
  }
  const adj = new Map<string, Edge[]>();

  for (const line of lines) {
    const k1 = keyOf(line.start);
    const k2 = keyOf(line.end);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push({ toKey: k2, toPt: line.end, fromPt: line.start });
    adj.get(k2)!.push({ toKey: k1, toPt: line.start, fromPt: line.end });
  }

  const visited = new Set<string>();

  // Determine 3D displacement for an edge using dot-product axis alignment
  const get3DDelta = (pFrom: Point3D, pTo: Point3D): { dx: number; dy: number; dz: number } => {
    const zFrom = pFrom.z || 0;
    const zTo = pTo.z || 0;
    const dzDirect = zTo - zFrom;

    const w1 = gridToWorld(pFrom.x, pFrom.y, 0, unitSize);
    const w2 = gridToWorld(pTo.x, pTo.y, 0, unitSize);

    const dwx = (w2.x - w1.x) / unitSize;
    const dwy = (w2.y - w1.y) / unitSize;
    const len = Math.hypot(dwx, dwy);

    if (len < 0.001) {
      return { dx: 0, dy: 0, dz: 0 };
    }

    const vx = dwx / len;
    const vy = dwy / len;

    // Dot product with principal axes:
    // Z axis: (0, -1)
    const dotZ = -vy;
    // Front X axis (down-left): (-COS_30, 0.5)
    const dotX = -vx * COS_30 + vy * 0.5;
    // Side Y axis (down-right): (COS_30, 0.5)
    const dotY = vx * COS_30 + vy * 0.5;

    // 1. Vertical line (Z axis)
    if (Math.abs(dotZ) > 0.88 || Math.abs(dwx) < 0.05) {
      return { dx: 0, dy: 0, dz: -dwy };
    }

    // 2. Front X axis (down-left: +X, up-right: -X)
    if (Math.abs(dotX) > 0.88) {
      return { dx: -dwx / COS_30, dy: 0, dz: dzDirect };
    }

    // 3. Side Y axis (down-right: +Y, up-left: -Y)
    if (Math.abs(dotY) > 0.88) {
      return { dx: 0, dy: dwx / COS_30, dz: dzDirect };
    }

    // 4. Horizontal line in X-Y plane
    if (Math.abs(vx) > 0.92 || Math.abs(dwy) < 0.05) {
      const dy = dwx / (2 * COS_30);
      return { dx: -dy, dy, dz: dzDirect };
    }

    // 5. Incline / Oblique edge:
    const diff = dwx / COS_30;
    if (Math.abs(dwx) > 0.08) {
      if (dwx > 0 && dwy > 0) {
        // Down-right slope (Y-Z plane)
        const dy = diff;
        const dz = dy * 0.5 - dwy;
        return { dx: 0, dy, dz };
      } else if (dwx < 0 && dwy > 0) {
        // Down-left slope (X-Z plane)
        const dx = -diff;
        const dz = dx * 0.5 - dwy;
        return { dx, dy: 0, dz };
      } else if (dwx > 0 && dwy < 0) {
        // Up-right slope
        const dy = diff;
        const dz = dy * 0.5 - dwy;
        return { dx: 0, dy, dz };
      } else {
        const dx = -diff;
        const dz = dx * 0.5 - dwy;
        return { dx, dy: 0, dz };
      }
    }

    return { dx: 0, dy: 0, dz: -dwy };
  };

  // Traverse connected components
  for (const [startKey, edges] of adj.entries()) {
    if (visited.has(startKey)) continue;

    // Initialize root of component
    const rootPt = edges[0].fromPt;
    coordMap.set(startKey, {
      x: 0,
      y: 0,
      z: rootPt.z || 0,
    });
    visited.add(startKey);

    const queue: string[] = [startKey];

    while (queue.length > 0) {
      const currKey = queue.shift()!;
      const curr3D = coordMap.get(currKey)!;
      const neighborEdges = adj.get(currKey) || [];

      for (const edge of neighborEdges) {
        if (!visited.has(edge.toKey)) {
          const delta = get3DDelta(edge.fromPt, edge.toPt);
          coordMap.set(edge.toKey, {
            x: Math.round((curr3D.x + delta.dx) * 100) / 100,
            y: Math.round((curr3D.y + delta.dy) * 100) / 100,
            z: Math.round((curr3D.z + delta.dz) * 100) / 100,
          });
          visited.add(edge.toKey);
          queue.push(edge.toKey);
        }
      }
    }
  }

  return coordMap;
}

/**
 * Projects 3D/isometric lines to 2D true orthographic technical drawing views using standard Virtual Cameras
 */
export function projectToOrthoView(
  lines: DrawingLine[],
  viewType: OrthoViewType,
  bounds: { width: number; height: number },
  gridCellSize: number = 20
): { projectedLines: OrthoLine2D[]; viewBox: { minX: number; minY: number; maxX: number; maxY: number } } {
  if (lines.length === 0) {
    return {
      projectedLines: [],
      viewBox: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height },
    };
  }

  const keyOf = (p: Point3D) =>
    `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10},${Math.round((p.z || 0) * 10) / 10}`;

  const coord3DMap = resolve3DCoordinates(lines);

  // Convert each line to 2D true orthographic projection using Virtual Camera coordinates
  const projected2D: { id: string; p1: ScreenPoint; p2: ScreenPoint; layerId: string; depth: number }[] = [];

  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;

  const projectCamera = (pt3D: Point3DResolved): { u: number; v: number; depth: number } => {
    switch (viewType) {
      case 'front':
        // FRONT CAMERA (looking from front +X to back -X)
        // Horizontal: Y (width across front view)
        // Vertical: -Z (height, upward is negative canvas Y)
        // Depth: X (larger X is closer to front camera)
        return { u: pt3D.y, v: -pt3D.z, depth: pt3D.x };

      case 'side':
        // SIDE CAMERA (looking from right side +Y to left -Y)
        // Horizontal: -X (front +X is on the LEFT, back -X is on the RIGHT)
        // Vertical: -Z (height)
        // Depth: Y (larger Y is closer to side camera)
        return { u: -pt3D.x, v: -pt3D.z, depth: pt3D.y };

      case 'top':
        // TOP CAMERA (looking from top +Z down to -Z)
        // Horizontal: Y (strictly aligns with Front view horizontal axis)
        // Vertical: +X (inverted up-down as requested)
        // Depth: Z (larger Z is closer to top camera)
        return { u: pt3D.y, v: pt3D.x, depth: pt3D.z };
    }
  };

  for (const line of lines) {
    const pt3D_1 = coord3DMap.get(keyOf(line.start)) || { x: line.start.x, y: line.start.y, z: line.start.z || 0 };
    const pt3D_2 = coord3DMap.get(keyOf(line.end)) || { x: line.end.x, y: line.end.y, z: line.end.z || 0 };

    const c1 = projectCamera(pt3D_1);
    const c2 = projectCamera(pt3D_2);

    const len = Math.hypot(c2.u - c1.u, c2.v - c1.v);
    if (len < 0.05) {
      // Perpendicular to camera view: projects to a point
      continue;
    }

    minU = Math.min(minU, c1.u, c2.u);
    maxU = Math.max(maxU, c1.u, c2.u);
    minV = Math.min(minV, c1.v, c2.v);
    maxV = Math.max(maxV, c1.v, c2.v);

    const avgDepth = (c1.depth + c2.depth) / 2;

    projected2D.push({
      id: line.id,
      p1: { x: c1.u, y: c1.v },
      p2: { x: c2.u, y: c2.v },
      layerId: line.layerId,
      depth: avgDepth,
    });
  }

  if (projected2D.length === 0) {
    return {
      projectedLines: [],
      viewBox: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height },
    };
  }

  // Sort by depth so front-most lines appear on top
  projected2D.sort((a, b) => a.depth - b.depth);

  // Center and scale the projection in the given viewport bounds
  const spanU = maxU - minU || 1;
  const spanV = maxV - minV || 1;
  const fitScale = Math.min(
    (bounds.width * 0.72) / (spanU * gridCellSize),
    (bounds.height * 0.72) / (spanV * gridCellSize),
    1.4
  );
  const actualCell = Math.max(12, gridCellSize * (fitScale > 0 ? fitScale : 1));

  const centerU = (minU + maxU) / 2;
  const centerV = (minV + maxV) / 2;
  const cx = bounds.width / 2;
  const cy = bounds.height / 2;

  const projectedLines: OrthoLine2D[] = projected2D.map((item) => ({
    id: item.id,
    start: {
      x: cx + (item.p1.x - centerU) * actualCell,
      y: cy + (item.p1.y - centerV) * actualCell,
    },
    end: {
      x: cx + (item.p2.x - centerU) * actualCell,
      y: cy + (item.p2.y - centerV) * actualCell,
    },
    layerId: item.layerId,
    depth: item.depth,
  }));

  return {
    projectedLines,
    viewBox: { minX: minU, minY: minV, maxX: maxU, maxY: maxV },
  };
}
