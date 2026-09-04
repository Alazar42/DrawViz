import * as THREE from 'three';
import { Point3D, DrawingArc, ArcBulgeDirection } from '../types/drawing';

// Convert DrawViz logical (X, Y: depth, Z: height) to Three.js world space:
// X_three = X_logical, Y_three = Z_logical (Up), Z_three = Y_logical (Depth)
export function logicalToThree(pt: Point3D): THREE.Vector3 {
  return new THREE.Vector3(pt.x, pt.z || 0, pt.y);
}

export function threeToLogical(v: THREE.Vector3): Point3D {
  return {
    x: Math.round(v.x),
    y: Math.round(v.z),
    z: Math.round(v.y),
  };
}

// Temporary vectors for zero allocation
const _up = new THREE.Vector3(0, 1, 0);
const _alt = new THREE.Vector3(1, 0, 0);

/**
 * Computes an orthonormal basis (U, V) perpendicular to normal N.
 */
export function getCircleOrthonormalBasis(
  normal: THREE.Vector3,
  outU: THREE.Vector3,
  outV: THREE.Vector3
): void {
  const n = normal.clone().normalize();
  if (n.lengthSq() < 1e-6) {
    n.set(0, 1, 0); // Default to Up if zero normal
  }

  // Choose a helper vector not parallel to n
  const helper = Math.abs(n.y) < 0.9 ? _up : _alt;
  outU.crossVectors(n, helper).normalize();
  outV.crossVectors(n, outU).normalize();
}

/**
 * Generates 3D points along an arc/circle on ANY plane (horizontal, vertical, or inclined).
 */
export function getArcPoints(
  center: THREE.Vector3,
  radius: number,
  normal: THREE.Vector3,
  startAngleDeg: number = 0,
  endAngleDeg: number = 360,
  segments: number = 48
): THREE.Vector3[] {
  const outU = new THREE.Vector3();
  const outV = new THREE.Vector3();
  getCircleOrthonormalBasis(normal, outU, outV);

  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = startRad + (i / segments) * (endRad - startRad);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const pt = new THREE.Vector3()
      .copy(center)
      .addScaledVector(outU, radius * cosT)
      .addScaledVector(outV, radius * sinT);

    points.push(pt);
  }

  return points;
}

/**
 * Generates technical wireframe elements and solid transform for a 3D cylinder.
 */
export function getCylinderGeometryData(
  center: THREE.Vector3,
  radius: number,
  height: number,
  normal: THREE.Vector3
): {
  basePoints: THREE.Vector3[];
  topPoints: THREE.Vector3[];
  silhouetteLines: [THREE.Vector3, THREE.Vector3][];
  midPoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
} {
  const n = normal.clone().normalize();
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);

  const outU = new THREE.Vector3();
  const outV = new THREE.Vector3();
  getCircleOrthonormalBasis(n, outU, outV);

  const topCenter = center.clone().addScaledVector(n, height);
  const midPoint = center.clone().addScaledVector(n, height * 0.5);

  const segments = 48;
  const basePoints: THREE.Vector3[] = [];
  const topPoints: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const offset = new THREE.Vector3()
      .addScaledVector(outU, radius * cosT)
      .addScaledVector(outV, radius * sinT);

    basePoints.push(center.clone().add(offset));
    topPoints.push(topCenter.clone().add(offset));
  }

  // 4 silhouette seam lines connecting base and top at 90° intervals
  const silhouetteLines: [THREE.Vector3, THREE.Vector3][] = [
    [center.clone().addScaledVector(outU, radius), topCenter.clone().addScaledVector(outU, radius)],
    [center.clone().addScaledVector(outU, -radius), topCenter.clone().addScaledVector(outU, -radius)],
    [center.clone().addScaledVector(outV, radius), topCenter.clone().addScaledVector(outV, radius)],
    [center.clone().addScaledVector(outV, -radius), topCenter.clone().addScaledVector(outV, -radius)],
  ];

  // Quaternion to rotate standard cylinder (aligned with Three Y-axis) to normal N
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);

  return {
    basePoints,
    topPoints,
    silhouetteLines,
    midPoint,
    quaternion,
  };
}

export function logicalToThreeNormal(n: Point3D): THREE.Vector3 {
  // Logical: X=width, Y=depth, Z=height
  // Three: X=width, Y=height (Z_logical), Z=depth (Y_logical)
  return new THREE.Vector3(n.x, n.z ?? 0, n.y).normalize();
}

export function threeToLogicalNormal(v: THREE.Vector3): Point3D {
  const norm = v.clone().normalize();
  return {
    x: Number(norm.x.toFixed(4)),
    y: Number(norm.z.toFixed(4)),
    z: Number(norm.y.toFixed(4)),
  };
}

export function calculateFaceNormalThree(vertices: Point3D[]): THREE.Vector3 {
  if (vertices.length < 3) return new THREE.Vector3(0, 1, 0);
  const p0 = new THREE.Vector3(vertices[0].x, vertices[0].z ?? 0, vertices[0].y);
  const p1 = new THREE.Vector3(vertices[1].x, vertices[1].z ?? 0, vertices[1].y);
  const p2 = new THREE.Vector3(vertices[2].x, vertices[2].z ?? 0, vertices[2].y);
  const v1 = new THREE.Vector3().subVectors(p1, p0);
  const v2 = new THREE.Vector3().subVectors(p2, p0);
  const norm = new THREE.Vector3().crossVectors(v1, v2).normalize();
  if (norm.lengthSq() < 1e-4) return new THREE.Vector3(0, 1, 0);
  return norm;
}

export interface TwoPointArcResult {
  points: THREE.Vector3[];
  center: THREE.Vector3;
  normal: THREE.Vector3;
  actualRadius: number;
  subtendedAngle: number; // in radians
  chordDistance: number;
  apex: THREE.Vector3;
}

/**
 * Computes an arc between two 3D vertices with a customizable radius and 6-axis bulge orientation.
 * Supports +z, -z, +y, -y, +x, -x orientations.
 */
export function getTwoPointArcPoints(
  startPoint: THREE.Vector3,
  endPoint: THREE.Vector3,
  radius: number,
  bulgeDir: ArcBulgeDirection = '+z',
  segments: number = 48
): TwoPointArcResult {
  const chord = new THREE.Vector3().subVectors(endPoint, startPoint);
  const chordDistance = chord.length();

  if (chordDistance < 1e-4) {
    return {
      points: [startPoint.clone(), endPoint.clone()],
      center: startPoint.clone(),
      normal: new THREE.Vector3(0, 1, 0),
      actualRadius: 0,
      subtendedAngle: 0,
      chordDistance: 0,
      apex: startPoint.clone(),
    };
  }

  const uChord = chord.clone().normalize();
  const M = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);

  // Map bulgeDir (in DrawViz logical coordinates: +x, -x, +y, -y, +z, -z) to Three.js coordinates:
  // Three: X = logical X, Y = logical Z (Up), Z = logical Y (Depth)
  const dirMap: Record<ArcBulgeDirection, THREE.Vector3> = {
    '+z': new THREE.Vector3(0, 1, 0),
    '-z': new THREE.Vector3(0, -1, 0),
    '+y': new THREE.Vector3(0, 0, 1),
    '-y': new THREE.Vector3(0, 0, -1),
    '+x': new THREE.Vector3(1, 0, 0),
    '-x': new THREE.Vector3(-1, 0, 0),
  };

  const targetDir = dirMap[bulgeDir] || dirMap['+z'];
  let bRaw = new THREE.Vector3().copy(targetDir).addScaledVector(uChord, -targetDir.dot(uChord));

  // If target direction is nearly parallel to chord, fall back to perpendicular axes
  if (bRaw.length() < 1e-3) {
    const fallbacks: THREE.Vector3[] = [
      dirMap['+z'],
      dirMap['-z'],
      dirMap['+y'],
      dirMap['-y'],
      dirMap['+x'],
      dirMap['-x'],
    ];
    for (const fb of fallbacks) {
      const cand = new THREE.Vector3().copy(fb).addScaledVector(uChord, -fb.dot(uChord));
      if (cand.length() >= 1e-3) {
        bRaw = cand;
        break;
      }
    }
  }

  const bHat = bRaw.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(uChord, bHat).normalize();

  // Minimum radius is half the chord length (semicircle / pi radians)
  const minR = chordDistance / 2;
  const actualRadius = Math.max(radius || (chordDistance * 2), minR);
  const dM = Math.sqrt(Math.max(0, actualRadius * actualRadius - minR * minR));

  // Circle center is on the opposite side of the chord from the bulge
  const center = new THREE.Vector3().copy(M).addScaledVector(bHat, -dM);

  const sinAlpha = Math.min(1, minR / actualRadius);
  const alpha = Math.asin(sinAlpha);
  const subtendedAngle = 2 * alpha;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = -1 + (2 * i) / segments;
    const theta = t * alpha;
    const pt = new THREE.Vector3()
      .copy(center)
      .addScaledVector(bHat, actualRadius * Math.cos(theta))
      .addScaledVector(uChord, actualRadius * Math.sin(theta));
    points.push(pt);
  }

  // Ensure first and last points match startPoint and endPoint exactly
  points[0].copy(startPoint);
  points[points.length - 1].copy(endPoint);

  const apex = new THREE.Vector3().copy(center).addScaledVector(bHat, actualRadius);

  return {
    points,
    center,
    normal,
    actualRadius,
    subtendedAngle,
    chordDistance,
    apex,
  };
}

/**
 * Universal arc 3D point generator supporting both full circles, legacy arcs,
 * and 2-vertex arcs.
 */
export function getArc3DPoints(arc: DrawingArc, segments: number = 48): THREE.Vector3[] {
  if (arc.startPoint && arc.endPoint) {
    const p1 = logicalToThree(arc.startPoint);
    const p2 = logicalToThree(arc.endPoint);
    const res = getTwoPointArcPoints(p1, p2, arc.radius, arc.bulgeDir || '+z', segments);
    return res.points;
  }

  const centerThree = logicalToThree(arc.center);
  let normalThree: THREE.Vector3;
  if (arc.normal) {
    normalThree = logicalToThreeNormal(arc.normal);
  } else if (arc.plane === 'top') {
    normalThree = new THREE.Vector3(0, 1, 0);
  } else if (arc.plane === 'front') {
    normalThree = new THREE.Vector3(0, 0, 1);
  } else {
    normalThree = new THREE.Vector3(1, 0, 0);
  }

  const startDeg = arc.startAngle ?? 0;
  const endDeg = arc.endAngle ?? 360;
  return getArcPoints(centerThree, arc.radius, normalThree, startDeg, endDeg, segments);
}


