import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DrawingLine,
  DrawingArc,
  DrawingCylinder,
  DrawingSphere,
  AppTheme,
} from '../types/drawing';
import {
  TechnicalSheetConfig,
  PaperSize,
  ProjectionStandard,
  ViewLayoutMode,
  SingleViewType,
  ShadingStyle,
  PAPER_SIZES,
  CustomViewPlacement,
  generateSheetLayout,
} from '../geometry/technicalDrawing';
import { generateTechnicalDrawingSvg } from '../export/svgGenerator';
import { generateTechnicalDrawingPdf } from '../export/pdfGenerator';
import {
  X,
  Download,
  FileText,
  Layers,
  ZoomIn,
  ZoomOut,
  Sliders,
  Check,
  Eye,
  EyeOff,
  FileCode,
  Sparkles,
  Move,
  RotateCcw,
  LayoutGrid,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  cylinders?: DrawingCylinder[];
  spheres?: DrawingSphere[];
  faceColors?: Record<string, string>;
  theme?: AppTheme;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  lines,
  arcs = [],
  cylinders = [],
  spheres = [],
  faceColors = {},
  theme = 'light',
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Config State
  const [paperSize, setPaperSize] = useState<PaperSize>('A4_LANDSCAPE');
  const [projection, setProjection] = useState<ProjectionStandard>('third_angle');
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('multi_4view');
  const [singleViewType, setSingleViewType] = useState<SingleViewType>('iso');
  const [scaleMode, setScaleMode] = useState<'auto' | '1:1' | '1:2' | '2:1' | '1:5' | '5:1'>('auto');
  const [overallScaleMultiplier, setOverallScaleMultiplier] = useState<number>(1.0);
  const [shadingStyle, setShadingStyle] = useState<ShadingStyle>('shaded');
  const [showHiddenLines, setShowHiddenLines] = useState<boolean>(true);
  const [showCenterlines, setShowCenterlines] = useState<boolean>(true);
  const [showGridZones, setShowGridZones] = useState<boolean>(true);
  const [showProjectionSymbol, setShowProjectionSymbol] = useState<boolean>(true);

  // Custom User Placements for each view (interactive positioning & scaling)
  const [customPlacements, setCustomPlacements] = useState<Record<string, CustomViewPlacement>>({});
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [hoveredViewId, setHoveredViewId] = useState<string | null>(null);

  // Dragging state
  const isDraggingRef = useRef(false);
  const dragInfoRef = useRef<{
    viewId: string;
    startSvgX: number;
    startSvgY: number;
    initialViewX: number;
    initialViewY: number;
  } | null>(null);

  // Title Block Metadata
  const [title, setTitle] = useState<string>('STEPPED BRACKET COMPONENT');
  const [drawingNumber, setDrawingNumber] = useState<string>('DWG-1001');
  const [revision, setRevision] = useState<string>('REV A');
  const [drawnBy, setDrawnBy] = useState<string>('ENGINEER');
  const [checkedBy, setCheckedBy] = useState<string>('APPROVED');
  const [company, setCompany] = useState<string>('DrawViz Technical Studio');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [units, setUnits] = useState<string>('mm');

  // Preview zoom level
  const [previewZoom, setPreviewZoom] = useState<number>(0.95);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Reset custom placements when switching layout mode or projection
  const handleResetAllPositions = useCallback(() => {
    setCustomPlacements({});
    setSelectedViewId(null);
    setStatusNotice('Reset all view positions to default collision-free layout');
    setTimeout(() => setStatusNotice(null), 3000);
  }, []);

  // Build current sheet config object
  const sheetConfig: TechnicalSheetConfig = useMemo(() => ({
    paperSize,
    projection,
    layoutMode,
    singleViewType,
    scaleMode,
    overallScaleMultiplier,
    shadingStyle,
    showHiddenLines,
    showCenterlines,
    showGridZones,
    showProjectionSymbol,
    showAlignmentLines: true,
    titleBlock: {
      title,
      drawingNumber,
      revision,
      drawnBy,
      checkedBy,
      company,
      date,
      scaleText: scaleMode === 'auto' ? 'NTS (FIT)' : scaleMode,
      units,
    },
    customPlacements,
  }), [
    paperSize,
    projection,
    layoutMode,
    singleViewType,
    scaleMode,
    overallScaleMultiplier,
    shadingStyle,
    showHiddenLines,
    showCenterlines,
    showGridZones,
    showProjectionSymbol,
    title,
    drawingNumber,
    revision,
    drawnBy,
    checkedBy,
    company,
    date,
    units,
    customPlacements,
  ]);

  // Compute layout & generate SVG for real-time live preview
  const layout = useMemo(() => {
    return generateSheetLayout(sheetConfig, lines, arcs, cylinders, spheres, faceColors);
  }, [sheetConfig, lines, arcs, cylinders, spheres, faceColors]);

  const svgContent = useMemo(() => {
    return generateTechnicalDrawingSvg(sheetConfig, layout);
  }, [sheetConfig, layout]);

  // Screen to SVG millimeters conversion
  const screenToSvgPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const res = pt.matrixTransform(ctm.inverse());
    return { x: res.x, y: res.y };
  }, []);

  // Drag handlers
  const handleViewMouseDown = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const svgPt = screenToSvgPoint(e.clientX, e.clientY);
    const viewItem = layout.views.find((v) => v.id === viewId);
    if (!viewItem) return;

    setSelectedViewId(viewId);
    isDraggingRef.current = true;
    dragInfoRef.current = {
      viewId,
      startSvgX: svgPt.x,
      startSvgY: svgPt.y,
      initialViewX: viewItem.center.x,
      initialViewY: viewItem.center.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragInfoRef.current) return;
      const info = dragInfoRef.current;
      const svgPt = screenToSvgPoint(e.clientX, e.clientY);
      const dx = svgPt.x - info.startSvgX;
      const dy = svgPt.y - info.startSvgY;

      const newX = Math.round((info.initialViewX + dx) * 10) / 10;
      const newY = Math.round((info.initialViewY + dy) * 10) / 10;

      setCustomPlacements((prev) => ({
        ...prev,
        [info.viewId]: {
          ...prev[info.viewId],
          x: newX,
          y: newY,
        },
      }));
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragInfoRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [screenToSvgPoint]);

  // Selected view item
  const selectedView = useMemo(() => {
    return layout.views.find((v) => v.id === selectedViewId) || null;
  }, [layout.views, selectedViewId]);

  // Handle Download SVG
  const handleDownloadSvg = useCallback(() => {
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'technical-drawing'}.svg`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setStatusNotice(`Downloaded ${filename}`);
    setTimeout(() => setStatusNotice(null), 3500);
  }, [svgContent, title]);

  // Handle Download PDF
  const handleDownloadPdf = useCallback(() => {
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'technical-drawing'}.pdf`;
    const pdfBlob = generateTechnicalDrawingPdf(sheetConfig, layout);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setStatusNotice(`Downloaded vector PDF: ${filename}`);
    setTimeout(() => setStatusNotice(null), 3500);
  }, [sheetConfig, layout, title]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: 1360,
          height: '93vh',
          maxHeight: 900,
          backgroundColor: isDark ? '#181a20' : '#ffffff',
          borderRadius: 12,
          border: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Top Bar */}
        <div
          style={{
            height: 52,
            minHeight: 52,
            padding: '0 20px',
            backgroundColor: isDark ? '#1e2026' : '#f8fafc',
            borderBottom: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#38bdf8' : '#0284c7',
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                Technical Drawing Studio &amp; Sheet Layout Editor
              </div>
              <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
                Drag views directly on the sheet to position them • Adjust scales • Customize ISO/ASME title block
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {statusNotice && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#10b981',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                ✓ {statusNotice}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                padding: 6,
                cursor: 'pointer',
                borderRadius: 6,
                color: isDark ? '#94a3b8' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close modal (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 2. Main Modal Content */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Settings Sidebar */}
          <div
            style={{
              width: 380,
              minWidth: 380,
              backgroundColor: isDark ? '#1a1c23' : '#fbfcfd',
              borderRight: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
              overflowY: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Quick Action Buttons: Download PDF and Download SVG */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={handleDownloadPdf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Download size={16} />
                Download PDF
              </button>

              <button
                onClick={handleDownloadSvg}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <FileCode size={16} />
                Download SVG
              </button>
            </div>

            {/* Selected View Inspector (When a view is clicked or selected) */}
            {selectedView ? (
              <div
                style={{
                  backgroundColor: isDark ? '#1e293b' : '#eff6ff',
                  border: isDark ? '1px solid #38bdf8' : '1px solid #93c5fd',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Move size={14} color="#0284c7" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e3a8a' }}>
                      {selectedView.title}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedViewId(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block' }}>
                      X Position (mm):
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={Math.round(selectedView.center.x)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomPlacements((prev) => ({
                          ...prev,
                          [selectedView.id]: {
                            ...prev[selectedView.id],
                            x: val,
                          },
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        fontSize: 11,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block' }}>
                      Y Position (mm):
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={Math.round(selectedView.center.y)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomPlacements((prev) => ({
                          ...prev,
                          [selectedView.id]: {
                            ...prev[selectedView.id],
                            y: val,
                          },
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        fontSize: 11,
                      }}
                    />
                  </div>
                </div>

                {/* View Scale Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 2 }}>
                    <span>View Scale Factor:</span>
                    <span>{selectedView.scale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.05"
                    value={selectedView.scale}
                    onChange={(e) => {
                      const s = parseFloat(e.target.value);
                      setCustomPlacements((prev) => ({
                        ...prev,
                        [selectedView.id]: {
                          ...prev[selectedView.id],
                          scale: s,
                        },
                      }));
                    }}
                    style={{ width: '100%', accentColor: '#0284c7' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => {
                      setCustomPlacements((prev) => {
                        const next = { ...prev };
                        delete next[selectedView.id];
                        return next;
                      });
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: 'transparent',
                      border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                      color: isDark ? '#cbd5e1' : '#475569',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <RotateCcw size={11} />
                    Reset Position
                  </button>
                  <button
                    onClick={() => {
                      setCustomPlacements((prev) => ({
                        ...prev,
                        [selectedView.id]: {
                          ...prev[selectedView.id],
                          enabled: false,
                        },
                      }));
                      setSelectedViewId(null);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: 'transparent',
                      border: isDark ? '1px solid #ef4444' : '1px solid #fca5a5',
                      color: '#ef4444',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <EyeOff size={11} />
                    Hide View
                  </button>
                </div>
              </div>
            ) : null}

            {/* Layout Mode & View Chips */}
            <div
              style={{
                backgroundColor: isDark ? '#21242d' : '#ffffff',
                border: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Views &amp; Projection
                </span>
                <button
                  onClick={handleResetAllPositions}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#0284c7',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                  title="Auto-arrange all views"
                >
                  <Sparkles size={12} />
                  Auto-Arrange
                </button>
              </div>

              {/* Mode Toggle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => setLayoutMode('multi_4view')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: layoutMode === 'multi_4view' ? '2px solid #0284c7' : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    backgroundColor: layoutMode === 'multi_4view' ? (isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe') : 'transparent',
                    color: layoutMode === 'multi_4view' ? (isDark ? '#38bdf8' : '#0369a1') : isDark ? '#cbd5e1' : '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  4-View Sheet
                </button>
                <button
                  onClick={() => setLayoutMode('single_view')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: layoutMode === 'single_view' ? '2px solid #0284c7' : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    backgroundColor: layoutMode === 'single_view' ? (isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe') : 'transparent',
                    color: layoutMode === 'single_view' ? (isDark ? '#38bdf8' : '#0369a1') : isDark ? '#cbd5e1' : '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Single View
                </button>
              </div>

              {/* Active Views List / Click to select */}
              {layoutMode === 'multi_4view' && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 4 }}>
                    Active Projection Views:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[
                      { id: 'top', name: 'Top Plan' },
                      { id: 'front', name: 'Front Elevation' },
                      { id: 'right', name: 'Right Side' },
                      { id: 'iso', name: '3D Isometric' },
                    ].map((v) => {
                      const isEnabled = customPlacements[v.id]?.enabled !== false;
                      const isSel = selectedViewId === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => isEnabled && setSelectedViewId(v.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: isSel ? '1px solid #0284c7' : isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                            backgroundColor: isSel
                              ? (isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe')
                              : isEnabled
                              ? (isDark ? '#181a20' : '#f8fafc')
                              : (isDark ? '#14161b' : '#f1f5f9'),
                            opacity: isEnabled ? 1 : 0.5,
                            cursor: isEnabled ? 'pointer' : 'default',
                            fontSize: 11,
                          }}
                        >
                          <span style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                            {v.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomPlacements((prev) => ({
                                ...prev,
                                [v.id]: {
                                  ...prev[v.id],
                                  enabled: !isEnabled,
                                },
                              }));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: isEnabled ? '#10b981' : '#94a3b8',
                              padding: 2,
                            }}
                            title={isEnabled ? 'Hide view' : 'Show view'}
                          >
                            {isEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {layoutMode === 'single_view' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: 4 }}>
                    Select Projection View:
                  </label>
                  <select
                    value={singleViewType}
                    onChange={(e) => setSingleViewType(e.target.value as SingleViewType)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <option value="iso">3D Isometric View (Axonometric)</option>
                    <option value="front">Front Elevation (X-Z)</option>
                    <option value="top">Top Plan View (X-Y)</option>
                    <option value="right">Right Side Elevation (Y-Z)</option>
                    <option value="left">Left Side Elevation</option>
                    <option value="back">Back Elevation</option>
                    <option value="bottom">Bottom Plan View</option>
                  </select>
                </div>
              )}

              {/* Projection Standard Toggle */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: 4 }}>
                  Projection Standard:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    onClick={() => {
                      setProjection('third_angle');
                      setCustomPlacements({});
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: projection === 'third_angle' ? '2px solid #10b981' : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      backgroundColor: projection === 'third_angle' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') : 'transparent',
                      color: projection === 'third_angle' ? (isDark ? '#34d399' : '#065f46') : isDark ? '#cbd5e1' : '#475569',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    3rd Angle (ANSI)
                  </button>
                  <button
                    onClick={() => {
                      setProjection('first_angle');
                      setCustomPlacements({});
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: projection === 'first_angle' ? '2px solid #10b981' : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      backgroundColor: projection === 'first_angle' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') : 'transparent',
                      color: projection === 'first_angle' ? (isDark ? '#34d399' : '#065f46') : isDark ? '#cbd5e1' : '#475569',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    1st Angle (ISO)
                  </button>
                </div>
              </div>
            </div>

            {/* Paper Size, Overall Scale & Display Options */}
            <div
              style={{
                backgroundColor: isDark ? '#21242d' : '#ffffff',
                border: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Paper &amp; Scale
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: 4 }}>
                  Sheet Size:
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => {
                    setPaperSize(e.target.value as PaperSize);
                    setCustomPlacements({});
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    backgroundColor: isDark ? '#181a20' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  <option value="A4_LANDSCAPE">A4 Landscape (297 × 210 mm)</option>
                  <option value="A3_LANDSCAPE">A3 Landscape (420 × 297 mm)</option>
                  <option value="A4_PORTRAIT">A4 Portrait (210 × 297 mm)</option>
                  <option value="LETTER_LANDSCAPE">Letter Landscape (11 × 8.5 in)</option>
                </select>
              </div>

              {/* Overall View Scale Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', marginBottom: 2 }}>
                  <span>Overall Scale:</span>
                  <span style={{ color: '#0284c7' }}>{Math.round(overallScaleMultiplier * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="2.0"
                  step="0.05"
                  value={overallScaleMultiplier}
                  onChange={(e) => setOverallScaleMultiplier(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#0284c7' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: 2 }}>
                    Base Scale:
                  </label>
                  <select
                    value={scaleMode}
                    onChange={(e) => setScaleMode(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '5px 6px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  >
                    <option value="auto">Auto (Fit to Sheet)</option>
                    <option value="1:1">1:1 (Full Size)</option>
                    <option value="1:2">1:2 (Half Size)</option>
                    <option value="2:1">2:1 (Double Size)</option>
                    <option value="1:5">1:5 (Reduction)</option>
                    <option value="5:1">5:1 (Enlargement)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: 2 }}>
                    Shading:
                  </label>
                  <select
                    value={shadingStyle}
                    onChange={(e) => setShadingStyle(e.target.value as ShadingStyle)}
                    style={{
                      width: '100%',
                      padding: '5px 6px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  >
                    <option value="shaded">Shaded Faces</option>
                    <option value="wireframe">Pure Wireframe</option>
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: isDark ? '#cbd5e1' : '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showHiddenLines}
                    onChange={(e) => setShowHiddenLines(e.target.checked)}
                    style={{ accentColor: '#0284c7' }}
                  />
                  Show Hidden Lines (Dashed)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: isDark ? '#cbd5e1' : '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCenterlines}
                    onChange={(e) => setShowCenterlines(e.target.checked)}
                    style={{ accentColor: '#0284c7' }}
                  />
                  Show Centerlines / Axes
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: isDark ? '#cbd5e1' : '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showGridZones}
                    onChange={(e) => setShowGridZones(e.target.checked)}
                    style={{ accentColor: '#0284c7' }}
                  />
                  Show Reference Grid Zones (A-D, 1-6)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: isDark ? '#cbd5e1' : '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showProjectionSymbol}
                    onChange={(e) => setShowProjectionSymbol(e.target.checked)}
                    style={{ accentColor: '#0284c7' }}
                  />
                  Show Projection Cone Symbol
                </label>
              </div>
            </div>

            {/* Title Block Form (ISO 7200) */}
            <div
              style={{
                backgroundColor: isDark ? '#21242d' : '#ffffff',
                border: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Title Block Metadata
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                  DRAWING TITLE:
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: 4,
                    backgroundColor: isDark ? '#181a20' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    DWG NO.:
                  </label>
                  <input
                    type="text"
                    value={drawingNumber}
                    onChange={(e) => setDrawingNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    REVISION:
                  </label>
                  <input
                    type="text"
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    DRAWN BY:
                  </label>
                  <input
                    type="text"
                    value={drawnBy}
                    onChange={(e) => setDrawnBy(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    CHECKED BY:
                  </label>
                  <input
                    type="text"
                    value={checkedBy}
                    onChange={(e) => setCheckedBy(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                  COMPANY / INSTITUTION:
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: 4,
                    backgroundColor: isDark ? '#181a20' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    fontSize: 11,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    DATE:
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: 2 }}>
                    UNITS:
                  </label>
                  <select
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 6px',
                      borderRadius: 4,
                      backgroundColor: isDark ? '#181a20' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: 11,
                    }}
                  >
                    <option value="mm">mm (Millimeters)</option>
                    <option value="cm">cm (Centimeters)</option>
                    <option value="in">in (Inches)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Live Interactive Sheet Preview */}
          <div
            style={{
              flex: 1,
              backgroundColor: isDark ? '#0f1115' : '#cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              position: 'relative',
              userSelect: 'none',
            }}
          >
            {/* Preview Control Bar */}
            <div
              style={{
                height: 38,
                padding: '0 16px',
                backgroundColor: isDark ? '#181a20' : '#f1f5f9',
                borderBottom: isDark ? '1px solid #2d3139' : '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: isDark ? '#38bdf8' : '#0284c7',
                    fontWeight: 600,
                    backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : '#e0f2fe',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {PAPER_SIZES[paperSize].name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: isDark ? '#34d399' : '#059669',
                    fontWeight: 600,
                    backgroundColor: isDark ? 'rgba(52, 211, 153, 0.1)' : '#ecfdf5',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {projection === 'third_angle' ? '3rd Angle (ANSI)' : '1st Angle (ISO)'}
                </span>
                <span style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
                  ✦ Drag views directly to place them
                </span>
              </div>

              {/* Zoom Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setPreviewZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 100) / 100))}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    borderRadius: 4,
                    color: isDark ? '#cbd5e1' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: 11, minWidth: 42, textAlign: 'center', color: isDark ? '#cbd5e1' : '#475569' }}>
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  onClick={() => setPreviewZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 100) / 100))}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    borderRadius: 4,
                    color: isDark ? '#cbd5e1' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  onClick={() => setPreviewZoom(0.95)}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    borderRadius: 4,
                    color: isDark ? '#cbd5e1' : '#475569',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  title="Reset Scale"
                >
                  Fit
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas with Interactive SVG */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
              }}
              onClick={() => setSelectedViewId(null)}
            >
              <div
                style={{
                  transform: `scale(${previewZoom})`,
                  transformOrigin: 'center center',
                  transition: isDraggingRef.current ? 'none' : 'transform 0.1s ease-out',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.35), 0 2px 10px rgba(0, 0, 0, 0.2)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* SVG Technical Drawing Document with Interactive View Overlays */}
                <svg
                  ref={svgRef}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox={`0 0 ${layout.paper.width} ${layout.paper.height}`}
                  width={`${layout.paper.width}mm`}
                  height={`${layout.paper.height}mm`}
                  style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
                >
                  <defs>
                    <style>{`
                      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
                      .view-group { cursor: grab; }
                      .view-group:active { cursor: grabbing; }
                      .view-box-outline { transition: opacity 0.15s ease; }
                    `}</style>
                  </defs>

                  {/* Base drawing from generator */}
                  <g dangerouslySetInnerHTML={{ __html: svgContent.replace(/^<\?xml[\s\S]*?<svg[^>]*>|<\/svg>$/gi, '') }} />

                  {/* Interactive View Bounds, Drag Handles, and Selection Rings */}
                  {layout.views.map((v) => {
                    const isSel = selectedViewId === v.id;
                    const isHov = hoveredViewId === v.id;
                    const b = v.actualBounds;
                    const bw = Math.max(20, b.maxX - b.minX);
                    const bh = Math.max(20, b.maxY - b.minY);

                    return (
                      <g
                        key={v.id}
                        className="view-group"
                        onMouseDown={(e) => handleViewMouseDown(v.id, e)}
                        onMouseEnter={() => setHoveredViewId(v.id)}
                        onMouseLeave={() => setHoveredViewId(null)}
                        style={{ cursor: isDraggingRef.current && dragInfoRef.current?.viewId === v.id ? 'grabbing' : 'grab' }}
                      >
                        {/* Transparent Hit Area spanning the entire view */}
                        <rect
                          x={b.minX - 4}
                          y={b.minY - 4}
                          width={bw + 8}
                          height={bh + 8}
                          fill="transparent"
                          pointerEvents="all"
                        />

                        {/* Dashed Highlight / Selection Box */}
                        <rect
                          className="view-box-outline"
                          x={b.minX - 2}
                          y={b.minY - 2}
                          width={bw + 4}
                          height={bh + 4}
                          rx={1.5}
                          fill={isSel ? 'rgba(2, 132, 199, 0.06)' : isHov ? 'rgba(2, 132, 199, 0.03)' : 'none'}
                          stroke={isSel ? '#0284c7' : isHov ? '#38bdf8' : 'transparent'}
                          strokeWidth={isSel ? 0.7 : 0.4}
                          strokeDasharray={isSel ? 'none' : '3, 2'}
                          pointerEvents="none"
                        />

                        {/* Drag Handle Badge at top-left of view when hovered or selected */}
                        {(isSel || isHov) && (
                          <g transform={`translate(${b.minX - 2}, ${b.minY - 7})`}>
                            <rect
                              width={Math.min(bw + 4, 38)}
                              height={5}
                              rx={1.2}
                              fill={isSel ? '#0284c7' : '#0369a1'}
                            />
                            <text
                              x={3}
                              y={3.5}
                              fontSize={2.5}
                              fontWeight="700"
                              fill="#ffffff"
                              pointerEvents="none"
                            >
                              ✥ MOVE
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Modal Footer */}
        <div
          style={{
            height: 48,
            minHeight: 48,
            padding: '0 20px',
            backgroundColor: isDark ? '#1e2026' : '#f8fafc',
            borderTop: isDark ? '1px solid #2d3139' : '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
            Tip: Click and drag any view on the preview sheet to place it anywhere • The downloaded PDF/SVG matches your layout exactly.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                backgroundColor: 'transparent',
                border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                color: isDark ? '#cbd5e1' : '#475569',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            <button
              onClick={handleDownloadSvg}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileCode size={14} />
              Export SVG
            </button>
            <button
              onClick={handleDownloadPdf}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                backgroundColor: '#dc2626',
                border: 'none',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Download size={14} />
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
