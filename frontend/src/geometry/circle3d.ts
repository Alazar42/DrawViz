import * as THREE from 'three';
import { Point3D } from '../types/drawing';

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

