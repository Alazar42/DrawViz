import { Point3D, ScreenPoint } from '../types/drawing';

export const SQRT3 = Math.sqrt(3);
export const COS_30 = SQRT3 / 2;
export const SIN_30 = 0.5;
export const TAN_30 = 1 / SQRT3;

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/**
 * Converts logical grid coordinates (col, row, z) to world coordinates (in unzoomed pixels)
 */
export function gridToWorld(col: number, row: number, z: number = 0, unitSize: number = 28): ScreenPoint {
  const wx = col * COS_30 * unitSize;
  const isOdd = Math.abs(col % 2) === 1;
  const baseWy = (row + (isOdd ? 0.5 : 0)) * unitSize;
  const wy = baseWy - z * unitSize;
  return { x: wx, y: wy };
}

/**
 * Converts world coordinates to screen pixel coordinates
 */
export function worldToScreen(world: ScreenPoint, transform: ViewportTransform): ScreenPoint {
  return {
    x: world.x * transform.zoom + transform.panX,
    y: world.y * transform.zoom + transform.panY,
  };
}

/**
 * Converts screen pixel coordinates to world coordinates
 */
export function screenToWorld(screen: ScreenPoint, transform: ViewportTransform): ScreenPoint {
  return {
    x: (screen.x - transform.panX) / transform.zoom,
    y: (screen.y - transform.panY) / transform.zoom,
  };
}

/**
 * Finds the exact nearest isometric grid point for any world coordinate
 */
export function getNearestGridPoint(
  worldX: number,
  worldY: number,
  unitSize: number = 28
): { col: number; row: number; z: number; world: ScreenPoint } {
  const colStep = COS_30 * unitSize;
  const approxCol = worldX / colStep;
  const c0 = Math.floor(approxCol);
  const c1 = c0 + 1;

  let bestDist = Infinity;
  let bestCol = 0;
  let bestRow = 0;

  for (const c of [c0, c1]) {
    const isOdd = Math.abs(c % 2) === 1;
    const yOffset = isOdd ? 0.5 : 0;
    const approxRow = worldY / unitSize - yOffset;
    const r0 = Math.floor(approxRow);
    const r1 = r0 + 1;

    for (const r of [r0, r1]) {
      const pt = gridToWorld(c, r, 0, unitSize);
      const dx = pt.x - worldX;
      const dy = pt.y - worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDist) {
        bestDist = distSq;
        bestCol = c;
        bestRow = r;
      }
    }
  }

  const world = gridToWorld(bestCol, bestRow, 0, unitSize);
  return {
    col: bestCol,
    row: bestRow,
    z: 0,
    world,
  };
}

/**
 * Calculate distance in logical units between two grid points
 */
export function calculateLogicalLength(start: Point3D, end: Point3D, unitSize: number = 28): number {
  const p1 = gridToWorld(start.x, start.y, start.z, unitSize);
  const p2 = gridToWorld(end.x, end.y, end.z, unitSize);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return Math.round((dist / unitSize) * 100) / 100;
}

/**
 * Determine the principal direction label and angle of a line
 */
export function getLineDirection(
  start: Point3D,
  end: Point3D,
  unitSize: number = 28
): { angle: number; directionLabel: string } {
  const p1 = gridToWorld(start.x, start.y, start.z, unitSize);
  const p2 = gridToWorld(end.x, end.y, end.z, unitSize);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (Math.hypot(dx, dy) < 0.001) {
    return { angle: 0, directionLabel: 'Point' };
  }

  let rad = Math.atan2(dy, dx);
  let deg = (rad * 180) / Math.PI;

  // Normalize to 0..360
  if (deg < 0) deg += 360;

  // Check orientation
  const tolerance = 5;
  const checkAngle = (target: number) => {
    const diff = Math.abs(deg - target);
    return diff <= tolerance || diff >= 360 - tolerance;
  };

  if (checkAngle(0) || checkAngle(180)) {
    return { angle: Math.round(deg), directionLabel: 'Horizontal' };
  }
  if (checkAngle(90) || checkAngle(270)) {
    return { angle: Math.round(deg), directionLabel: 'Vertical' };
  }
  if (checkAngle(30) || checkAngle(210)) {
    return { angle: Math.round(deg), directionLabel: 'Isometric (+30°)' };
  }
  if (checkAngle(150) || checkAngle(330)) {
    return { angle: Math.round(deg), directionLabel: 'Isometric (-30°)' };
  }

  return { angle: Math.round(deg), directionLabel: 'Oblique' };
}
