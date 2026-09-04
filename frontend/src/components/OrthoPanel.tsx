import React, { useState, useRef, useEffect } from 'react';
import { DrawingLine } from '../types/drawing';
import { OrthoViewport } from '../canvas/OrthoViewport';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';

interface OrthoPanelProps {
  lines: DrawingLine[];
  isOpen: boolean;
  onToggle: () => void;
  selectedLineId?: string | null;
  onSelectLine?: (id: string | null) => void;
}

export const OrthoPanel: React.FC<OrthoPanelProps> = ({
  lines,
  isOpen,
  onToggle,
  selectedLineId,
  onSelectLine,
}) => {
  const [panelHeight, setPanelHeight] = useState<number>(240);
  const [hideOccluded, setHideOccluded] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'cad3'>('horizontal');
  const isDraggingRef = useRef<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(240);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If panel is closed, open it on drag
    if (!isOpen) {
      onToggle();
    }

    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    startHeightRef.current = panelHeight;
    setIsResizing(true);
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;

      // Dragging UP increases panel height
      const deltaY = dragStartYRef.current - e.clientY;
      const maxHeight = Math.min(window.innerHeight * 0.72, 650);
      const newHeight = Math.max(140, Math.min(maxHeight, startHeightRef.current + deltaY));

      setPanelHeight(Math.round(newHeight));
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsResizing(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <div
      style={{
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        transition: isResizing ? 'none' : 'height 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        height: isOpen ? panelHeight : 28,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Resizable Top Edge Drag Handle */}
      <div
        onPointerDown={handleResizeStart}
        title="Drag up/down to resize Orthographic Projections panel"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'row-resize',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 36,
            height: 3,
            borderRadius: 2,
            backgroundColor: isResizing ? '#4b5563' : '#d1d5db',
            transition: 'background-color 0.1s ease',
          }}
        />
      </div>

      {/* Header Bar / Toggle */}
      <div
        onClick={onToggle}
        style={{
          height: 28,
          minHeight: 28,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: '#ffffff',
          borderBottom: isOpen ? '1px solid #e5e7eb' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            onPointerDown={handleResizeStart}
            onClick={(e) => e.stopPropagation()}
            style={{
              cursor: 'row-resize',
              display: 'flex',
              alignItems: 'center',
              color: '#9ca3af',
              padding: '2px 4px',
            }}
            title="Drag to resize panel height"
          >
            <GripHorizontal size={13} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: '0.04em' }}>
            ORTHOGRAPHIC PROJECTIONS
          </span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>
            (Top Plan, Front Elevation, Right Side &bull; Resizable)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isOpen && (
            <>
              {/* Occlusion Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setHideOccluded(!hideOccluded);
                }}
                style={{
                  background: hideOccluded ? '#eef2ff' : '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: hideOccluded ? '#4338ca' : '#4b5563',
                  cursor: 'pointer',
                }}
                title="Toggle hidden edge removal behind planar faces (Technical Blueprint Mode)"
              >
                Plane Occlusion: {hideOccluded ? 'ON (Solid)' : 'OFF (Wireframe)'}
              </button>

              {/* Layout Mode Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLayoutMode(layoutMode === 'horizontal' ? 'cad3' : 'horizontal');
                }}
                style={{
                  background: layoutMode === 'cad3' ? '#eef2ff' : '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: layoutMode === 'cad3' ? '#4338ca' : '#4b5563',
                  cursor: 'pointer',
                }}
                title="Switch between Strip layout and Technical 3-View (PLANTA top, FRONTAL bottom, LATERAL right)"
              >
                Layout: {layoutMode === 'cad3' ? '3-View (CAD)' : 'Strip'}
              </button>

              <span style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>
                {panelHeight}px
              </span>
            </>
          )}
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
            }}
            title={isOpen ? 'Collapse projections panel' : 'Expand projections panel'}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Orthographic Viewports */}
      {isOpen && (
        layoutMode === 'horizontal' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              gap: 10,
              padding: 10,
              overflow: 'hidden',
            }}
          >
            <OrthoViewport
              title="PLANTA (TOP)"
              viewType="top"
              lines={lines}
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
              hideOccluded={hideOccluded}
            />
            <OrthoViewport
              title="FRONTAL (FRONT)"
              viewType="front"
              lines={lines}
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
              hideOccluded={hideOccluded}
            />
            <OrthoViewport
              title="LATERAL (SIDE)"
              viewType="side"
              lines={lines}
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
              hideOccluded={hideOccluded}
            />
          </div>
        ) : (
          /* Technical CAD 3-View Layout (Planta Top, Frontal Bottom-Left, Lateral Bottom-Right) */
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: 8,
              padding: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2', minHeight: 0 }}>
              <OrthoViewport
                title="PLANTA (TOP)"
                viewType="top"
                lines={lines}
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
                hideOccluded={hideOccluded}
              />
            </div>
            <div style={{ gridColumn: '1 / 2', gridRow: '2 / 3', minHeight: 0 }}>
              <OrthoViewport
                title="FRONTAL (FRONT)"
                viewType="front"
                lines={lines}
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
                hideOccluded={hideOccluded}
              />
            </div>
            <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', minHeight: 0 }}>
              <OrthoViewport
                title="LATERAL (SIDE)"
                viewType="side"
                lines={lines}
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
                hideOccluded={hideOccluded}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
};
