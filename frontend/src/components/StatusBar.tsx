import React from 'react';
import { CursorState } from '../state/drawingState';
import { Minus, Plus } from 'lucide-react';

interface StatusBarProps {
  cursorState: CursorState;
  snapEnabled: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  statusText?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorState,
  snapEnabled,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  statusText = 'Ready',
}) => {
  return (
    <footer
      style={{
        height: 26,
        minHeight: 26,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: '#4b5563',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Left: Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 500, color: '#111827' }}>{statusText}</span>
        {cursorState.angleDeg !== undefined && (
          <span style={{ color: '#6b7280', fontSize: 10 }}>
            Locked Angle: {cursorState.angleDeg}°
          </span>
        )}
      </div>

      {/* Center & Right: Technical Coordinates & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Coordinates */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace' }}>
          <span>
            X: <strong style={{ color: '#111827' }}>{cursorState.logical.x}</strong>
          </span>
          <span>
            Y: <strong style={{ color: '#111827' }}>{cursorState.logical.y}</strong>
          </span>
          <span>
            Z: <strong style={{ color: '#111827' }}>{cursorState.logical.z || 0}</strong>
          </span>
        </div>

        <div style={{ width: 1, height: 12, backgroundColor: '#e5e7eb' }} />

        {/* Units & Grid */}
        <span style={{ fontSize: 10 }}>Units: 1 × 1</span>
        <span style={{ fontSize: 10 }}>Grid: 1 × 1</span>
        <span style={{ fontSize: 10 }}>Isometric</span>

        <div style={{ width: 1, height: 12, backgroundColor: '#e5e7eb' }} />

        {/* Snap */}
        <span style={{ fontSize: 10 }}>
          Snap: <strong style={{ color: snapEnabled ? '#111827' : '#9ca3af' }}>{snapEnabled ? 'ON' : 'OFF'}</strong>
        </span>

        <div style={{ width: 1, height: 12, backgroundColor: '#e5e7eb' }} />

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
              color: '#4b5563',
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
              color: '#4b5563',
            }}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
    </footer>
  );
};
