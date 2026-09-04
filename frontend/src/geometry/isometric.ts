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
 * Converts true 3D logical drafting coordinates (X: Front, Y: Side, Z: Height)
 * to 2D isometric world coordinates (in unzoomed pixels)
 */
export function gridToWorld(x: number, y: number, z: number = 0, unitSize: number = 28): ScreenPoint {
  // Front axis X goes down-left: (-COS_30, 0.5)
  // Side axis Y goes down-right: (COS_30, 0.5)
  // Height axis Z goes straight up: (0, -1)
  const wx = (y - x) * COS_30 * unitSize;
  const wy = (x + y) * 0.5 * unitSize - z * unitSize;
  return { x: wx, y: wy };
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
 * Converts world coordinates to screen pixel coordinates
 */
export function worldToScreen(world: ScreenPoint, transform: ViewportTransform): ScreenPoint {
  return {
    x: world.x * transform.zoom + transform.panX,
    y: world.y * transform.zoom + transform.panY,
  };
}

/**
 * Inversely projects a 2D world coordinate onto a specific elevation plane Z
 * to find the exact logical (X, Y, Z) coordinates.
 */
export function worldToGridPlane(
  worldX: number,
  worldY: number,
  zPlane: number = 0,
  unitSize: number = 28
): Point3D {
  const u = worldX / (COS_30 * unitSize);
  const v = (worldY + zPlane * unitSize) / (0.5 * unitSize);

  const exactY = (v + u) / 2;
  const exactX = (v - u) / 2;

  return {
    x: Math.round(exactX),
    y: Math.round(exactY),
    z: Math.round(zPlane),
  };
}

export type IsoplaneType = 'top' | 'front' | 'side';

/**
 * Projects a 2D world coordinate onto an AutoCAD-standard Isoplane
 * (Top: X-Y plane at Z_plane, Front: X-Z plane at Y_plane, Side: Y-Z plane at X_plane)
 */
export function worldToIsoplane(
  worldX: number,
  worldY: number,
  isoplane: IsoplaneType,
  planeOffset: number,
  unitSize: number = 28
): Point3D {
  switch (isoplane) {
    case 'top':
      return worldToGridPlane(worldX, worldY, planeOffset, unitSize);

    case 'front': {
      // Y is fixed at planeOffset (Front vertical plane X-Z)
      // wx = (planeOffset - X) * COS_30 * unitSize => X = planeOffset - wx / (COS_30 * unitSize)
      // wy = (X + planeOffset) * 0.5 * unitSize - Z * unitSize => Z = (X + planeOffset) * 0.5 - wy / unitSize
      const exactX = planeOffset - worldX / (COS_30 * unitSize);
      const roundedX = Math.round(exactX);
      const exactZ = (roundedX + planeOffset) * 0.5 - worldY / unitSize;
      return {
        x: roundedX,
        y: Math.round(planeOffset),
        z: Math.round(exactZ),
      };
    }

    case 'side': {
      // X is fixed at planeOffset (Side vertical plane Y-Z)
      // wx = (Y - planeOffset) * COS_30 * unitSize => Y = planeOffset + wx / (COS_30 * unitSize)
      // wy = (planeOffset + Y) * 0.5 * unitSize - Z * unitSize => Z = (planeOffset + Y) * 0.5 - wy / unitSize
      const exactY = planeOffset + worldX / (COS_30 * unitSize);
      const roundedY = Math.round(exactY);
      const exactZ = (planeOffset + roundedY) * 0.5 - worldY / unitSize;
      return {
        x: Math.round(planeOffset),
        y: roundedY,
        z: Math.round(exactZ),
      };
    }
  }
}

/**
 * Calculate distance in logical 3D units between two points
 */
export function calculateLogicalLength(start: Point3D, end: Point3D, unitSize: number = 28): number {
  const p1 = gridToWorld(start.x, start.y, start.z || 0, unitSize);
  const p2 = gridToWorld(end.x, end.y, end.z || 0, unitSize);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return Math.round((dist / unitSize) * 100) / 100;
}

/**
 * Determine the principal direction label and angle of a line in 3D
 */
export function getLineDirection(
  start: Point3D,
  end: Point3D,
  unitSize: number = 28
): { angle: number; directionLabel: string } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = (end.z || 0) - (start.z || 0);

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && Math.abs(dz) < 0.001) {
    return { angle: 0, directionLabel: 'Point' };
  }

  // Pure vertical (Elevation)
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { angle: 90, directionLabel: 'Vertical (Z)' };
  }

  // Pure Front axis (X)
  if (Math.abs(dy) < 0.001 && Math.abs(dz) < 0.001) {
    return { angle: 150, directionLabel: 'Front Axis (X)' };
  }

  // Pure Side axis (Y)
  if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
    return { angle: 30, directionLabel: 'Side Axis (Y)' };
  }

  // Horizontal diagonal (X = -Y, dz = 0)
  if (Math.abs(dx + dy) < 0.001 && Math.abs(dz) < 0.001) {
    return { angle: 0, directionLabel: 'Horizontal (0°)' };
  }

  // Incline
  return { angle: 0, directionLabel: 'Inclined / Ramp' };
}
