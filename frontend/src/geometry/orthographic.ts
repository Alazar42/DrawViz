import { DrawingLine, Point3D, ScreenPoint } from '../types/drawing';

export interface OrthoLine2D {
  id: string;
  start: ScreenPoint;
  end: ScreenPoint;
  layerId: string;
  depth: number; // Camera depth for front-line priority selection
  isOccluded?: boolean;
}

export type OrthoViewType = 'top' | 'front' | 'side';

interface PlanarFace {
  vertices: Point3D[];
  normal: { x: number; y: number; z: number };
  planeDist: number; // n . p = D
  lineIds: Set<string>;
}

// Helper: Point in 2D polygon test
function isPointInsidePoly(pt: ScreenPoint, poly: ScreenPoint[], boundaryTolerance = 0.04): boolean {
  // Check if point is right on boundary
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p1 = poly[i];
    const p2 = poly[j];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0.0001) {
      const t = Math.max(0, Math.min(1, ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq));
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.hypot(pt.x - projX, pt.y - projY);
      if (dist < boundaryTolerance) {
        return false; // On boundary, not strictly inside
      }
    }
  }

  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Extracts planar faces (triangles and quadrilaterals) from connected lines
 */
function extractPlanarFaces(lines: DrawingLine[]): PlanarFace[] {
  const faces: PlanarFace[] = [];
  const ptKey = (p: Point3D) => `${p.x},${p.y},${p.z || 0}`;

  // Build adjacency
  const adj = new Map<string, { pt: Point3D; neighbors: { pt: Point3D; lineId: string }[] }>();

  for (const line of lines) {
    const k1 = ptKey(line.start);
    const k2 = ptKey(line.end);
    if (!adj.has(k1)) adj.set(k1, { pt: line.start, neighbors: [] });
    if (!adj.has(k2)) adj.set(k2, { pt: line.end, neighbors: [] });
    adj.get(k1)!.neighbors.push({ pt: line.end, lineId: line.id });
    adj.get(k2)!.neighbors.push({ pt: line.start, lineId: line.id });
  }

  const seenCycleKeys = new Set<string>();

  // Find 3-cycles and 4-cycles
  for (const [k0, node0] of adj.entries()) {
    const p0 = node0.pt;
    for (const edge0 of node0.neighbors) {
      const p1 = edge0.pt;
      const k1 = ptKey(p1);
      const node1 = adj.get(k1)!;

      for (const edge1 of node1.neighbors) {
        const p2 = edge1.pt;
        const k2 = ptKey(p2);
        if (k2 === k0) continue;
        const node2 = adj.get(k2)!;

        // Check 3-cycle (Triangle)
        for (const edge2 of node2.neighbors) {
          if (ptKey(edge2.pt) === k0) {
            const sortedKeys = [k0, k1, k2].sort().join('|');
            if (!seenCycleKeys.has(sortedKeys)) {
              seenCycleKeys.add(sortedKeys);
              // Compute normal
              const v1x = p1.x - p0.x, v1y = p1.y - p0.y, v1z = (p1.z || 0) - (p0.z || 0);
              const v2x = p2.x - p0.x, v2y = p2.y - p0.y, v2z = (p2.z || 0) - (p0.z || 0);
              const nx = v1y * v2z - v1z * v2y;
              const ny = v1z * v2x - v1x * v2z;
              const nz = v1x * v2y - v1y * v2x;
              const len = Math.hypot(nx, ny, nz);
              if (len > 0.001) {
                const norm = { x: nx / len, y: ny / len, z: nz / len };
                const planeDist = norm.x * p0.x + norm.y * p0.y + norm.z * (p0.z || 0);
                faces.push({
                  vertices: [p0, p1, p2],
                  normal: norm,
                  planeDist,
                  lineIds: new Set([edge0.lineId, edge1.lineId, edge2.lineId]),
                });
              }
            }
          }
        }

        // Check 4-cycle (Quadrilateral)
        for (const edge2 of node2.neighbors) {
          const p3 = edge2.pt;
          const k3 = ptKey(p3);
          if (k3 === k0 || k3 === k1) continue;
          const node3 = adj.get(k3);
          if (!node3) continue;

          for (const edge3 of node3.neighbors) {
            if (ptKey(edge3.pt) === k0) {
              const sortedKeys = [k0, k1, k2, k3].sort().join('|');
              if (!seenCycleKeys.has(sortedKeys)) {
                seenCycleKeys.add(sortedKeys);
                // Compute normal
                const v1x = p1.x - p0.x, v1y = p1.y - p0.y, v1z = (p1.z || 0) - (p0.z || 0);
                const v2x = p2.x - p0.x, v2y = p2.y - p0.y, v2z = (p2.z || 0) - (p0.z || 0);
                const nx = v1y * v2z - v1z * v2y;
                const ny = v1z * v2x - v1x * v2z;
                const nz = v1x * v2y - v1y * v2x;
                const len = Math.hypot(nx, ny, nz);
                if (len > 0.001) {
                  const norm = { x: nx / len, y: ny / len, z: nz / len };
                  const planeDist = norm.x * p0.x + norm.y * p0.y + norm.z * (p0.z || 0);
                  // Check coplanarity of p3
                  const distP3 = Math.abs(norm.x * p3.x + norm.y * p3.y + norm.z * (p3.z || 0) - planeDist);
                  if (distP3 < 0.05) {
                    faces.push({
                      vertices: [p0, p1, p2, p3],
                      normal: norm,
                      planeDist,
                      lineIds: new Set([edge0.lineId, edge1.lineId, edge2.lineId, edge3.lineId]),
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return faces;
}

/**
 * Projects true 3D lines (X, Y, Z) directly to 2D technical orthographic views
 * using precise Virtual Camera transformations and plane occlusion (Hidden Line Removal).
 */
export function projectToOrthoView(
  lines: DrawingLine[],
  viewType: OrthoViewType,
  bounds: { width: number; height: number },
  gridCellSize: number = 20,
  options: { hideOccluded?: boolean } = { hideOccluded: true }
): { projectedLines: OrthoLine2D[]; viewBox: { minX: number; minY: number; maxX: number; maxY: number } } {
  if (lines.length === 0) {
    return {
      projectedLines: [],
      viewBox: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height },
    };
  }

  const projectPoint = (pt: Point3D): { u: number; v: number; depth: number } => {
    const x = pt.x;
    const y = pt.y;
    const z = pt.z || 0;

    switch (viewType) {
      case 'front':
        // FRONTAL: looking from front +X towards -X
        // Horizontal: Y, Vertical: -Z, Depth: X (higher X is closer to front camera)
        return { u: y, v: -z, depth: x };

      case 'side':
        // LATERAL: looking from right side +Y towards -Y
        // Horizontal: -X, Vertical: -Z, Depth: Y (higher Y is closer to side camera)
        return { u: -x, v: -z, depth: y };

      case 'top':
        // PLANTA: looking down from +Z onto horizontal plane
        // Horizontal: Y, Vertical: X, Depth: Z (higher Z is closer to top camera)
        return { u: y, v: x, depth: z };
    }
  };

  // 1. Detect Planar Faces for Occlusion Testing
  const planarFaces = extractPlanarFaces(lines);

  interface ProjectedFace {
    poly2D: ScreenPoint[];
    lineIds: Set<string>;
    depthAtPt: (u: number, v: number) => number | null;
    avgDepth: number;
  }

  const projectedFaces: ProjectedFace[] = [];

  for (const face of planarFaces) {
    const pts = face.vertices.map(projectPoint);
    const poly2D: ScreenPoint[] = pts.map((p) => ({ x: p.u, y: p.v }));
    const avgDepth = pts.reduce((sum, p) => sum + p.depth, 0) / pts.length;

    // Check if face is facing or inclined towards camera
    let facingWeight = 0;
    if (viewType === 'front') facingWeight = Math.abs(face.normal.x);
    else if (viewType === 'side') facingWeight = Math.abs(face.normal.y);
    else facingWeight = Math.abs(face.normal.z);

    // If face is perpendicular to camera view, its 2D area collapses to a line, so it doesn't occlude
    if (facingWeight < 0.05) continue;

    const depthAtPt = (u: number, v: number): number | null => {
      const { normal, planeDist } = face;
      if (viewType === 'front') {
        if (Math.abs(normal.x) < 0.01) return null;
        // u = Y, v = -Z => Y = u, Z = -v. X = (planeDist - normal.y*u + normal.z*v) / normal.x
        return (planeDist - normal.y * u + normal.z * v) / normal.x;
      } else if (viewType === 'side') {
        if (Math.abs(normal.y) < 0.01) return null;
        // u = -X, v = -Z => X = -u, Z = -v. Y = (planeDist + normal.x*u + normal.z*v) / normal.y
        return (planeDist + normal.x * u + normal.z * v) / normal.y;
      } else {
        // 'top'
        if (Math.abs(normal.z) < 0.01) return null;
        // u = Y, v = X => Y = u, X = v. Z = (planeDist - normal.x*v - normal.y*u) / normal.z
        return (planeDist - normal.x * v - normal.y * u) / normal.z;
      }
    };

    projectedFaces.push({
      poly2D,
      lineIds: face.lineIds,
      depthAtPt,
      avgDepth,
    });
  }

  // 2. Project Each Line Segment
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;

  const rawProjected: {
    id: string;
    p1: ScreenPoint;
    p2: ScreenPoint;
    layerId: string;
    depth: number;
    isOccluded: boolean;
  }[] = [];

  for (const line of lines) {
    const c1 = projectPoint(line.start);
    const c2 = projectPoint(line.end);

    // Filter out lines perpendicular to camera view that collapse to a single point
    const len = Math.hypot(c2.u - c1.u, c2.v - c1.v);
    if (len < 0.01) {
      continue;
    }

    minU = Math.min(minU, c1.u, c2.u);
    maxU = Math.max(maxU, c1.u, c2.u);
    minV = Math.min(minV, c1.v, c2.v);
    maxV = Math.max(maxV, c1.v, c2.v);

    const avgDepth = (c1.depth + c2.depth) / 2;

    // Occlusion Test: Is this line segment occluded by any foreground planar face?
    let isOccluded = false;
    const midU = (c1.u + c2.u) / 2;
    const midV = (c1.v + c2.v) / 2;
    const midPt: ScreenPoint = { x: midU, y: midV };

    for (const face of projectedFaces) {
      // An edge that belongs to this face is not occluded by this face
      if (face.lineIds.has(line.id)) continue;

      // Test if midpoint is inside the projected polygon
      if (isPointInsidePoly(midPt, face.poly2D, 0.05)) {
        const faceDepth = face.depthAtPt(midU, midV);
        // If face is strictly in front of the line (larger depth = closer to camera)
        if (faceDepth !== null && faceDepth > avgDepth + 0.08) {
          isOccluded = true;
          break;
        }
      }
    }

    rawProjected.push({
      id: line.id,
      p1: { x: c1.u, y: c1.v },
      p2: { x: c2.u, y: c2.v },
      layerId: line.layerId,
      depth: avgDepth,
      isOccluded,
    });
  }

  // Filter out occluded lines if hideOccluded is enabled (reference app style)
  const visibleLines = options.hideOccluded ? rawProjected.filter((l) => !l.isOccluded) : rawProjected;

  if (visibleLines.length === 0) {
    return {
      projectedLines: [],
      viewBox: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height },
    };
  }

  // Sort by depth so front-most lines render on top
  visibleLines.sort((a, b) => a.depth - b.depth);

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

  const projectedLines: OrthoLine2D[] = visibleLines.map((item) => ({
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
    isOccluded: item.isOccluded,
  }));

  return {
    projectedLines,
    viewBox: { minX: minU, minY: minV, maxX: maxU, maxY: maxV },
  };
}
