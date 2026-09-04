import React, { memo } from 'react';
import { CursorState } from '../state/drawingState';
import { useCursorData } from '../state/cursorStore';
import { IsoplaneType } from '../geometry/isometric';
import { AppTheme } from '../types/drawing';
import { Minus, Plus } from 'lucide-react';

interface StatusBarProps {
  cursorState?: CursorState;
  snapEnabled: boolean;
  zoom: number;
  activeElevation: number;
  activeIsoplane: IsoplaneType;
  theme?: AppTheme;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSetElevation?: (elevation: number) => void;
  onSetIsoplane?: (isoplane: IsoplaneType) => void;
  statusText?: string;
}

export const StatusBar: React.FC<StatusBarProps> = memo(({
  cursorState: propCursorState,
  snapEnabled,
  zoom,
  activeElevation,
  activeIsoplane,
  theme = 'light',
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSetElevation,
  onSetIsoplane,
  statusText = 'Ready',
}) => {
  const storeCursorState = useCursorData();
  const cursorState = propCursorState || storeCursorState;
  const isDark = theme === 'dark';

  return (
    <footer
      style={{
        height: 26,
        minHeight: 26,
        backgroundColor: isDark ? '#181a20' : '#ffffff',
        borderTop: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: isDark ? '#94a3b8' : '#4b5563',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Left: Status & Active Plane Awareness */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 500, color: isDark ? '#f1f5f9' : '#111827' }}>{statusText}</span>
        {cursorState.snapType === 'line-edge' && (
          <span
            style={{
              color: isDark ? '#818cf8' : '#4f46e5',
              fontSize: 10,
              fontWeight: 600,
              backgroundColor: isDark ? '#312e81' : '#eef2ff',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            SNAP: EDGE
          </span>
        )}
        {cursorState.hostPlane && (
          <span
            style={{
              color: isDark ? '#a5b4fc' : '#4338ca',
              fontSize: 10,
              backgroundColor: isDark ? '#2e1065' : '#f5f3ff',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            {cursorState.hostPlane.label}
          </span>
        )}
        {cursorState.angleDeg !== undefined && (
          <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 10 }}>
            ∠ {cursorState.angleDeg}°
          </span>
        )}
      </div>

      {/* Center & Right: Technical Coordinates & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Coordinates */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace' }}>
          <span>
            X: <strong style={{ color: isDark ? '#f1f5f9' : '#111827' }}>{cursorState.logical.x}</strong>
          </span>
          <span>
            Y: <strong style={{ color: isDark ? '#f1f5f9' : '#111827' }}>{cursorState.logical.y}</strong>
          </span>
          <span>
            Z:{' '}
            <strong style={{ color: cursorState.logical.z ? '#818cf8' : (isDark ? '#f1f5f9' : '#111827') }}>
              {cursorState.logical.z || 0}
            </strong>
          </span>
        </div>

        <div style={{ width: 1, height: 12, backgroundColor: isDark ? '#2d3139' : '#e5e7eb' }} />

        {/* Drafting Plane & Elevation */}
        <button
          onClick={() => {
            const cycleMap: Record<IsoplaneType, IsoplaneType> = {
              top: 'side',
              side: 'front',
              front: 'top',
            };
            onSetIsoplane?.(cycleMap[activeIsoplane]);
          }}
          title="Click or press F5 / Tab to cycle Isoplane"
          style={{
            background: isDark ? '#22262e' : 'none',
            border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            cursor: 'pointer',
            color: isDark ? '#e2e8f0' : '#111827',
            fontFamily: 'inherit',
          }}
        >
          Plane: <strong>{activeIsoplane.toUpperCase()}</strong>
        </button>

        <span
          style={{
            fontSize: 10,
            color: activeElevation !== 0 ? (isDark ? '#818cf8' : '#4f46e5') : (isDark ? '#94a3b8' : '#4b5563'),
            fontWeight: activeElevation !== 0 ? 600 : 400,
          }}
          title="Active elevation plane offset (Press [ or ] to adjust)"
        >
          Elev: <strong>Z = {activeElevation >= 0 ? `+${activeElevation}` : activeElevation}</strong>
        </span>

        <div style={{ width: 1, height: 12, backgroundColor: isDark ? '#2d3139' : '#e5e7eb' }} />

        {/* Grid & Snap */}
        <span style={{ fontSize: 10 }}>Grid: 1×1 Iso</span>
        <span style={{ fontSize: 10 }}>
          Snap:{' '}
          <strong style={{ color: snapEnabled ? (isDark ? '#f1f5f9' : '#111827') : (isDark ? '#64748b' : '#9ca3af') }}>
            {snapEnabled ? 'ON' : 'OFF'}
          </strong>
        </span>

        <div style={{ width: 1, height: 12, backgroundColor: isDark ? '#2d3139' : '#e5e7eb' }} />

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={onZoomOut}
            title="Zoom Out"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              color: isDark ? '#94a3b8' : '#4b5563',
            }}
          >
            <Minus size={11} />
          </button>
          <span
            onClick={onZoomReset}
            title="Reset Zoom to 100%"
            style={{
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 10,
              minWidth: 36,
              textAlign: 'center',
              color: isDark ? '#f1f5f9' : '#111827',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            title="Zoom In"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              color: isDark ? '#94a3b8' : '#4b5563',
            }}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
    </footer>
  );
});
