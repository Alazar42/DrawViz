import { DrawingLine, Point3D, ScreenPoint } from '../types/drawing';
import {
  gridToWorld,
  worldToScreen,
  screenToWorld,
  getNearestGridPoint,
  ViewportTransform,
} from './isometric';

export interface SnapResult {
  logical: Point3D;
  world: ScreenPoint;
  screen: ScreenPoint;
  snapType: 'grid' | 'endpoint' | 'isometric-ray' | 'none';
  angleDeg?: number;
}

const VALID_ANGLES = [0, 30, 90, 150, 180, 210, 270, 330];

/**
 * Calculates snapped cursor position considering grid, active line anchor, and existing endpoints
 */
export function calculateSnap(
  screenCursor: ScreenPoint,
  transform: ViewportTransform,
  existingLines: DrawingLine[],
  anchorPoint: Point3D | null,
  options: {
    snapToGrid: boolean;
    snapToIsometric: boolean;
    snapToEndpoints: boolean;
    unitSize: number;
    endpointSnapRadius?: number;
  }
): SnapResult {
  const {
    snapToGrid,
    snapToIsometric,
    snapToEndpoints,
    unitSize,
    endpointSnapRadius = 14,
  } = options;

  const rawWorld = screenToWorld(screenCursor, transform);

  // 1. Check Endpoint Snapping
  if (snapToEndpoints && existingLines.length > 0) {
    let closestEndpoint: Point3D | null = null;
    let closestDistSq = endpointSnapRadius * endpointSnapRadius;

    for (const line of existingLines) {
      for (const pt of [line.start, line.end]) {
        const ptWorld = gridToWorld(pt.x, pt.y, pt.z, unitSize);
        const ptScreen = worldToScreen(ptWorld, transform);
        const dx = ptScreen.x - screenCursor.x;
        const dy = ptScreen.y - screenCursor.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestEndpoint = pt;
        }
      }
    }

    if (closestEndpoint) {
      const world = gridToWorld(closestEndpoint.x, closestEndpoint.y, closestEndpoint.z, unitSize);
      const screen = worldToScreen(world, transform);
      return {
        logical: { ...closestEndpoint },
        world,
        screen,
        snapType: 'endpoint',
      };
    }
  }

  // 2. Isometric Angle Snapping from Anchor Point
  if (anchorPoint && snapToIsometric) {
    const anchorWorld = gridToWorld(anchorPoint.x, anchorPoint.y, anchorPoint.z, unitSize);
    const dx = rawWorld.x - anchorWorld.x;
    const dy = rawWorld.y - anchorWorld.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 4) {
      let cursorAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (cursorAngle < 0) cursorAngle += 360;

      // Find closest standard isometric angle
      let minAngleDiff = Infinity;
      let targetAngle = 0;

      for (const angle of VALID_ANGLES) {
        let diff = Math.abs(cursorAngle - angle);
        if (diff > 180) diff = 360 - diff;
        if (diff < minAngleDiff) {
          minAngleDiff = diff;
          targetAngle = angle;
        }
      }

      // If angle is reasonably close to a standard direction (within 22 degrees)
      if (minAngleDiff < 22) {
        const rad = (targetAngle * Math.PI) / 180;
        // Project cursor distance onto target angle
        const constrainedWorldX = anchorWorld.x + dist * Math.cos(rad);
        const constrainedWorldY = anchorWorld.y + dist * Math.sin(rad);

        // Snap along that ray to grid
        const nearest = getNearestGridPoint(constrainedWorldX, constrainedWorldY, unitSize);
        const world = nearest.world;
        const screen = worldToScreen(world, transform);

        return {
          logical: { x: nearest.col, y: nearest.row, z: nearest.z },
          world,
          screen,
          snapType: 'isometric-ray',
          angleDeg: targetAngle,
        };
      }
    }
  }

  // 3. Nearest Grid Intersection Snapping
  if (snapToGrid) {
    const nearest = getNearestGridPoint(rawWorld.x, rawWorld.y, unitSize);
    const world = nearest.world;
    const screen = worldToScreen(world, transform);

    return {
      logical: { x: nearest.col, y: nearest.row, z: nearest.z },
      world,
      screen,
      snapType: 'grid',
    };
  }

  // 4. No Snapping (raw world)
  return {
    logical: {
      x: Math.round(rawWorld.x / unitSize),
      y: Math.round(rawWorld.y / unitSize),
      z: 0,
    },
    world: rawWorld,
    screen: screenCursor,
    snapType: 'none',
  };
}
