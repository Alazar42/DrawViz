import { DrawingLine, DrawingArc, DrawingCylinder, DrawingSphere, Face3D, Point3D } from '../types/drawing';
import { extractFacesFromLines } from './faces';
import { getArc3DPoints, getCylinderGeometryData } from './circle3d';
import { COS_30, SIN_30 } from './isometric';

export type PaperSize = 'A4_LANDSCAPE' | 'A4_PORTRAIT' | 'A3_LANDSCAPE' | 'LETTER_LANDSCAPE';

export interface PaperDimensions {
  width: number;  // mm
  height: number; // mm
  name: string;
}

export const PAPER_SIZES: Record<PaperSize, PaperDimensions> = {
  A4_LANDSCAPE: { width: 297, height: 210, name: 'A4 Landscape (297 × 210 mm)' },
  A4_PORTRAIT: { width: 210, height: 297, name: 'A4 Portrait (210 × 297 mm)' },
  A3_LANDSCAPE: { width: 420, height: 297, name: 'A3 Landscape (420 × 297 mm)' },
  LETTER_LANDSCAPE: { width: 279.4, height: 215.9, name: 'Letter Landscape (11 × 8.5 in)' },
};

export type ProjectionStandard = 'third_angle' | 'first_angle';
export type ViewLayoutMode = 'multi_4view' | 'single_view';
export type SingleViewType = 'iso' | 'front' | 'top' | 'right' | 'left' | 'back' | 'bottom';
export type ShadingStyle = 'wireframe' | 'shaded';

export interface TitleBlockData {
  title: string;
  drawingNumber: string;
  revision: string;
  drawnBy: string;
  checkedBy: string;
  company: string;
  date: string;
  scaleText: string;
  units: string;
  notes?: string;
}

export interface CustomViewPlacement {
  x: number; // mm center X on sheet
  y: number; // mm center Y on sheet
  scale?: number; // Custom scale factor
  enabled?: boolean; // Whether view is enabled
}

export interface TechnicalSheetConfig {
  paperSize: PaperSize;
  projection: ProjectionStandard;
  layoutMode: ViewLayoutMode;
  singleViewType: SingleViewType;
  scaleMode: 'auto' | '1:10' | '1:5' | '1:2' | '1:1' | '2:1' | '5:1' | '10:1';
  overallScaleMultiplier?: number;
  shadingStyle: ShadingStyle;
  showHiddenLines: boolean;
  showCenterlines: boolean;
  showGridZones: boolean;
  showProjectionSymbol: boolean;
  showAlignmentLines: boolean;
  titleBlock: TitleBlockData;
  customPlacements?: Record<string, CustomViewPlacement>;
}

export interface ProjectedPoint2D {
  x: number;
  y: number;
}

export interface ProjectedLine2D {
  start: ProjectedPoint2D;
  end: ProjectedPoint2D;
  type: 'visible' | 'hidden' | 'center' | 'dimension';
  color?: string;
  strokeWidth?: number;
}

export interface ProjectedPolygon2D {
  points: ProjectedPoint2D[];
  color: string;
  opacity: number;
}

export interface ProjectedCircle2D {
  center: ProjectedPoint2D;
  radius: number;
  type: 'visible' | 'hidden' | 'center';
  color?: string;
}

export interface SheetViewItem {
  id: string;
  title: string;
  viewType: SingleViewType;
  center: { x: number; y: number };
  box: { x: number; y: number; width: number; height: number }; // In sheet mm
  actualBounds: { minX: number; maxX: number; minY: number; maxY: number }; // In sheet mm
  labelPos: { x: number; y: number };
  scale: number;
  lines: ProjectedLine2D[];
  polygons: ProjectedPolygon2D[];
  circles: ProjectedCircle2D[];
}

export interface SheetLayoutResult {
  paper: PaperDimensions;
  margin: { left: number; top: number; right: number; bottom: number };
  border: { x: number; y: number; width: number; height: number };
  titleBlockBox: { x: number; y: number; width: number; height: number };
  views: SheetViewItem[];
  zones: {
    cols: { label: string; x: number }[];
    rows: { label: string; y: number }[];
  };
}

/**
 * 3D to 2D projection math for standard CAD technical views
 */
export function project3DTo2D(p: Point3D, viewType: SingleViewType): ProjectedPoint2D {
  const z = p.z || 0;
  switch (viewType) {
    case 'top':
      // Top Plan: X is horizontal, Y is vertical (downward on sheet)
      return { x: p.x, y: p.y };
    case 'front':
      // Front Elevation: X is horizontal, Z is vertical (upward in space, downward on sheet: -z)
      return { x: p.x, y: -z };
    case 'right':
      // Right End Elevation: Y is horizontal, Z is vertical
      return { x: p.y, y: -z };
    case 'left':
      // Left End Elevation: -Y is horizontal, Z is vertical
      return { x: -p.y, y: -z };
    case 'back':
      // Back Elevation: -X is horizontal, Z is vertical
      return { x: -p.x, y: -z };
    case 'bottom':
      // Bottom Plan: X is horizontal, -Y is vertical
      return { x: p.x, y: -p.y };
    case 'iso':
    default:
      // Standard 30° / 30° Isometric Projection
      return {
        x: (p.y - p.x) * COS_30,
        y: (p.x + p.y) * SIN_30 - z,
      };
  }
}

/**
 * Computes bounding box of all projected entities for a view
 */
export function computeViewBounds(
  lines: DrawingLine[],
  arcs: DrawingArc[],
  cylinders: DrawingCylinder[],
  spheres: DrawingSphere[],
  viewType: SingleViewType
): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number; centerX: number; centerY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const includePt = (pt: ProjectedPoint2D) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  };

  // 1. Lines
  for (const l of lines) {
    includePt(project3DTo2D(l.start, viewType));
    includePt(project3DTo2D(l.end, viewType));
  }

  // 2. Arcs
  for (const a of arcs) {
    const pts = getArc3DPoints(a, 24);
    for (const p of pts) {
      includePt(project3DTo2D({ x: p.x, y: p.z, z: p.y }, viewType));
    }
  }

  // 3. Cylinders
  for (const c of cylinders) {
    const norm = c.normal || { x: 0, y: 0, z: 1 };
    const data = getCylinderGeometryData(
      { x: c.center.x, y: c.center.z || 0, z: c.center.y } as any,
      c.radius,
      c.height,
      { x: norm.x, y: norm.z || 0, z: norm.y } as any
    );
    for (const p of data.basePoints) {
      includePt(project3DTo2D({ x: p.x, y: p.z, z: p.y }, viewType));
    }
    for (const p of data.topPoints) {
      includePt(project3DTo2D({ x: p.x, y: p.z, z: p.y }, viewType));
    }
  }

  // 4. Spheres
  for (const s of spheres) {
    const center2D = project3DTo2D(s.center, viewType);
    includePt({ x: center2D.x - s.radius, y: center2D.y - s.radius });
    includePt({ x: center2D.x + s.radius, y: center2D.y + s.radius });
  }

  if (minX === Infinity) {
    return { minX: -10, maxX: 10, minY: -10, maxY: 10, width: 20, height: 20, centerX: 0, centerY: 0 };
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Builds all 2D projected lines, polygons, and circles for a specific view
 */
export function buildViewGeometry(
  viewType: SingleViewType,
  lines: DrawingLine[],
  arcs: DrawingArc[],
  cylinders: DrawingCylinder[],
  spheres: DrawingSphere[],
  faceColors: Record<string, string>,
  shadingStyle: ShadingStyle,
  scale: number,
  viewCenter: { x: number; y: number },
  modelCenter: { x: number; y: number },
  showCenterlines: boolean
): {
  lines: ProjectedLine2D[];
  polygons: ProjectedPolygon2D[];
  circles: ProjectedCircle2D[];
  actualBounds: { minX: number; maxX: number; minY: number; maxY: number };
  labelPos: { x: number; y: number };
} {
  const projLines: ProjectedLine2D[] = [];
  const projPolygons: ProjectedPolygon2D[] = [];
  const projCircles: ProjectedCircle2D[] = [];

  const transformPoint = (p: Point3D): ProjectedPoint2D => {
    const raw = project3DTo2D(p, viewType);
    return {
      x: viewCenter.x + (raw.x - modelCenter.x) * scale,
      y: viewCenter.y + (raw.y - modelCenter.y) * scale,
    };
  };

  // 1. Planar Faces (for Shaded mode)
  if (shadingStyle === 'shaded') {
    const faces = extractFacesFromLines(lines, arcs);
    for (const f of faces) {
      const pts = f.vertices.map(transformPoint);
      const color = faceColors[f.id] || f.color || '#94a3b8';
      projPolygons.push({
        points: pts,
        color,
        opacity: 0.88,
      });
    }
  }

  // 2. Lines
  for (const l of lines) {
    const s = transformPoint(l.start);
    const e = transformPoint(l.end);
    const isHidden = l.style?.lineType === 'dashed';
    const isCenter = l.style?.lineType === 'centerline';
    projLines.push({
      start: s,
      end: e,
      type: isHidden ? 'hidden' : isCenter ? 'center' : 'visible',
      color: l.style?.stroke || '#111827',
      strokeWidth: isHidden ? 0.35 : isCenter ? 0.25 : 0.6,
    });
  }

  // 3. Arcs and Circles
  for (const a of arcs) {
    const pts = getArc3DPoints(a, 32);

    for (let i = 0; i < pts.length - 1; i++) {
      projLines.push({
        start: transformPoint({ x: pts[i].x, y: pts[i].z, z: pts[i].y }),
        end: transformPoint({ x: pts[i + 1].x, y: pts[i + 1].z, z: pts[i + 1].y }),
        type: 'visible',
        color: a.style?.stroke || '#111827',
        strokeWidth: 0.6,
      });
    }

    // Add centerline cross for circular arcs if requested
    if (showCenterlines && !a.startPoint) {
      const c = transformPoint(a.center);
      const r = a.radius * scale;
      const ext = r * 1.25;
      projLines.push({
        start: { x: c.x - ext, y: c.y },
        end: { x: c.x + ext, y: c.y },
        type: 'center',
        color: '#64748b',
        strokeWidth: 0.25,
      });
      projLines.push({
        start: { x: c.x, y: c.y - ext },
        end: { x: c.x, y: c.y + ext },
        type: 'center',
        color: '#64748b',
        strokeWidth: 0.25,
      });
    }
  }

  // 4. Cylinders
  for (const cyl of cylinders) {
    const norm = cyl.normal || { x: 0, y: 0, z: 1 };
    const data = getCylinderGeometryData(
      { x: cyl.center.x, y: cyl.center.z || 0, z: cyl.center.y } as any,
      cyl.radius,
      cyl.height,
      { x: norm.x, y: norm.z || 0, z: norm.y } as any
    );

    // Base ring
    const basePts = data.basePoints.map((p) => transformPoint({ x: p.x, y: p.z, z: p.y }));
    for (let i = 0; i < basePts.length; i++) {
      const next = basePts[(i + 1) % basePts.length];
      projLines.push({ start: basePts[i], end: next, type: 'visible', strokeWidth: 0.5 });
    }

    // Top ring
    const topPts = data.topPoints.map((p) => transformPoint({ x: p.x, y: p.z, z: p.y }));
    for (let i = 0; i < topPts.length; i++) {
      const next = topPts[(i + 1) % topPts.length];
      projLines.push({ start: topPts[i], end: next, type: 'visible', strokeWidth: 0.5 });
    }

    // Silhouette lines
    for (const [p1, p2] of data.silhouetteLines) {
      projLines.push({
        start: transformPoint({ x: p1.x, y: p1.z, z: p1.y }),
        end: transformPoint({ x: p2.x, y: p2.z, z: p2.y }),
        type: 'visible',
        strokeWidth: 0.5,
      });
    }

    // Cylinder axis centerline
    if (showCenterlines) {
      const topCenter = transformPoint({
        x: cyl.center.x + norm.x * cyl.height,
        y: cyl.center.y + norm.y * cyl.height,
        z: (cyl.center.z || 0) + norm.z * cyl.height,
      });
      const baseCenter = transformPoint(cyl.center);
      projLines.push({
        start: baseCenter,
        end: topCenter,
        type: 'center',
        color: '#64748b',
        strokeWidth: 0.25,
      });
    }
  }

  // 5. Spheres
  for (const s of spheres) {
    const c = transformPoint(s.center);
    const r = s.radius * scale;
    projCircles.push({
      center: c,
      radius: r,
      type: 'visible',
      color: '#111827',
    });

    if (showCenterlines) {
      const ext = r * 1.2;
      projLines.push({
        start: { x: c.x - ext, y: c.y },
        end: { x: c.x + ext, y: c.y },
        type: 'center',
        color: '#64748b',
        strokeWidth: 0.25,
      });
      projLines.push({
        start: { x: c.x, y: c.y - ext },
        end: { x: c.x, y: c.y + ext },
        type: 'center',
        color: '#64748b',
        strokeWidth: 0.25,
      });
    }
  }

  // Compute actual bounding box of all rendered 2D geometry
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const track = (pt: ProjectedPoint2D) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  };

  for (const l of projLines) { track(l.start); track(l.end); }
  for (const poly of projPolygons) { for (const pt of poly.points) track(pt); }
  for (const c of projCircles) {
    track({ x: c.center.x - c.radius, y: c.center.y - c.radius });
    track({ x: c.center.x + c.radius, y: c.center.y + c.radius });
  }

  if (!Number.isFinite(minX)) {
    minX = viewCenter.x - 15; maxX = viewCenter.x + 15;
    minY = viewCenter.y - 15; maxY = viewCenter.y + 15;
  }

  const labelPos = {
    x: viewCenter.x,
    y: maxY + 5.5,
  };

  const actualBounds = {
    minX: minX - 2,
    maxX: maxX + 2,
    minY: minY - 2,
    maxY: maxY + 9, // includes label height
  };

  return {
    lines: projLines,
    polygons: projPolygons,
    circles: projCircles,
    actualBounds,
    labelPos,
  };
}

/**
 * Calculates complete sheet layout including borders, zones, title block, and view positions
 */
export function generateSheetLayout(
  config: TechnicalSheetConfig,
  lines: DrawingLine[],
  arcs: DrawingArc[],
  cylinders: DrawingCylinder[],
  spheres: DrawingSphere[],
  faceColors: Record<string, string>
): SheetLayoutResult {
  const paper = PAPER_SIZES[config.paperSize] || PAPER_SIZES.A4_LANDSCAPE;

  // Standard ISO 5457 Margins: 20mm left filing margin, 10mm other margins
  const margin = { left: 20, top: 10, right: 10, bottom: 10 };
  const border = {
    x: margin.left,
    y: margin.top,
    width: paper.width - margin.left - margin.right,
    height: paper.height - margin.top - margin.bottom,
  };

  // Standard ISO 7200 Title Block (width: 160mm, height: 46mm in bottom-right corner)
  const tbW = Math.min(160, border.width);
  const tbH = 46;
  const titleBlockBox = {
    width: tbW,
    height: tbH,
    x: border.x + border.width - tbW,
    y: border.y + border.height - tbH,
  };

  // Reference Zones (ISO 5457: A, B, C, D vertically; 1, 2, 3, 4, 5, 6 horizontally)
  const zoneColsCount = paper.width >= 400 ? 8 : 6;
  const zoneRowsCount = paper.height >= 280 ? 6 : 4;
  const colStep = border.width / zoneColsCount;
  const rowStep = border.height / zoneRowsCount;

  const cols: { label: string; x: number }[] = [];
  for (let i = 0; i < zoneColsCount; i++) {
    cols.push({ label: String(i + 1), x: border.x + i * colStep + colStep / 2 });
  }

  const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rows: { label: string; y: number }[] = [];
  for (let i = 0; i < zoneRowsCount; i++) {
    rows.push({ label: rowLetters[i], y: border.y + i * rowStep + rowStep / 2 });
  }

  const views: SheetViewItem[] = [];

  // Parse or determine scale factor
  const getExplicitScale = (): number | null => {
    switch (config.scaleMode) {
      case '1:10': return 0.1;
      case '1:5': return 0.2;
      case '1:2': return 0.5;
      case '1:1': return 1.0;
      case '2:1': return 2.0;
      case '5:1': return 5.0;
      case '10:1': return 10.0;
      default: return null;
    }
  };

  const scaleMultiplier = config.overallScaleMultiplier ?? 1.0;

  if (config.layoutMode === 'single_view') {
    // Single View Layout: large centered view occupying drawing space above/left of title block
    const viewType = config.singleViewType;
    const bounds = computeViewBounds(lines, arcs, cylinders, spheres, viewType);

    const explicitScale = getExplicitScale();
    const availW = border.width - 24;
    const availH = border.height - titleBlockBox.height - 20;
    const autoScale = Math.min(availW / (bounds.width || 1), availH / (bounds.height || 1)) * 0.75;
    const baseScale = (explicitScale ?? autoScale) * scaleMultiplier;

    // Check custom user placement
    const custom = config.customPlacements?.['view-single'] || config.customPlacements?.[viewType];
    const viewCenter = {
      x: custom?.x ?? (border.x + border.width / 2),
      y: custom?.y ?? (border.y + (border.height - titleBlockBox.height * 0.5) / 2),
    };
    const finalScale = (custom?.scale ?? baseScale);

    if (custom?.enabled !== false) {
      const geom = buildViewGeometry(
        viewType,
        lines,
        arcs,
        cylinders,
        spheres,
        faceColors,
        config.shadingStyle,
        finalScale,
        viewCenter,
        { x: bounds.centerX, y: bounds.centerY },
        config.showCenterlines
      );

      const titleMap: Record<SingleViewType, string> = {
        iso: 'ISOMETRIC 3D VIEW',
        front: 'FRONT ELEVATION',
        top: 'TOP PLAN VIEW',
        right: 'RIGHT SIDE ELEVATION',
        left: 'LEFT SIDE ELEVATION',
        back: 'BACK ELEVATION',
        bottom: 'BOTTOM VIEW',
      };

      views.push({
        id: viewType,
        title: titleMap[viewType] || 'PROJECTION VIEW',
        viewType,
        center: viewCenter,
        box: {
          x: viewCenter.x - availW / 2,
          y: viewCenter.y - availH / 2,
          width: availW,
          height: availH,
        },
        actualBounds: geom.actualBounds,
        labelPos: geom.labelPos,
        scale: finalScale,
        lines: geom.lines,
        polygons: geom.polygons,
        circles: geom.circles,
      });
    }
  } else {
    // Multi-View (4-View) Technical Sheet Layout:
    // Front, Top, Right Side, and 3D Isometric View
    type ViewSpec = {
      id: SingleViewType;
      title: string;
      defaultCenter: { x: number; y: number };
      targetSize: number; // mm
    };

    let viewSpecs: ViewSpec[];

    if (config.projection === 'third_angle') {
      // Third Angle:
      // Top Plan: x=65, y=55
      // Front Elevation: x=65, y=140
      // Right Side Elevation: x=112, y=140 (comfortably left of title block x=137!)
      // Isometric View: x=205, y=75 (open top-right space!)
      viewSpecs = [
        { id: 'top', title: 'TOP PLAN', defaultCenter: { x: border.x + 48, y: border.y + 48 }, targetSize: 45 },
        { id: 'front', title: 'FRONT ELEVATION', defaultCenter: { x: border.x + 48, y: border.y + 128 }, targetSize: 45 },
        { id: 'right', title: 'RIGHT SIDE ELEVATION', defaultCenter: { x: border.x + 94, y: border.y + 128 }, targetSize: 45 },
        { id: 'iso', title: 'ISOMETRIC 3D VIEW', defaultCenter: { x: border.x + 195, y: border.y + 65 }, targetSize: 65 },
      ];
    } else {
      // First Angle (ISO / European standard):
      // Front Elevation: top-left
      // Right Side Elevation: top-center
      // Top Plan: bottom-left
      // Isometric View: top-right
      viewSpecs = [
        { id: 'front', title: 'FRONT ELEVATION', defaultCenter: { x: border.x + 48, y: border.y + 48 }, targetSize: 45 },
        { id: 'right', title: 'RIGHT SIDE ELEVATION', defaultCenter: { x: border.x + 94, y: border.y + 48 }, targetSize: 45 },
        { id: 'top', title: 'TOP PLAN', defaultCenter: { x: border.x + 48, y: border.y + 128 }, targetSize: 45 },
        { id: 'iso', title: 'ISOMETRIC 3D VIEW', defaultCenter: { x: border.x + 195, y: border.y + 65 }, targetSize: 65 },
      ];
    }

    // Compute bounds for all views to find balanced scale
    const boundsMap = {
      front: computeViewBounds(lines, arcs, cylinders, spheres, 'front'),
      top: computeViewBounds(lines, arcs, cylinders, spheres, 'top'),
      right: computeViewBounds(lines, arcs, cylinders, spheres, 'right'),
      iso: computeViewBounds(lines, arcs, cylinders, spheres, 'iso'),
    };

    const maxOrthoDim = Math.max(
      boundsMap.front.width, boundsMap.front.height,
      boundsMap.top.width, boundsMap.top.height,
      boundsMap.right.width, boundsMap.right.height,
      1
    );

    const explicitScale = getExplicitScale();
    const defaultOrthoScale = (50 / maxOrthoDim);
    const baseOrthoScale = (explicitScale ?? defaultOrthoScale) * scaleMultiplier;

    const defaultIsoScale = (75 / (Math.max(boundsMap.iso.width, boundsMap.iso.height) || 1));
    const baseIsoScale = (explicitScale ?? defaultIsoScale) * scaleMultiplier;

    for (const spec of viewSpecs) {
      const custom = config.customPlacements?.[spec.id];
      if (custom?.enabled === false) continue; // User turned this view off

      const b = boundsMap[spec.id as 'front' | 'top' | 'right' | 'iso'] || boundsMap.front;
      const baseScale = spec.id === 'iso' ? baseIsoScale : baseOrthoScale;
      const finalScale = custom?.scale ?? baseScale;

      const viewCenter = {
        x: custom?.x ?? spec.defaultCenter.x,
        y: custom?.y ?? spec.defaultCenter.y,
      };

      const geom = buildViewGeometry(
        spec.id,
        lines,
        arcs,
        cylinders,
        spheres,
        faceColors,
        config.shadingStyle,
        finalScale,
        viewCenter,
        { x: b.centerX, y: b.centerY },
        config.showCenterlines
      );

      views.push({
        id: spec.id,
        title: spec.title,
        viewType: spec.id,
        center: viewCenter,
        box: {
          x: viewCenter.x - spec.targetSize / 2,
          y: viewCenter.y - spec.targetSize / 2,
          width: spec.targetSize,
          height: spec.targetSize,
        },
        actualBounds: geom.actualBounds,
        labelPos: geom.labelPos,
        scale: finalScale,
        lines: geom.lines,
        polygons: geom.polygons,
        circles: geom.circles,
      });
    }
  }

  return {
    paper,
    margin,
    border,
    titleBlockBox,
    views,
    zones: { cols, rows },
  };
}
