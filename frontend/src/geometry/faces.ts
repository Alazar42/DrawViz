import { DrawingLine, Face3D, IsoplanePlane, Point3D } from '../types/drawing';

function ptKey(p: Point3D): string {
  return `${p.x},${p.y},${p.z || 0}`;
}

// Logical to Three world space conversion:
// X_three = X_logical, Y_three = Z_logical (Up), Z_three = Y_logical (Depth)
function logicalToThreeVec(p: Point3D): [number, number, number] {
  return [p.x, p.z || 0, p.y];
}

interface CachedFaces {
  linesRef: DrawingLine[];
  faces: Face3D[];
}

let faceCache: CachedFaces | null = null;

/**
 * Extracts coplanar faces (3-cycles and 4-cycles) from 3D line wireframe geometry.
 * Memoized by lines array reference for O(1) retrieval across components.
 */
export function extractFacesFromLines(lines: DrawingLine[]): Face3D[] {
  if (!lines || lines.length < 3) {
    return [];
  }

  // Check cache
  if (faceCache && faceCache.linesRef === lines) {
    return faceCache.faces;
  }

  const adj = new Map<string, { pt: Point3D; neighbors: Map<string, Point3D> }>();

  for (const line of lines) {
    const k1 = ptKey(line.start);
    const k2 = ptKey(line.end);
    if (k1 === k2) continue;

    if (!adj.has(k1)) adj.set(k1, { pt: line.start, neighbors: new Map() });
    if (!adj.has(k2)) adj.set(k2, { pt: line.end, neighbors: new Map() });

    adj.get(k1)!.neighbors.set(k2, line.end);
    adj.get(k2)!.neighbors.set(k1, line.start);
  }

  const seenFaces = new Set<string>();
  const facesList: Face3D[] = [];

  const keys = Array.from(adj.keys());

  for (let i = 0; i < keys.length; i++) {
    const k0 = keys[i];
    const node0 = adj.get(k0)!;
    const p0 = node0.pt;
    const v0 = logicalToThreeVec(p0);

    const neighbors0 = Array.from(node0.neighbors.entries());

    for (const [k1, p1] of neighbors0) {
      if (k1 < k0) continue; // Enforce ordering to prevent redundant cycles
      const node1 = adj.get(k1)!;
      const v1 = logicalToThreeVec(p1);

      const neighbors1 = Array.from(node1.neighbors.entries());

      for (const [k2, p2] of neighbors1) {
        if (k2 === k0) continue;
        const node2 = adj.get(k2)!;
        const v2 = logicalToThreeVec(p2);

        // 1. Check Triangle Face (p0 -> p1 -> p2 -> p0)
        if (node2.neighbors.has(k0)) {
          const triKeys = [k0, k1, k2].sort().join('|');
          if (!seenFaces.has(triKeys)) {
            seenFaces.add(triKeys);

            // Compute Normal
            const ax = v1[0] - v0[0];
            const ay = v1[1] - v0[1];
            const az = v1[2] - v0[2];

            const bx = v2[0] - v0[0];
            const by = v2[1] - v0[1];
            const bz = v2[2] - v0[2];

            let nx = ay * bz - az * by;
            let ny = az * bx - ax * bz;
            let nz = ax * by - ay * bx;
            const len = Math.hypot(nx, ny, nz);

            if (len > 1e-4) {
              nx /= len;
              ny /= len;
              nz /= len;

              let facePlane: IsoplanePlane = 'top';
              let elev = Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0)) / 3);
              if (Math.abs(ny) >= Math.abs(nx) && Math.abs(ny) >= Math.abs(nz)) {
                facePlane = 'top';
                elev = Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0)) / 3);
              } else if (Math.abs(nz) >= Math.abs(nx)) {
                facePlane = 'front';
                elev = Math.round((p0.y + p1.y + p2.y) / 3);
              } else {
                facePlane = 'side';
                elev = Math.round((p0.x + p1.x + p2.x) / 3);
              }

              facesList.push({
                id: `face-tri-${triKeys}`,
                normal: { x: Math.round(nx), y: Math.round(nz), z: Math.round(ny) },
                center: {
                  x: Math.round((p0.x + p1.x + p2.x) / 3),
                  y: Math.round((p0.y + p1.y + p2.y) / 3),
                  z: Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0)) / 3),
                },
                vertices: [p0, p1, p2],
                plane: facePlane,
                elevation: elev,
              });
            }
          }
        }

        // 2. Check Quad Face (p0 -> p1 -> p2 -> p3 -> p0)
        for (const [k3, p3] of node2.neighbors.entries()) {
          if (k3 === k0 || k3 === k1) continue;
          const node3 = adj.get(k3)!;

          if (node3.neighbors.has(k0)) {
            const quadKeys = [k0, k1, k2, k3].sort().join('|');
            if (!seenFaces.has(quadKeys)) {
              seenFaces.add(quadKeys);

              const v3 = logicalToThreeVec(p3);

              // Normal via vectors (v1-v0) x (v2-v0)
              const ax = v1[0] - v0[0];
              const ay = v1[1] - v0[1];
              const az = v1[2] - v0[2];

              const bx = v2[0] - v0[0];
              const by = v2[1] - v0[1];
              const bz = v2[2] - v0[2];

              let nx = ay * bz - az * by;
              let ny = az * bx - ax * bz;
              let nz = ax * by - ay * bx;
              const len = Math.hypot(nx, ny, nz);

              if (len > 1e-4) {
                nx /= len;
                ny /= len;
                nz /= len;

                // Check coplanarity of v3: dot((v3 - v0), normal) ~ 0
                const dot = (v3[0] - v0[0]) * nx + (v3[1] - v0[1]) * ny + (v3[2] - v0[2]) * nz;
                if (Math.abs(dot) < 0.2) {
                  let facePlane: IsoplanePlane = 'top';
                  let elev = Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0) + (p3.z || 0)) / 4);

                  if (Math.abs(ny) >= Math.abs(nx) && Math.abs(ny) >= Math.abs(nz)) {
                    facePlane = 'top';
                    elev = Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0) + (p3.z || 0)) / 4);
                  } else if (Math.abs(nz) >= Math.abs(nx)) {
                    facePlane = 'front';
                    elev = Math.round((p0.y + p1.y + p2.y + p3.y) / 4);
                  } else {
                    facePlane = 'side';
                    elev = Math.round((p0.x + p1.x + p2.x + p3.x) / 4);
                  }

                  facesList.push({
                    id: `face-${quadKeys}`,
                    normal: { x: Math.round(nx), y: Math.round(nz), z: Math.round(ny) },
                    center: {
                      x: Math.round((p0.x + p1.x + p2.x + p3.x) / 4),
                      y: Math.round((p0.y + p1.y + p2.y + p3.y) / 4),
                      z: Math.round(((p0.z || 0) + (p1.z || 0) + (p2.z || 0) + (p3.z || 0)) / 4),
                    },
                    vertices: [p0, p1, p2, p3],
                    plane: facePlane,
                    elevation: elev,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  faceCache = {
    linesRef: lines,
    faces: facesList,
  };

  return facesList;
}
