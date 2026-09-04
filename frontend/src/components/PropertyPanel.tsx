import React from 'react';
import { DrawingLine, Layer, ToolType } from '../types/drawing';
import { calculateLogicalLength, getLineDirection } from '../geometry/isometric';
import { Trash2 } from 'lucide-react';

interface PropertyPanelProps {
  selectedLine: DrawingLine | null;
  totalLines: number;
  layers: Layer[];
  unitSize: number;
  zoom: number;
  activeTool: ToolType;
  onDeleteLine: (id: string) => void;
  onUpdateLineStyle: (id: string, style: Partial<DrawingLine['style']>) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedLine,
  totalLines,
  layers,
  unitSize,
  zoom,
  activeTool,
  onDeleteLine,
  onUpdateLineStyle,
}) => {
  const lineDetails = selectedLine
    ? {
        length: calculateLogicalLength(selectedLine.start, selectedLine.end, unitSize),
        direction: getLineDirection(selectedLine.start, selectedLine.end, unitSize),
        layer: layers.find((l) => l.id === selectedLine.layerId)?.name || 'Default',
      }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#9ca3af',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Properties
      </div>

      {selectedLine && lineDetails ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Tool</span>
            <span style={{ fontWeight: 500 }}>Line</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Start</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.start.x}, {selectedLine.start.y}, {selectedLine.start.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>End</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.end.x}, {selectedLine.end.y}, {selectedLine.end.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Length</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lineDetails.length}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Angle</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {lineDetails.direction.angle}°
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Direction</span>
            <span
              style={{
                backgroundColor: '#f3f4f6',
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 500,
              }}
            >
              {lineDetails.direction.directionLabel}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Layer</span>
            <span style={{ fontWeight: 500 }}>{lineDetails.layer}</span>
          </div>

          <div
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#6b7280' }}>Type</span>
            <select
              value={selectedLine.style?.lineType || 'solid'}
              onChange={(e) =>
                onUpdateLineStyle(selectedLine.id, {
                  lineType: e.target.value as any,
                })
              }
              style={{
                fontSize: 11,
                border: '1px solid #e5e7eb',
                borderRadius: 3,
                padding: '2px 4px',
                background: '#ffffff',
                color: '#111827',
              }}
            >
              <option value="solid">Solid (Continuous)</option>
              <option value="dashed">Dashed (Hidden)</option>
            </select>
          </div>

          <button
            onClick={() => onDeleteLine(selectedLine.id)}
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#dc2626',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>Delete Selected</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Workspace</span>
            <span style={{ fontWeight: 500 }}>Isometric 2D</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Active Tool</span>
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{activeTool}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Entities</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{totalLines} lines</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Zoom Level</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              padding: '6px 8px',
              backgroundColor: '#f9fafb',
              borderRadius: 4,
              border: '1px solid #f3f4f6',
              color: '#6b7280',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            Click with the Select tool (V) to inspect individual vector coordinates and angles.
          </div>
        </div>
      )}
    </div>
  );
};
