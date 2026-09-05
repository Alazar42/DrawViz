import { DrawingLine, Point3D, ScreenPoint } from '../types/drawing';
import {
  gridToWorld,
  worldToScreen,
  screenToWorld,
  worldToGridPlane,
  worldToIsoplane,
  IsoplaneType,
  ViewportTransform,
  COS_30,
} from './isometric';

export interface HostPlaneInfo {
  type: 'top' | 'front' | 'side';
  offset: number;
  label: string;
}

export interface SnapResult {
  logical: Point3D;
  world: ScreenPoint;
  screen: ScreenPoint;
  snapType:
    | 'grid'
    | 'endpoint'
    | 'line-edge'
    | 'isometric-axis'
    | 'vertical-elevation'
    | 'angle-snap'
    | 'none';
  angleDeg?: number;
  hostPlane?: HostPlaneInfo;
  snappedLineId?: string;
}

/**
 * Calculates snapped cursor position with true 3D (X, Y, Z) elevation and depth tracking,
 * object snap to existing lines/edges, and degree/angle snapping.
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
    snapToLines?: boolean;
    unitSize: number;
    activeElevation?: number;
    activeIsoplane?: IsoplaneType;
    endpointSnapRadius?: number;
    lineSnapRadius?: number;
    angleSnapStepDeg?: number; // default 15 degrees
  }
): SnapResult {
  const {
    snapToGrid,
    snapToIsometric,
    snapToEndpoints,
    snapToLines = true,
    unitSize,
    activeElevation = 0,
    activeIsoplane = 'top',
    endpointSnapRadius = 14,
    lineSnapRadius = 10,
    angleSnapStepDeg = 15,
  } = options;

  const rawWorld = screenToWorld(screenCursor, transform);

  // Helper: infer host plane for a line or point
  const inferPlane = (p1: Point3D, p2?: Point3D): HostPlaneInfo | undefined => {
    if (!p2) {
      return { type: 'top', offset: p1.z || 0, label: `Top (Z=${p1.z || 0})` };
    }
    const z1 = p1.z || 0;
    const z2 = p2.z || 0;
    if (z1 === z2) {
      return { type: 'top', offset: z1, label: `Top (Z=${z1})` };
    }
    if (p1.y === p2.y) {
      return { type: 'front', offset: p1.y, label: `Front (Y=${p1.y})` };
    }
    if (p1.x === p2.x) {
      return { type: 'side', offset: p1.x, label: `Side (X=${p1.x})` };
    }
    return undefined;
  };

  // 1. Endpoint Snapping (highest priority - snaps to exact 3D vertex)
  if (snapToEndpoints && existingLines.length > 0) {
    let closestEndpoint: Point3D | null = null;
    let closestDistSq = endpointSnapRadius * endpointSnapRadius;
    let matchedLine: DrawingLine | null = null;

    for (const line of existingLines) {
      for (const pt of [line.start, line.end]) {
        const ptWorld = gridToWorld(pt.x, pt.y, pt.z || 0, unitSize);
        const ptScreen = worldToScreen(ptWorld, transform);
        const dx = ptScreen.x - screenCursor.x;
        const dy = ptScreen.y - screenCursor.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestEndpoint = pt;
          matchedLine = line;
        }
      }
    }

    if (closestEndpoint) {
      const world = gridToWorld(closestEndpoint.x, closestEndpoint.y, closestEndpoint.z || 0, unitSize);
      const screen = worldToScreen(world, transform);
      return {
        logical: { ...closestEndpoint },
        world,
        screen,
        snapType: 'endpoint',
        hostPlane: matchedLine ? inferPlane(matchedLine.start, matchedLine.end) : inferPlane(closestEndpoint),
        snappedLineId: matchedLine?.id,
      };
    }
  }

  // 2. Line / Edge Snapping (snap directly to existing 3D line segment)
  if (snapToLines && existingLines.length > 0) {
    let bestLineSnap: {
      logical: Point3D;
      world: ScreenPoint;
      screen: ScreenPoint;
      lineId: string;
      distSq: number;
      hostPlane?: HostPlaneInfo;
    } | null = null;

    let minLineDistSq = lineSnapRadius * lineSnapRadius;

    for (const line of existingLines) {
      const w1 = gridToWorld(line.start.x, line.start.y, line.start.z || 0, unitSize);
      const w2 = gridToWorld(line.end.x, line.end.y, line.end.z || 0, unitSize);
      const s1 = worldToScreen(w1, transform);
      const s2 = worldToScreen(w2, transform);

      const dx = s2.x - s1.x;
      const dy = s2.y - s1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 4) continue;

      const t = ((screenCursor.x - s1.x) * dx + (screenCursor.y - s1.y) * dy) / lenSq;
      // Only snap along interior of segment (endpoints handled by priority 1)
      if (t >= 0.04 && t <= 0.96) {
        const projX = s1.x + t * dx;
        const projY = s1.y + t * dy;
        const distSq = (screenCursor.x - projX) * (screenCursor.x - projX) + (screenCursor.y - projY) * (screenCursor.y - projY);

        if (distSq < minLineDistSq) {
          minLineDistSq = distSq;
          const deltaX = line.end.x - line.start.x;
          const deltaY = line.end.y - line.start.y;
          const deltaZ = (line.end.z || 0) - (line.start.z || 0);
          const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY), Math.abs(deltaZ), 1);

          // Snap to integer step along line if available, or midpoint
          const stepIndex = Math.round(t * steps);
          const snappedT = stepIndex / steps;

          const logical: Point3D = {
            x: Math.round(line.start.x + snappedT * deltaX),
            y: Math.round(line.start.y + snappedT * deltaY),
            z: Math.round((line.start.z || 0) + snappedT * deltaZ),
          };

          const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
          const screen = worldToScreen(world, transform);

          bestLineSnap = {
            logical,
            world,
            screen,
            lineId: line.id,
            distSq,
            hostPlane: inferPlane(line.start, line.end),
          };
        }
      }
    }

    if (bestLineSnap) {
      return {
        logical: bestLineSnap.logical,
        world: bestLineSnap.world,
        screen: bestLineSnap.screen,
        snapType: 'line-edge',
        hostPlane: bestLineSnap.hostPlane,
        snappedLineId: bestLineSnap.lineId,
      };
    }
  }

  // 3. Directional & Degree Snapping from an Anchor Point
  if (anchorPoint && snapToIsometric) {
    const anchorWorld = gridToWorld(anchorPoint.x, anchorPoint.y, anchorPoint.z || 0, unitSize);
    const dwx = rawWorld.x - anchorWorld.x;
    const dwy = rawWorld.y - anchorWorld.y;
    const dist = Math.hypot(dwx, dwy);

    if (dist > 5) {
      const vx = dwx / dist;
      const vy = dwy / dist;

      // Primary Isometric Axes:
      // Vertical Z axis: (0, -1) -> 90° or 270°
      const dotZ = -vy;
      // Front X axis: (-COS_30, 0.5) -> 150° or 330°
      const dotX = -vx * COS_30 + vy * 0.5;
      // Side Y axis: (COS_30, 0.5) -> 30° or 210°
      const dotY = vx * COS_30 + vy * 0.5;

      // 3a. Vertical Elevation (Z)
      if (Math.abs(dotZ) > 0.88 || Math.abs(dwx) < 8) {
        const deltaZ = -Math.round(dwy / unitSize);
        const snappedZ = (anchorPoint.z || 0) + deltaZ;
        const logical: Point3D = {
          x: anchorPoint.x,
          y: anchorPoint.y,
          z: snappedZ,
        };
        const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
        return {
          logical,
          world,
          screen: worldToScreen(world, transform),
          snapType: 'vertical-elevation',
          angleDeg: 90,
          hostPlane: { type: 'top', offset: snappedZ, label: `Z=${snappedZ}` },
        };
      }

      // 3b. Front Axis (X)
      if (Math.abs(dotX) > 0.82) {
        const deltaX = -Math.round(dwx / (COS_30 * unitSize));
        const snappedX = anchorPoint.x + deltaX;
        const logical: Point3D = {
          x: snappedX,
          y: anchorPoint.y,
          z: anchorPoint.z || 0,
        };
        const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
        return {
          logical,
          world,
          screen: worldToScreen(world, transform),
          snapType: 'isometric-axis',
          angleDeg: 150,
          hostPlane: { type: 'front', offset: anchorPoint.y, label: `Y=${anchorPoint.y}` },
        };
      }

      // 3c. Side Axis (Y)
      if (Math.abs(dotY) > 0.82) {
        const deltaY = Math.round(dwx / (COS_30 * unitSize));
        const snappedY = anchorPoint.y + deltaY;
        const logical: Point3D = {
          x: anchorPoint.x,
          y: snappedY,
          z: anchorPoint.z || 0,
        };
        const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
        return {
          logical,
          world,
          screen: worldToScreen(world, transform),
          snapType: 'isometric-axis',
          angleDeg: 30,
          hostPlane: { type: 'side', offset: anchorPoint.x, label: `X=${anchorPoint.x}` },
        };
      }

      // 3d. Degree Snapping (Standard Drafting Angles: 15°, 30°, 45°, 60°, 75°, etc.)
      const screenAngleDeg = ((Math.atan2(-dwy, dwx) * 180) / Math.PI + 360) % 360;
      const nearestAngle = Math.round(screenAngleDeg / angleSnapStepDeg) * angleSnapStepDeg;
      const angleDiff = Math.abs(screenAngleDeg - nearestAngle);

      if (angleDiff <= 5.0) {
        const rad = (nearestAngle * Math.PI) / 180;
        const snappedDist = Math.round(dist / unitSize) * unitSize;
        if (snappedDist > 0) {
          const snappedWx = anchorWorld.x + snappedDist * Math.cos(rad);
          const snappedWy = anchorWorld.y - snappedDist * Math.sin(rad);

          // Resolve on active isoplane
          let logical: Point3D;
          if (activeIsoplane === 'top') {
            logical = worldToIsoplane(snappedWx, snappedWy, 'top', anchorPoint.z || activeElevation, unitSize);
          } else if (activeIsoplane === 'front') {
            logical = worldToIsoplane(snappedWx, snappedWy, 'front', anchorPoint.y, unitSize);
          } else {
            logical = worldToIsoplane(snappedWx, snappedWy, 'side', anchorPoint.x, unitSize);
          }

          const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
          return {
            logical,
            world,
            screen: worldToScreen(world, transform),
            snapType: 'angle-snap',
            angleDeg: nearestAngle % 360,
          };
        }
      }
    }
  }

  // 4. Grid Snapping on Active Isoplane
  if (snapToGrid) {
    let logical: Point3D;
    let planeInfo: HostPlaneInfo;

    if (activeIsoplane === 'top') {
      const zPlane = anchorPoint ? (anchorPoint.z ?? activeElevation) : activeElevation;
      logical = worldToIsoplane(rawWorld.x, rawWorld.y, 'top', zPlane, unitSize);
      planeInfo = { type: 'top', offset: zPlane, label: `Top (Z=${zPlane})` };
    } else if (activeIsoplane === 'front') {
      const yPlane = anchorPoint ? anchorPoint.y : 0;
      logical = worldToIsoplane(rawWorld.x, rawWorld.y, 'front', yPlane, unitSize);
      planeInfo = { type: 'front', offset: yPlane, label: `Front (Y=${yPlane})` };
    } else {
      // 'side' isoplane
      const xPlane = anchorPoint ? anchorPoint.x : 0;
      logical = worldToIsoplane(rawWorld.x, rawWorld.y, 'side', xPlane, unitSize);
      planeInfo = { type: 'side', offset: xPlane, label: `Side (X=${xPlane})` };
    }

    const world = gridToWorld(logical.x, logical.y, logical.z, unitSize);
    return {
      logical,
      world,
      screen: worldToScreen(world, transform),
      snapType: 'grid',
      hostPlane: planeInfo,
    };
  }

  // 5. Fallback
  return {
    logical: {
      x: Math.round(rawWorld.x / unitSize),
      y: Math.round(rawWorld.y / unitSize),
      z: activeElevation,
    },
    world: rawWorld,
    screen: screenCursor,
    snapType: 'none',
  };
}
