import React, { useRef, useEffect, useCallback } from 'react';
import { DrawingLine, DrawingArc, ScreenPoint } from '../types/drawing';
import { OrthoViewType, projectToOrthoView, OrthoLine2D, OrthoArc2D } from '../geometry/orthographic';

interface OrthoViewportProps {
  title: string;
  viewType: OrthoViewType;
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  selectedLineId?: string | null;
  onSelectLine?: (lineId: string | null) => void;
  hideOccluded?: boolean;
}

// Distance from point to line segment in screen pixels
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

export const OrthoViewport: React.FC<OrthoViewportProps> = ({
  title,
  viewType,
  lines,
  arcs = [],
  selectedLineId,
  onSelectLine,
  hideOccluded = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const projectedLinesRef = useRef<OrthoLine2D[]>([]);
  const projectedArcsRef = useRef<OrthoArc2D[]>([]);

  const renderCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Draw 2D Orthographic Technical Square Grid
    const cellSize = 16;
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= width; x += cellSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += cellSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 2. Project geometry lines and arcs using Virtual Camera and Occlusion
    const { projectedLines, projectedArcs } = projectToOrthoView(lines, viewType, { width, height }, 14, {
      hideOccluded,
      arcs,
    });
    projectedLinesRef.current = projectedLines;
    projectedArcsRef.current = projectedArcs;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw unselected lines
    projectedLines.forEach((l) => {
      const isSelected = l.id === selectedLineId;
      if (isSelected) return;

      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(l.start.x, l.start.y);
      ctx.lineTo(l.end.x, l.end.y);
      ctx.stroke();

      // Vertex dots
      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.arc(l.start.x, l.start.y, 2, 0, Math.PI * 2);
      ctx.arc(l.end.x, l.end.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw unselected arcs/circles
    projectedArcs.forEach((a) => {
      const isSelected = a.id === selectedLineId;
      if (isSelected) return;

      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      const sRad = (a.startAngle * Math.PI) / 180;
      const eRad = (a.endAngle * Math.PI) / 180;
      ctx.arc(a.center.x, a.center.y, a.radius, sRad, eRad);
      ctx.stroke();

      // Center mark
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(a.center.x, a.center.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw selected line with prominent halo
    projectedLines.forEach((l) => {
      const isSelected = l.id === selectedLineId;
      if (!isSelected) return;

      // Selection halo
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(l.start.x, l.start.y);
      ctx.lineTo(l.end.x, l.end.y);
      ctx.stroke();

      // Main stroke
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(l.start.x, l.start.y);
      ctx.lineTo(l.end.x, l.end.y);
      ctx.stroke();

      // Larger endpoint dots
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(l.start.x, l.start.y, 3.5, 0, Math.PI * 2);
      ctx.arc(l.end.x, l.end.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw selected arc with prominent halo
    projectedArcs.forEach((a) => {
      const isSelected = a.id === selectedLineId;
      if (!isSelected) return;

      const sRad = (a.startAngle * Math.PI) / 180;
      const eRad = (a.endAngle * Math.PI) / 180;

      // Selection halo
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(a.center.x, a.center.y, a.radius, sRad, eRad);
      ctx.stroke();

      // Main stroke
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(a.center.x, a.center.y, a.radius, sRad, eRad);
      ctx.stroke();

      // Center mark
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(a.center.x, a.center.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [lines, arcs, viewType, selectedLineId, hideOccluded]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Click interaction: select ONLY the front-most entity along the camera view
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onSelectLine) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickPt: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Find all entities (lines & circles) within 10px click radius
    const candidates: { id: string; depth: number; dist: number }[] = [];

    projectedLinesRef.current.forEach((line) => {
      const d = distanceToSegment(clickPt, line.start, line.end);
      if (d < 10) {
        candidates.push({ id: line.id, depth: line.depth, dist: d });
      }
    });

    projectedArcsRef.current.forEach((arc) => {
      const dCenter = Math.hypot(clickPt.x - arc.center.x, clickPt.y - arc.center.y);
      const d = Math.abs(dCenter - arc.radius);
      if (d < 10) {
        candidates.push({ id: arc.id, depth: arc.depth, dist: d });
      }
    });

    if (candidates.length === 0) {
      onSelectLine(null);
      return;
    }

    // Sort by depth descending (front-most entity first), secondary sort by proximity
    candidates.sort((a, b) => {
      const depthDiff = b.depth - a.depth;
      if (Math.abs(depthDiff) > 0.05) {
        return depthDiff;
      }
      return a.dist - b.dist;
    });

    // Select the front-most entity
    onSelectLine(candidates[0].id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mousePt: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const isHoveringLine = projectedLinesRef.current.some(
      (l) => distanceToSegment(mousePt, l.start, l.end) < 10
    );
    const isHoveringArc = projectedArcsRef.current.some((a) => {
      const d = Math.abs(Math.hypot(mousePt.x - a.center.x, mousePt.y - a.center.y) - a.radius);
      return d < 10;
    });

    canvas.style.cursor = isHoveringLine || isHoveringArc ? 'pointer' : 'default';
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: '5px 10px',
          borderBottom: '1px solid #f3f4f6',
          fontSize: 11,
          fontWeight: 600,
          color: '#374151',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          backgroundColor: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>
          (Front line selectable)
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};
