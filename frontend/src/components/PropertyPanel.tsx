import { DrawingLine, DrawingArc, Layer, ToolType, Point3D, Face3D } from '../types/drawing';
import { calculateLogicalLength, getLineDirection } from '../geometry/isometric';
import { Trash2, Sparkles } from 'lucide-react';

interface PropertyPanelProps {
  selectedLine: DrawingLine | null;
  selectedArc?: DrawingArc | null;
  selectedVertex?: Point3D | null;
  selectedFace?: Face3D | null;
  totalLines: number;
  totalArcs?: number;
  layers: Layer[];
  unitSize: number;
  zoom: number;
  activeTool: ToolType;
  onDeleteLine: (id: string) => void;
  onDeleteArc?: (id: string) => void;
  onUpdateLineStyle: (id: string, style: Partial<DrawingLine['style']>) => void;
  onSketchOnFace?: (face: Face3D) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedLine,
  selectedArc = null,
  selectedVertex = null,
  selectedFace = null,
  totalLines,
  totalArcs = 0,
  layers,
  unitSize,
  zoom,
  activeTool,
  onDeleteLine,
  onDeleteArc,
  onUpdateLineStyle,
  onSketchOnFace,
}) => {
  const lineDetails = selectedLine
    ? {
        length: calculateLogicalLength(selectedLine.start, selectedLine.end, unitSize),
        direction: getLineDirection(selectedLine.start, selectedLine.end, unitSize),
        layer: layers.find((l) => l.id === selectedLine.layerId)?.name || 'Default',
      }
    : null;

  const arcLayer = selectedArc ? layers.find((l) => l.id === selectedArc.layerId)?.name || 'Default' : null;

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
      ) : selectedArc ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 500 }}>Isocircle</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Plane</span>
            <span
              style={{
                backgroundColor: '#ede9fe',
                color: '#5b21b6',
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 600,
              }}
            >
              {selectedArc.plane.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Center</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedArc.center.x}, {selectedArc.center.y}, {selectedArc.center.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Radius (R)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Diameter (Ø)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius * 2}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Layer</span>
            <span style={{ fontWeight: 500 }}>{arcLayer}</span>
          </div>

          <button
            onClick={() => onDeleteArc?.(selectedArc.id)}
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
            <span>Delete Isocircle</span>
          </button>
        </div>
      ) : selectedVertex ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#4f46e5' }}>3D Vertex</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Coordinate X</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.x}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Coordinate Y (Depth)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.y}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Coordinate Z (Height)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.z || 0}</span>
          </div>

          <div
            style={{
              marginTop: 6,
              padding: '6px 8px',
              backgroundColor: '#eef2ff',
              borderRadius: 4,
              border: '1px solid #c7d2fe',
              color: '#3730a3',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            Vertex selected. Switch to Line tool (L) to snap and draw directly from this point.
          </div>
        </div>
      ) : selectedFace ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#4f46e5' }}>Planar Face</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Plane Orientation</span>
            <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{selectedFace.plane}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Face Elevation</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedFace.elevation}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Center (X, Y, Z)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedFace.center.x}, {selectedFace.center.y}, {selectedFace.center.z})
            </span>
          </div>

          <button
            onClick={() => onSketchOnFace?.(selectedFace)}
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: 4,
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(79, 70, 229, 0.25)',
            }}
          >
            <Sparkles size={13} />
            <span>Sketch on this Face</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Workspace</span>
            <span style={{ fontWeight: 500 }}>3D CAD Studio</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Active Tool</span>
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{activeTool}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span style={{ color: '#6b7280' }}>Entities</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {totalLines} lines{totalArcs > 0 ? `, ${totalArcs} circles` : ''}
            </span>
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
            Use Blender modes 1 (Vertex), 2 (Edge), 3 (Face) to inspect and sketch on 3D geometry.
          </div>
        </div>
      )}
    </div>
  );
};
