import React, { useRef, useEffect, useCallback } from 'react';
import { DrawingLine, Point3D, ScreenPoint, ToolType, GridSettings } from '../types/drawing';
import {
  gridToWorld,
  worldToScreen,
  screenToWorld,
  ViewportTransform,
  COS_30,
} from '../geometry/isometric';
import { calculateSnap, SnapResult } from '../geometry/snapping';
import { CursorState } from '../state/drawingState';

interface IsometricCanvasProps {
  lines: DrawingLine[];
  activeLayerId: string;
  selectedLineId: string | null;
  activeTool: ToolType;
  gridSettings: GridSettings;
  viewport: ViewportTransform;
  activeAnchor: Point3D | null;
  onSelectLine: (id: string | null) => void;
  onAddLine: (line: DrawingLine) => void;
  onRemoveLine: (id: string) => void;
  onSetViewport: (transform: Partial<ViewportTransform>) => void;
  onSetAnchor: (anchor: Point3D | null) => void;
  onCursorUpdate: (state: CursorState) => void;
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
  activeLayerId,
  selectedLineId,
  activeTool,
  gridSettings,
  viewport,
  activeAnchor,
  onSelectLine,
  onAddLine,
  onRemoveLine,
  onSetViewport,
  onSetAnchor,
  onCursorUpdate,
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

    // 2. Slanted grid lines at +30° and -30°
    const diagSpan = Math.max(width, height) * 2;
    for (let r = startRow - (endCol - startCol); r <= endRow + (endCol - startCol); r += 2) {
      const yAnchor = r * unit + viewport.panY;

      // +30 degrees (slope: 1 / sqrt(3) -> dy = dx * 0.57735)
      ctx.moveTo(-diagSpan, yAnchor - diagSpan * 0.57735);
      ctx.lineTo(width + diagSpan, yAnchor + (width + diagSpan) * 0.57735);

      // -30 degrees
      ctx.moveTo(-diagSpan, yAnchor + diagSpan * 0.57735);
      ctx.lineTo(width + diagSpan, yAnchor - (width + diagSpan) * 0.57735);
    }

    ctx.stroke();

    // Origin axis cross indicator
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(viewport.panX - 12, viewport.panY);
    ctx.lineTo(viewport.panX + 12, viewport.panY);
    ctx.moveTo(viewport.panX, viewport.panY - 12);
    ctx.lineTo(viewport.panX, viewport.panY + 12);
    ctx.stroke();

    ctx.restore();
  }, [gridSettings, viewport]);

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

    ctx.restore();
  }, [lines, selectedLineId, viewport, gridSettings.unitSize]);

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

    // 1. Draw live preview line if actively drawing
    if (activeTool === 'line' && activeAnchor) {
      const anchorWorld = gridToWorld(
        activeAnchor.x,
        activeAnchor.y,
        activeAnchor.z,
        gridSettings.unitSize
      );
      const anchorScreen = worldToScreen(anchorWorld, viewport);

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

    // 2. Snapping Target Indicator
    if (activeTool === 'line' || activeTool === 'select') {
      const { x, y } = snap.screen;

      // Circle indicator
      ctx.strokeStyle = snap.snapType === 'endpoint' ? '#111827' : '#6b7280';
      ctx.lineWidth = snap.snapType === 'endpoint' ? 2 : 1.25;
      ctx.beginPath();
      ctx.arc(x, y, snap.snapType === 'endpoint' ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();

      // Precision crosshair
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();

      // Small solid center point
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [activeTool, activeAnchor, viewport, gridSettings.unitSize]);

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
    } else if (activeTool === 'select' || activeTool === 'eraser') {
      // Find line under cursor
      let hitLineId: string | null = null;
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
        }
      });

      if (activeTool === 'select') {
        onSelectLine(hitLineId);
      } else if (activeTool === 'eraser' && hitLineId) {
        onRemoveLine(hitLineId);
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
    });

    currentSnapRef.current = snap;
    renderOverlay();

    onCursorUpdate({
      screen: screenPt,
      logical: snap.logical,
      snapType: snap.snapType,
      angleDeg: snap.angleDeg,
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
  }, [selectedLineId, onSetAnchor, onSelectLine, onRemoveLine, renderOverlay]);

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
