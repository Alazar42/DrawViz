import React, { useRef, useEffect, useCallback } from 'react';
import { DrawingLine, DrawingArc, Point3D, ScreenPoint, ToolType, GridSettings } from '../types/drawing';
import {
  gridToWorld,
  worldToScreen,
  screenToWorld,
  ViewportTransform,
  COS_30,
  TAN_30,
  IsoplaneType,
  getIsocircleEllipseParams,
  distanceToIsocircle,
} from '../geometry/isometric';
import { calculateSnap, SnapResult } from '../geometry/snapping';
import { CursorState } from '../state/drawingState';

interface IsometricCanvasProps {
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  activeLayerId: string;
  selectedLineId: string | null;
  selectedArcId?: string | null;
  activeTool: ToolType;
  gridSettings: GridSettings;
  viewport: ViewportTransform;
  activeAnchor: Point3D | null;
  activeElevation?: number;
  activeIsoplane?: IsoplaneType;
  onSelectLine: (id: string | null) => void;
  onSelectArc?: (id: string | null) => void;
  onAddLine: (line: DrawingLine) => void;
  onAddArc?: (arc: DrawingArc) => void;
  onRemoveLine: (id: string) => void;
  onRemoveArc?: (id: string) => void;
  onSetViewport: (transform: Partial<ViewportTransform>) => void;
  onSetAnchor: (anchor: Point3D | null) => void;
  onCursorUpdate: (state: CursorState) => void;
  onSetElevation?: (elevation: number) => void;
  onSetIsoplane?: (isoplane: IsoplaneType) => void;
}

// Helper: Distance from point to line segment in screen pixels
function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export const IsometricCanvas: React.FC<IsometricCanvasProps> = ({
  lines,
  arcs = [],
  activeLayerId,
  selectedLineId,
  selectedArcId = null,
  activeTool,
  gridSettings,
  viewport,
  activeAnchor,
  activeElevation = 0,
  activeIsoplane = 'top',
  onSelectLine,
  onSelectArc,
  onAddLine,
  onAddArc,
  onRemoveLine,
  onRemoveArc,
  onSetViewport,
  onSetAnchor,
  onCursorUpdate,
  onSetElevation,
  onSetIsoplane,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const isPanningRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const panStartRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const currentSnapRef = useRef<SnapResult | null>(null);

  // Resize handler for high-DPI canvases
  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    [gridCanvasRef.current, mainCanvasRef.current, overlayCanvasRef.current].forEach((cvs) => {
      if (cvs) {
        cvs.width = width * dpr;
        cvs.height = height * dpr;
        cvs.style.width = `${width}px`;
        cvs.style.height = `${height}px`;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.resetTransform?.();
          ctx.scale(dpr, dpr);
        }
      }
    });

    // Initialize center viewport if pan is 0
    if (viewport.panX === 0 && viewport.panY === 0) {
      onSetViewport({ panX: width / 2, panY: height / 2 });
    }
  }, [viewport.panX, viewport.panY, onSetViewport]);

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // 1. Draw Isometric Grid Layer
  useEffect(() => {
    const cvs = gridCanvasRef.current;
    const container = containerRef.current;
    if (!cvs || !container) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    ctx.clearRect(0, 0, width, height);

    if (!gridSettings.showGrid) return;

    const unit = gridSettings.unitSize * viewport.zoom;
    if (unit < 6) return; // Don't render if too small to prevent aliasing clutter

    ctx.save();
    ctx.lineWidth = 1.0;

    // Subtle grid paper styling
    ctx.strokeStyle = '#e9ecef';

    const colStep = COS_30 * unit;
    const startCol = Math.floor((-viewport.panX) / colStep) - 2;
    const endCol = Math.ceil((width - viewport.panX) / colStep) + 2;

    const startRow = Math.floor((-viewport.panY) / unit) - 2;
    const endRow = Math.ceil((height - viewport.panY) / unit) + 2;

    ctx.beginPath();

    // 1. Vertical grid lines
    for (let c = startCol; c <= endCol; c++) {
      const wx = c * colStep + viewport.panX;
      ctx.moveTo(wx, 0);
      ctx.lineTo(wx, height);
    }

    // 2. Slanted grid lines at +30° and -30° (step by 1 for full 6-way intersections)
    const diagSpan = Math.max(width, height) * 2;
    for (let r = startRow - (endCol - startCol); r <= endRow + (endCol - startCol); r += 1) {
      const yAnchor = r * unit + viewport.panY;

      // +30 degrees (slope: TAN_30 = 1 / sqrt(3))
      ctx.moveTo(-diagSpan, yAnchor - diagSpan * TAN_30);
      ctx.lineTo(width + diagSpan, yAnchor + (width + diagSpan) * TAN_30);

      // -30 degrees
      ctx.moveTo(-diagSpan, yAnchor + diagSpan * TAN_30);
      ctx.lineTo(width + diagSpan, yAnchor - (width + diagSpan) * TAN_30);
    }

    ctx.stroke();

    // 3. Ground Origin axis cross indicator (Z = 0)
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(viewport.panX - 12, viewport.panY);
    ctx.lineTo(viewport.panX + 12, viewport.panY);
    ctx.moveTo(viewport.panX, viewport.panY - 12);
    ctx.lineTo(viewport.panX, viewport.panY + 12);
    ctx.stroke();

    // 4. Active Elevation plane indicator if Z !== 0
    if (activeElevation !== 0) {
      const elevY = viewport.panY - activeElevation * unit;
      // Active elevation cross
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(viewport.panX - 12, elevY);
      ctx.lineTo(viewport.panX + 12, elevY);
      ctx.moveTo(viewport.panX, elevY - 12);
      ctx.lineTo(viewport.panX, elevY + 12);
      ctx.stroke();

      // Dashed vertical riser connecting ground to active elevation plane
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(viewport.panX, viewport.panY);
      ctx.lineTo(viewport.panX, elevY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [gridSettings, viewport, activeElevation]);

  // 2. Draw Main Geometry Layer
  useEffect(() => {
    const cvs = mainCanvasRef.current;
    const container = containerRef.current;
    if (!cvs || !container) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    lines.forEach((line) => {
      const isSelected = line.id === selectedLineId;
      const w1 = gridToWorld(line.start.x, line.start.y, line.start.z, gridSettings.unitSize);
      const w2 = gridToWorld(line.end.x, line.end.y, line.end.z, gridSettings.unitSize);

      const p1 = worldToScreen(w1, viewport);
      const p2 = worldToScreen(w2, viewport);

      if (isSelected) {
        // Selection halo
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Line entity
      ctx.strokeStyle = isSelected ? '#111827' : line.style?.stroke || '#1f2937';
      ctx.lineWidth = line.style?.strokeWidth || 1.75;
      ctx.setLineDash(line.style?.lineType === 'dashed' ? [6, 4] : []);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Vertex dots
      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#111827' : '#4b5563';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 2, 0, Math.PI * 2);
      ctx.arc(p2.x, p2.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Render Isocircles & Arcs
    arcs.forEach((arc) => {
      const isSelected = arc.id === selectedArcId;
      const params = getIsocircleEllipseParams(
        arc.center,
        arc.radius,
        arc.plane,
        gridSettings.unitSize,
        viewport,
        arc.startAngle ?? 0,
        arc.endAngle ?? 360
      );

      if (isSelected) {
        // Selection halo
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(
          params.centerScreen.x,
          params.centerScreen.y,
          params.radiusX,
          params.radiusY,
          params.rotation,
          params.startAngleRad,
          params.endAngleRad
        );
        ctx.stroke();
      }

      // Circle stroke
      ctx.strokeStyle = isSelected ? '#111827' : arc.style?.stroke || '#1f2937';
      ctx.lineWidth = arc.style?.strokeWidth || 1.75;
      ctx.setLineDash(arc.style?.lineType === 'dashed' ? [6, 4] : []);

      ctx.beginPath();
      ctx.ellipse(
        params.centerScreen.x,
        params.centerScreen.y,
        params.radiusX,
        params.radiusY,
        params.rotation,
        params.startAngleRad,
        params.endAngleRad
      );
      ctx.stroke();

      // Center dot mark
      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#111827' : '#6b7280';
      ctx.beginPath();
      ctx.arc(params.centerScreen.x, params.centerScreen.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }, [lines, arcs, selectedLineId, selectedArcId, viewport, gridSettings.unitSize]);

  // 3. Render Interactive Live Overlay
  const renderOverlay = useCallback(() => {
    const cvs = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!cvs || !container) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const snap = currentSnapRef.current;
    if (!snap) return;

    ctx.save();

    // 1. Draw live preview line and polar tracking if actively drawing
    if (activeTool === 'line' && activeAnchor) {
      const anchorWorld = gridToWorld(
        activeAnchor.x,
        activeAnchor.y,
        activeAnchor.z,
        gridSettings.unitSize
      );
      const anchorScreen = worldToScreen(anchorWorld, viewport);

      // Polar tracking guide ray for angle snap
      if (snap.snapType === 'angle-snap' && snap.angleDeg !== undefined) {
        const rad = (snap.angleDeg * Math.PI) / 180;
        const rayLen = Math.max(width, height);
        const rayEnd = {
          x: anchorScreen.x + rayLen * Math.cos(rad),
          y: anchorScreen.y - rayLen * Math.sin(rad),
        };
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(anchorScreen.x, anchorScreen.y);
        ctx.lineTo(rayEnd.x, rayEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 3]);

      ctx.beginPath();
      ctx.moveTo(anchorScreen.x, anchorScreen.y);
      ctx.lineTo(snap.screen.x, snap.screen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start anchor dot
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(anchorScreen.x, anchorScreen.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 1b. Live preview circle / isocircle if circle tool active
    if (activeTool === 'circle' && activeAnchor) {
      const anchorWorld = gridToWorld(
        activeAnchor.x,
        activeAnchor.y,
        activeAnchor.z,
        gridSettings.unitSize
      );
      const anchorScreen = worldToScreen(anchorWorld, viewport);

      const dx = snap.logical.x - activeAnchor.x;
      const dy = snap.logical.y - activeAnchor.y;
      const dz = (snap.logical.z || 0) - (activeAnchor.z || 0);
      let logicalRadius = Math.round(Math.hypot(dx, dy, dz));
      if (logicalRadius <= 0) logicalRadius = 1;

      const params = getIsocircleEllipseParams(
        activeAnchor,
        logicalRadius,
        activeIsoplane,
        gridSettings.unitSize,
        viewport
      );

      // Ellipse preview
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(
        params.centerScreen.x,
        params.centerScreen.y,
        params.radiusX,
        params.radiusY,
        params.rotation,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // Radius ray from center to cursor
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(anchorScreen.x, anchorScreen.y);
      ctx.lineTo(snap.screen.x, snap.screen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dot
      ctx.fillStyle = '#4f46e5';
      ctx.beginPath();
      ctx.arc(anchorScreen.x, anchorScreen.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Dimension badge
      const badge = `Isocircle [${activeIsoplane.toUpperCase()}] R: ${logicalRadius} • Ø ${logicalRadius * 2}`;
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      const bMetrics = ctx.measureText(badge);
      const bW = bMetrics.width + 12;
      const bH = 20;
      const bX = (anchorScreen.x + snap.screen.x) / 2 + 10;
      const bY = (anchorScreen.y + snap.screen.y) / 2 - 10;

      ctx.fillStyle = 'rgba(79, 70, 229, 0.95)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bX, bY, bW, bH, 4);
      } else {
        ctx.rect(bX, bY, bW, bH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, bX + 6, bY + bH / 2);
    }

    // 2. Line / Edge Snap Highlight
    if (snap.snapType === 'line-edge' && snap.snappedLineId) {
      const targetLine = lines.find((l) => l.id === snap.snappedLineId);
      if (targetLine) {
        const w1 = gridToWorld(targetLine.start.x, targetLine.start.y, targetLine.start.z || 0, gridSettings.unitSize);
        const w2 = gridToWorld(targetLine.end.x, targetLine.end.y, targetLine.end.z || 0, gridSettings.unitSize);
        const p1 = worldToScreen(w1, viewport);
        const p2 = worldToScreen(w2, viewport);

        // Highlight line halo
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.4)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // 3. Snapping Target Indicator
    if (activeTool === 'line' || activeTool === 'circle' || activeTool === 'select') {
      const { x, y } = snap.screen;

      if (snap.snapType === 'line-edge') {
        // Hourglass / Diamond icon for line-edge snap
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.lineTo(x - 5, y + 5);
        ctx.lineTo(x + 5, y - 5);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeStyle = snap.snapType === 'endpoint' ? '#111827' : snap.snapType === 'angle-snap' ? '#4f46e5' : '#6b7280';
        ctx.lineWidth = snap.snapType === 'endpoint' ? 2 : 1.25;
        ctx.beginPath();
        ctx.arc(x, y, snap.snapType === 'endpoint' ? 6 : 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Precision crosshair
      ctx.strokeStyle = snap.snapType === 'line-edge' ? '#818cf8' : '#9ca3af';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = snap.snapType === 'line-edge' || snap.snapType === 'angle-snap' ? '#4f46e5' : '#111827';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 4. Live 3D coordinate tag with plane & angle feedback
      let tag = `X:${snap.logical.x} Y:${snap.logical.y} Z:${snap.logical.z || 0}`;
      if (snap.snapType === 'line-edge' && snap.hostPlane) {
        tag = `Edge [${snap.hostPlane.label}] • ${tag}`;
      } else if (snap.snapType === 'angle-snap' && snap.angleDeg !== undefined) {
        tag = `∠ ${snap.angleDeg}° • ${tag}`;
      } else if (snap.hostPlane) {
        tag = `${tag} • ${snap.hostPlane.label}`;
      }

      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      const textMetrics = ctx.measureText(tag);
      const bgW = textMetrics.width + 10;
      const bgH = 18;
      const bgX = x + 10;
      const bgY = y + 10;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = snap.snapType === 'line-edge' || snap.snapType === 'angle-snap' ? '#c7d2fe' : '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bgX, bgY, bgW, bgH, 3);
      } else {
        ctx.rect(bgX, bgY, bgW, bgH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = snap.snapType === 'line-edge' || snap.snapType === 'angle-snap' ? '#3730a3' : '#111827';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, bgX + 5, bgY + bgH / 2);
    }

    ctx.restore();
  }, [activeTool, activeAnchor, lines, viewport, gridSettings.unitSize, activeIsoplane]);

  // Pointer Event Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // Space or Middle mouse triggers panning
    if (e.button === 1 || isSpacePressedRef.current || activeTool === 'pan') {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - viewport.panX, y: e.clientY - viewport.panY };
      return;
    }

    if (e.button !== 0) return; // Only primary button

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenPt: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const snap = calculateSnap(screenPt, viewport, lines, activeAnchor, {
      snapToGrid: gridSettings.snapToGrid,
      snapToIsometric: gridSettings.snapToIsometric,
      snapToEndpoints: gridSettings.snapToEndpoints,
      unitSize: gridSettings.unitSize,
      activeElevation,
      activeIsoplane,
    });

    if (activeTool === 'line') {
      if (!activeAnchor) {
        // Start line
        onSetAnchor(snap.logical);
      } else {
        // Only add if not zero length
        const isSame =
          snap.logical.x === activeAnchor.x &&
          snap.logical.y === activeAnchor.y &&
          (snap.logical.z || 0) === (activeAnchor.z || 0);

        if (!isSame) {
          const newLine: DrawingLine = {
            id: `line-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            start: { ...activeAnchor },
            end: { ...snap.logical },
            layerId: activeLayerId,
            style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
          };
          onAddLine(newLine);
          // Continuous drawing: set new anchor to committed endpoint
          onSetAnchor(snap.logical);
        }
      }
    } else if (activeTool === 'circle') {
      if (!activeAnchor) {
        // Pick circle center
        onSetAnchor(snap.logical);
      } else {
        const dx = snap.logical.x - activeAnchor.x;
        const dy = snap.logical.y - activeAnchor.y;
        const dz = (snap.logical.z || 0) - (activeAnchor.z || 0);
        let radius = Math.round(Math.hypot(dx, dy, dz));
        if (radius <= 0) radius = 1;

        const newArc: DrawingArc = {
          id: `arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          center: { ...activeAnchor },
          radius,
          plane: activeIsoplane,
          layerId: activeLayerId,
          style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
        };
        onAddArc?.(newArc);
        onSetAnchor(null);
      }
    } else if (activeTool === 'select' || activeTool === 'eraser') {
      // Find line or arc under cursor
      let hitLineId: string | null = null;
      let hitArcId: string | null = null;
      let minDistance = 8; // Screen px tolerance

      lines.forEach((line) => {
        const w1 = gridToWorld(line.start.x, line.start.y, line.start.z, gridSettings.unitSize);
        const w2 = gridToWorld(line.end.x, line.end.y, line.end.z, gridSettings.unitSize);
        const p1 = worldToScreen(w1, viewport);
        const p2 = worldToScreen(w2, viewport);

        const d = distanceToSegment(screenPt, p1, p2);
        if (d < minDistance) {
          minDistance = d;
          hitLineId = line.id;
          hitArcId = null;
        }
      });

      arcs.forEach((arc) => {
        const d = distanceToIsocircle(
          screenPt,
          arc.center,
          arc.radius,
          arc.plane,
          gridSettings.unitSize,
          viewport,
          arc.startAngle ?? 0,
          arc.endAngle ?? 360
        );
        if (d < minDistance) {
          minDistance = d;
          hitArcId = arc.id;
          hitLineId = null;
        }
      });

      if (activeTool === 'select') {
        onSelectLine(hitLineId);
        onSelectArc?.(hitArcId);
      } else if (activeTool === 'eraser') {
        if (hitLineId) onRemoveLine(hitLineId);
        if (hitArcId) onRemoveArc?.(hitArcId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenPt: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isPanningRef.current) {
      onSetViewport({
        panX: e.clientX - panStartRef.current.x,
        panY: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const snap = calculateSnap(screenPt, viewport, lines, activeAnchor, {
      snapToGrid: gridSettings.snapToGrid,
      snapToIsometric: gridSettings.snapToIsometric,
      snapToEndpoints: gridSettings.snapToEndpoints,
      unitSize: gridSettings.unitSize,
      activeElevation,
      activeIsoplane,
    });

    currentSnapRef.current = snap;
    renderOverlay();

    onCursorUpdate({
      screen: screenPt,
      logical: snap.logical,
      snapType: snap.snapType,
      angleDeg: snap.angleDeg,
      hostPlane: snap.hostPlane,
    });
  };

  const handlePointerUp = () => {
    isPanningRef.current = false;
  };

  // Wheel Zoom centered around cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.2, Math.min(4.0, viewport.zoom * zoomFactor));

    const panX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
    const panY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);

    onSetViewport({ zoom: Math.round(newZoom * 100) / 100, panX, panY });
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        isSpacePressedRef.current = true;
      } else if (e.key === 'Escape') {
        onSetAnchor(null);
        onSelectLine(null);
        renderOverlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLineId) {
          onRemoveLine(selectedLineId);
          onSelectLine(null);
        }
      } else if (e.key === '[' || e.key === 'PageDown') {
        // Step active elevation down
        e.preventDefault();
        onSetElevation?.((activeElevation ?? 0) - 1);
      } else if (e.key === ']' || e.key === 'PageUp') {
        // Step active elevation up
        e.preventDefault();
        onSetElevation?.((activeElevation ?? 0) + 1);
      } else if (e.key === 'F5' || (e.key === 'Tab' && !e.shiftKey)) {
        // Cycle Isoplane (AutoCAD Standard F5: Top -> Side -> Front -> Top)
        e.preventDefault();
        const cycleMap: Record<IsoplaneType, IsoplaneType> = {
          top: 'side',
          side: 'front',
          front: 'top',
        };
        onSetIsoplane?.(cycleMap[activeIsoplane || 'top']);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    selectedLineId,
    activeElevation,
    activeIsoplane,
    onSetAnchor,
    onSelectLine,
    onRemoveLine,
    onSetElevation,
    onSetIsoplane,
    renderOverlay,
  ]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor:
          activeTool === 'pan' || isPanningRef.current
            ? 'grab'
            : activeTool === 'line'
            ? 'crosshair'
            : activeTool === 'eraser'
            ? 'cell'
            : 'default',
        backgroundColor: '#ffffff',
      }}
    >
      <canvas
        ref={gridCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={mainCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={overlayCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
    </div>
  );
};
