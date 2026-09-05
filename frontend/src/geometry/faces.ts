import { DrawingLine, DrawingArc, Face3D, IsoplanePlane, Point3D } from '../types/drawing';
import { getArc3DPoints } from './circle3d';

export function quantizeCoord(v: number): number {
  return Math.round((v || 0) * 20) / 20; // 0.05 tolerance
}

export function ptKey(p: Point3D): string {
  return `${quantizeCoord(p.x)},${quantizeCoord(p.y)},${quantizeCoord(p.z || 0)}`;
}

// Logical to Three world space conversion:
// X_three = X_logical, Y_three = Z_logical (Up), Z_three = Y_logical (Depth)
function logicalToThreeVec(p: Point3D): [number, number, number] {
  return [p.x, p.z || 0, p.y];
}

interface CachedFaces {
  linesRef: DrawingLine[];
  arcsRef?: DrawingArc[];
  faces: Face3D[];
}

let faceCache: CachedFaces | null = null;

/**
 * Extracts all coplanar faces (triangles, quads, and arbitrary N-gons)
 * from 3D line wireframe and arc geometry.
 * Uses Breadth-First Planar Cycle Search to guarantee minimal, chordless faces.
 */
export function extractFacesFromLines(lines: DrawingLine[], arcs?: DrawingArc[]): Face3D[] {
  if ((!lines || lines.length < 3) && (!arcs || arcs.length === 0)) {
    return [];
  }

  // Check cache
  if (faceCache && faceCache.linesRef === lines && faceCache.arcsRef === arcs) {
    return faceCache.faces;
  }

  const adj = new Map<string, { pt: Point3D; neighbors: Map<string, Point3D> }>();
  const edgeMeta = new Map<string, { color?: string; groupId?: string }>();

  function addEdge(p1: Point3D, p2: Point3D, color?: string, groupId?: string) {
    const k1 = ptKey(p1);
    const k2 = ptKey(p2);
    if (k1 === k2) return;

    if (!adj.has(k1)) adj.set(k1, { pt: p1, neighbors: new Map() });
    if (!adj.has(k2)) adj.set(k2, { pt: p2, neighbors: new Map() });

    adj.get(k1)!.neighbors.set(k2, p2);
    adj.get(k2)!.neighbors.set(k1, p1);

    const edgeKey = k1 < k2 ? `${k1}---${k2}` : `${k2}---${k1}`;
    if (color || groupId) {
      edgeMeta.set(edgeKey, { color, groupId });
    }
  }

  // 1. Add all wireframe lines
  if (lines) {
    for (const line of lines) {
      addEdge(line.start, line.end, line.style?.faceColor, line.groupId);
    }
  }

  const facesList: Face3D[] = [];
  const seenFaces = new Set<string>();

  // 2. Add full circular faces & 2-vertex arcs
  if (arcs) {
    for (const arc of arcs) {
      if (arc.startPoint && arc.endPoint) {
        // Discretize 2-vertex arc into wireframe segments
        const pts = getArc3DPoints(arc, 16);
        for (let i = 0; i < pts.length - 1; i++) {
          const ptA: Point3D = { x: pts[i].x, y: pts[i].z, z: pts[i].y };
          const ptB: Point3D = { x: pts[i + 1].x, y: pts[i + 1].z, z: pts[i + 1].y };
          addEdge(ptA, ptB);
        }
      } else if (arc.radius > 0) {
        // Full circle disc face
        const pts = getArc3DPoints(arc, 32);
        if (pts.length >= 3) {
          const circleVerts: Point3D[] = pts.map((p) => ({ x: p.x, y: p.z, z: p.y }));
          const norm = arc.normal || { x: 0, y: 0, z: 1 };
          const circleKey = `circle-${ptKey(arc.center)}-r${Math.round(arc.radius)}`;
          if (!seenFaces.has(circleKey)) {
            seenFaces.add(circleKey);
            facesList.push({
              id: `face-${circleKey}`,
              normal: norm,
              center: { ...arc.center },
              vertices: circleVerts,
              plane: arc.plane || 'top',
              elevation: arc.center.z || 0,
            });
          }
        }
      }
    }
  }

  // 3. Planar Shortest-Cycle Search for Arbitrary N-gons
  const keys = Array.from(adj.keys());

  for (let i = 0; i < keys.length; i++) {
    const k0 = keys[i];
    const node0 = adj.get(k0)!;
    const p0 = node0.pt;
    const v0 = logicalToThreeVec(p0);

    const neighbors = Array.from(node0.neighbors.entries());
    if (neighbors.length < 2) continue;

    for (let a = 0; a < neighbors.length; a++) {
      const [k1, p1] = neighbors[a];
      const v1 = logicalToThreeVec(p1);

      for (let b = a + 1; b < neighbors.length; b++) {
        const [k2, p2] = neighbors[b];
        const v2 = logicalToThreeVec(p2);

        // Vector a: v1 - v0
        const ax = v1[0] - v0[0];
        const ay = v1[1] - v0[1];
        const az = v1[2] - v0[2];

        // Vector b: v2 - v0
        const bx = v2[0] - v0[0];
        const by = v2[1] - v0[1];
        const bz = v2[2] - v0[2];

        // Plane normal = a x b
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);

        if (len < 1e-4) continue; // Collinear incident edges
        nx /= len;
        ny /= len;
        nz /= len;

        // BFS on candidate plane from k1 to k2 avoiding k0
        // Find shortest planar path between k1 and k2
        const queue: { key: string; path: string[] }[] = [{ key: k1, path: [k1] }];
        const visited = new Set<string>([k0, k1]);
        let foundPath: string[] | null = null;
        const maxDepth = 16;

        while (queue.length > 0) {
          const { key: currKey, path } = queue.shift()!;
          if (path.length > maxDepth) break;

          if (currKey === k2) {
            foundPath = path;
            break;
          }

          const currNode = adj.get(currKey);
          if (!currNode) continue;

          for (const [nextKey, nextPt] of currNode.neighbors.entries()) {
            if (nextKey === k2) {
              foundPath = [...path, nextKey];
              queue.length = 0;
              break;
            }

            if (visited.has(nextKey)) continue;

            // Check if nextPt lies on candidate plane
            const nv = logicalToThreeVec(nextPt);
            const distToPlane = Math.abs((nv[0] - v0[0]) * nx + (nv[1] - v0[1]) * ny + (nv[2] - v0[2]) * nz);
            if (distToPlane < 0.25) {
              visited.add(nextKey);
              queue.push({ key: nextKey, path: [...path, nextKey] });
            }
          }
        }

        if (foundPath && foundPath.length >= 2) {
          // Complete cycle: k0 -> k1 -> ... -> k2 -> k0
          const fullCycleKeys = [k0, ...foundPath];
          const sortedKeys = [...fullCycleKeys].sort().join('|');

          if (!seenFaces.has(sortedKeys)) {
            seenFaces.add(sortedKeys);

            const cycleVertices: Point3D[] = fullCycleKeys.map((k) => adj.get(k)!.pt);

            // Compute 2D polygon area to reject degenerate loops
            // Project into 2D using basis vectors on the plane
            let ux = 0, uy = 1, uz = 0;
            if (Math.abs(ny) > 0.9) {
              ux = 1; uy = 0; uz = 0;
            }
            // u = cross(n, up)
            let tx = ny * uz - nz * uy;
            let ty = nz * ux - nx * uz;
            let tz = nx * uy - ny * ux;
            const tlen = Math.hypot(tx, ty, tz);
            if (tlen > 1e-4) {
              tx /= tlen; ty /= tlen; tz /= tlen;
            }
            // v = cross(n, t)
            const bx2 = ny * tz - nz * ty;
            const by2 = nz * tx - nx * tz;
            const bz2 = nx * ty - ny * tx;

            // Shoelace formula in 2D
            let area2D = 0;
            const nPts = cycleVertices.length;
            for (let idx = 0; idx < nPts; idx++) {
              const pA = logicalToThreeVec(cycleVertices[idx]);
              const pB = logicalToThreeVec(cycleVertices[(idx + 1) % nPts]);
              const uA = pA[0] * tx + pA[1] * ty + pA[2] * tz;
              const vA = pA[0] * bx2 + pA[1] * by2 + pA[2] * bz2;
              const uB = pB[0] * tx + pB[1] * ty + pB[2] * tz;
              const vB = pB[0] * bx2 + pB[1] * by2 + pB[2] * bz2;
              area2D += uA * vB - uB * vA;
            }

            if (Math.abs(area2D) >= 0.2) {
              let facePlane: IsoplanePlane = 'top';
              let elev = Math.round(cycleVertices.reduce((s, p) => s + (p.z || 0), 0) / cycleVertices.length);

              if (Math.abs(ny) >= Math.abs(nx) && Math.abs(ny) >= Math.abs(nz)) {
                facePlane = 'top';
                elev = Math.round(cycleVertices.reduce((s, p) => s + (p.z || 0), 0) / cycleVertices.length);
              } else if (Math.abs(nz) >= Math.abs(nx)) {
                facePlane = 'front';
                elev = Math.round(cycleVertices.reduce((s, p) => s + p.y, 0) / cycleVertices.length);
              } else {
                facePlane = 'side';
                elev = Math.round(cycleVertices.reduce((s, p) => s + p.x, 0) / cycleVertices.length);
              }

              let faceColor: string | undefined = undefined;
              let faceGroupId: string | undefined = undefined;
              for (let i = 0; i < fullCycleKeys.length; i++) {
                const kA = fullCycleKeys[i];
                const kB = fullCycleKeys[(i + 1) % fullCycleKeys.length];
                const ek = kA < kB ? `${kA}---${kB}` : `${kB}---${kA}`;
                const meta = edgeMeta.get(ek);
                if (meta?.color && !faceColor) faceColor = meta.color;
                if (meta?.groupId && !faceGroupId) faceGroupId = meta.groupId;
              }

              facesList.push({
                id: `face-${sortedKeys}`,
                normal: { x: Number(nx.toFixed(4)), y: Number(nz.toFixed(4)), z: Number(ny.toFixed(4)) },
                center: {
                  x: Math.round(cycleVertices.reduce((s, p) => s + p.x, 0) / cycleVertices.length),
                  y: Math.round(cycleVertices.reduce((s, p) => s + p.y, 0) / cycleVertices.length),
                  z: Math.round(cycleVertices.reduce((s, p) => s + (p.z || 0), 0) / cycleVertices.length),
                },
                vertices: cycleVertices,
                plane: facePlane,
                elevation: elev,
                groupId: faceGroupId,
                color: faceColor,
              });
            }
          }
        }
      }
    }
  }

  faceCache = {
    linesRef: lines,
    arcsRef: arcs,
    faces: facesList,
  };

  return facesList;
}
