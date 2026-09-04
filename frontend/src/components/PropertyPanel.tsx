import { DrawingLine, DrawingArc, DrawingCylinder, Layer, ToolType, Point3D, Face3D, ArcBulgeDirection, AppTheme } from '../types/drawing';
import { calculateLogicalLength, getLineDirection } from '../geometry/isometric';
import { logicalToThree, threeToLogical, threeToLogicalNormal, getTwoPointArcPoints } from '../geometry/circle3d';
import { Trash2, Sparkles, Box, ArrowUpCircle } from 'lucide-react';

interface PropertyPanelProps {
  selectedLine: DrawingLine | null;
  selectedArc?: DrawingArc | null;
  selectedCylinder?: DrawingCylinder | null;
  selectedVertex?: Point3D | null;
  selectedFace?: Face3D | null;
  totalLines: number;
  totalArcs?: number;
  totalCylinders?: number;
  layers?: Layer[];
  unitSize: number;
  zoom: number;
  activeTool: ToolType;
  theme?: AppTheme;
  onDeleteLine: (id: string) => void;
  onDeleteArc?: (id: string) => void;
  onDeleteCylinder?: (id: string) => void;
  onExtrudeArc?: (arc: DrawingArc) => void;
  onUpdateArc?: (arc: DrawingArc) => void;
  onUpdateLineStyle: (id: string, style: Partial<DrawingLine['style']>) => void;
  onSketchOnFace?: (face: Face3D) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedLine,
  selectedArc = null,
  selectedCylinder = null,
  selectedVertex = null,
  selectedFace = null,
  totalLines,
  totalArcs = 0,
  totalCylinders = 0,
  layers = [],
  unitSize,
  zoom,
  activeTool,
  theme = 'light',
  onDeleteLine,
  onDeleteArc,
  onDeleteCylinder,
  onExtrudeArc,
  onUpdateArc,
  onUpdateLineStyle,
  onSketchOnFace,
}) => {
  const isDark = theme === 'dark';

  const handleUpdateArcBulge = (newBulge: ArcBulgeDirection) => {
    if (!selectedArc || !selectedArc.startPoint || !selectedArc.endPoint || !onUpdateArc) return;
    const p1 = logicalToThree(selectedArc.startPoint);
    const p2 = logicalToThree(selectedArc.endPoint);
    const res = getTwoPointArcPoints(p1, p2, selectedArc.radius, newBulge, 48);
    const updated: DrawingArc = {
      ...selectedArc,
      radius: res.actualRadius,
      center: threeToLogical(res.center),
      normal: threeToLogicalNormal(res.normal),
      bulgeDir: newBulge,
      endAngle: Math.round((res.subtendedAngle * 180) / Math.PI),
    };
    onUpdateArc(updated);
  };

  const handleUpdateArcRadius = (newR: number) => {
    if (!selectedArc || !onUpdateArc) return;
    if (selectedArc.startPoint && selectedArc.endPoint) {
      const p1 = logicalToThree(selectedArc.startPoint);
      const p2 = logicalToThree(selectedArc.endPoint);
      const bDir = selectedArc.bulgeDir || '+z';
      const res = getTwoPointArcPoints(p1, p2, Math.max(1, newR), bDir, 48);
      const updated: DrawingArc = {
        ...selectedArc,
        radius: res.actualRadius,
        center: threeToLogical(res.center),
        normal: threeToLogicalNormal(res.normal),
        endAngle: Math.round((res.subtendedAngle * 180) / Math.PI),
      };
      onUpdateArc(updated);
    } else {
      onUpdateArc({ ...selectedArc, radius: Math.max(1, newR) });
    }
  };

  const lineDetails = selectedLine
    ? {
        length: calculateLogicalLength(selectedLine.start, selectedLine.end, unitSize),
        direction: getLineDirection(selectedLine.start, selectedLine.end, unitSize),
      }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: isDark ? '#94a3b8' : '#9ca3af',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Properties
      </div>

      {selectedLine && lineDetails ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Tool</span>
            <span style={{ fontWeight: 500 }}>Line</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Start</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.start.x}, {selectedLine.start.y}, {selectedLine.start.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>End</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.end.x}, {selectedLine.end.y}, {selectedLine.end.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Length</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lineDetails.length}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Angle</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {lineDetails.direction.angle}°
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Direction</span>
            <span
              style={{
                backgroundColor: isDark ? '#282c34' : '#f3f4f6',
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 500,
                color: isDark ? '#cbd5e1' : '#111827',
              }}
            >
              {lineDetails.direction.directionLabel}
            </span>
          </div>

          <div
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: isDark ? '1px solid #2d3139' : '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Type</span>
            <select
              value={selectedLine.style?.lineType || 'solid'}
              onChange={(e) =>
                onUpdateLineStyle(selectedLine.id, {
                  lineType: e.target.value as any,
                })
              }
              style={{
                fontSize: 11,
                border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                borderRadius: 3,
                padding: '2px 4px',
                background: isDark ? '#1e2026' : '#ffffff',
                color: isDark ? '#f8fafc' : '#111827',
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
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>
              {selectedArc.startPoint && selectedArc.endPoint
                ? 'Two-Vertex Arc'
                : (selectedArc.endAngle ?? 360) - (selectedArc.startAngle ?? 0) <= 180
                ? 'Half Arc (180°)'
                : 'Circle (360°)'}
            </span>
          </div>

          {selectedArc.startPoint && selectedArc.endPoint ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 10 }}>Endpoints (P1 → P2)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                  ({selectedArc.startPoint.x}, {selectedArc.startPoint.y}, {selectedArc.startPoint.z || 0}) → (
                  {selectedArc.endPoint.x}, {selectedArc.endPoint.y}, {selectedArc.endPoint.z || 0})
                </span>
              </div>

              {(() => {
                const chordDist =
                  Math.round(
                    Math.hypot(
                      selectedArc.endPoint.x - selectedArc.startPoint.x,
                      selectedArc.endPoint.y - selectedArc.startPoint.y,
                      (selectedArc.endPoint.z || 0) - (selectedArc.startPoint.z || 0)
                    ) * 10
                  ) / 10;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                      <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Chord Distance</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{chordDist}</span>
                    </div>

                    <div>
                      <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 10, display: 'block', marginBottom: 4 }}>
                        Bulge / Plane Direction:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                        {(['+z', '-z', '+y', '-y', '+x', '-x'] as const).map((dir) => {
                          const isSel = (selectedArc.bulgeDir || '+z') === dir;
                          return (
                            <button
                              key={dir}
                              onClick={() => handleUpdateArcBulge(dir)}
                              style={{
                                padding: '3px 4px',
                                fontSize: 10,
                                fontWeight: isSel ? 700 : 500,
                                backgroundColor: isSel ? '#4f46e5' : (isDark ? '#22262e' : '#f1f5f9'),
                                color: isSel ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569'),
                                border: isSel ? '1px solid #4f46e5' : (isDark ? '1px solid #334155' : '1px solid #cbd5e1'),
                                borderRadius: 4,
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                              }}
                            >
                              {dir}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius:</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist / 2)))}
                            title="Set to exact semicircle (180° / π radians)"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            π (D/2)
                          </button>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist)))}
                            title="Radius = Chord Distance"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            1×
                          </button>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist * 2)))}
                            title="Radius = 2 * Chord Distance (Gentle curve)"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            2×
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => handleUpdateArcRadius(Math.max(1, selectedArc.radius - 1))}
                          style={{
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDark ? '#22262e' : '#f1f5f9',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            color: isDark ? '#e2e8f0' : '#111827',
                            cursor: 'pointer',
                          }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={selectedArc.radius}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v > 0) handleUpdateArcRadius(v);
                          }}
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: '2px 0',
                            fontSize: 11,
                            backgroundColor: isDark ? '#1e2026' : '#ffffff',
                            color: isDark ? '#f8fafc' : '#111827',
                          }}
                        />
                        <button
                          onClick={() => handleUpdateArcRadius(selectedArc.radius + 1)}
                          style={{
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDark ? '#22262e' : '#f1f5f9',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            color: isDark ? '#e2e8f0' : '#111827',
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Plane / Normal</span>
                <span
                  style={{
                    backgroundColor: isDark ? '#2e1065' : '#ede9fe',
                    color: isDark ? '#c4b5fd' : '#5b21b6',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                >
                  {selectedArc.normal
                    ? `[${selectedArc.normal.x}, ${selectedArc.normal.y}, ${selectedArc.normal.z || 0}]`
                    : (selectedArc.plane || 'TOP').toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  ({selectedArc.center.x}, {selectedArc.center.y}, {selectedArc.center.z || 0})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius (R)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Diameter (Ø)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius * 2}</span>
              </div>
            </>
          )}

          {onExtrudeArc && (
            <button
              onClick={() => onExtrudeArc(selectedArc)}
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '6px 8px',
                backgroundColor: '#4f46e5',
                border: 'none',
                borderRadius: 4,
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Extrude circle into 3D cylinder (E)"
            >
              <ArrowUpCircle size={13} />
              <span>Extrude to Cylinder (E)</span>
            </button>
          )}

          <button
            onClick={() => onDeleteArc?.(selectedArc.id)}
            style={{
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>{selectedArc.startPoint && selectedArc.endPoint ? 'Delete Arc' : 'Delete Circle'}</span>
          </button>
        </div>
      ) : selectedCylinder ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>3D Cylinder</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedCylinder.center.x}, {selectedCylinder.center.y}, {selectedCylinder.center.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius (R)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedCylinder.radius}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Height (H)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedCylinder.height}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Normal</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10 }}>
              [{selectedCylinder.normal?.x ?? 0}, {selectedCylinder.normal?.y ?? 0}, {selectedCylinder.normal?.z ?? 1}]
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Volume</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(Math.PI * selectedCylinder.radius * selectedCylinder.radius * selectedCylinder.height)}
            </span>
          </div>

          <button
            onClick={() => onDeleteCylinder?.(selectedCylinder.id)}
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>Delete Cylinder</span>
          </button>
        </div>
      ) : selectedVertex ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>3D Vertex</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate X</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.x}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate Y (Depth)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.y}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate Z (Height)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.z || 0}</span>
          </div>

          <div
            style={{
              marginTop: 6,
              padding: '6px 8px',
              backgroundColor: isDark ? '#1e1b4b' : '#eef2ff',
              borderRadius: 4,
              border: isDark ? '1px solid #3730a3' : '1px solid #c7d2fe',
              color: isDark ? '#c7d2fe' : '#3730a3',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            Vertex selected. Switch to Line tool (L) to snap and draw directly from this point.
          </div>
        </div>
      ) : selectedFace ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>Planar Face</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Plane Orientation</span>
            <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{selectedFace.plane}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Face Elevation</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedFace.elevation}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center (X, Y, Z)</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Workspace</span>
            <span style={{ fontWeight: 500 }}>3D CAD Studio</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Active Tool</span>
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{activeTool}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entities</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {totalLines} lines{totalArcs > 0 ? `, ${totalArcs} circles` : ''}{totalCylinders > 0 ? `, ${totalCylinders} cylinders` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Zoom Level</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              padding: '6px 8px',
              backgroundColor: isDark ? '#1e2026' : '#f9fafb',
              borderRadius: 4,
              border: isDark ? '1px solid #2d3139' : '1px solid #f3f4f6',
              color: isDark ? '#94a3b8' : '#6b7280',
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
