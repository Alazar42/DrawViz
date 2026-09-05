import React, { useState } from 'react';
import { ToolType, GridSettings, AppMode, AppTheme } from '../types/drawing';
import { IsoplaneType } from '../geometry/isometric';
import {
  PenLine,
  Circle,
  Disc,
  Cylinder,
  Eraser,
  MousePointer,
  Hand,
  ZoomIn,
  Boxes,
  Box,
  Globe,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface ToolPanelProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  gridSettings: GridSettings;
  onUpdateGridSettings: (settings: Partial<GridSettings>) => void;
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
  activeElevation: number;
  onSetElevation: (elevation: number) => void;
  activeIsoplane: IsoplaneType;
  onSetIsoplane: (isoplane: IsoplaneType) => void;
  theme?: AppTheme;
  onAddPrimitive?: (primitive: 'cube' | 'cylinder' | 'sphere') => void;
}

// Monochromatic iOS-style toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  isDark?: boolean;
}> = ({ checked, onChange, isDark }) => {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{
        width: 32,
        height: 18,
        backgroundColor: checked
          ? (isDark ? '#f4f4f5' : '#18181b')
          : (isDark ? '#3f3f46' : '#e5e7eb'),
        borderRadius: 9,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: checked
            ? (isDark ? '#18181b' : '#ffffff')
            : (isDark ? '#a1a1aa' : '#ffffff'),
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          transition: 'left 0.15s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </div>
  );
};

export const ToolPanel: React.FC<ToolPanelProps> = ({
  activeTool,
  onSelectTool,
  gridSettings,
  onUpdateGridSettings,
  theme = 'light',
  onAddPrimitive,
}) => {
  const isDark = theme === 'dark';
  const [isMeshAccordionOpen, setIsMeshAccordionOpen] = useState<boolean>(true);

  // Top drawing tools (before Add Mesh)
  const topTools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'line', label: 'Line', icon: <PenLine size={16} />, shortcut: 'L' },
    { id: 'circle', label: 'Circle', icon: <Circle size={16} />, shortcut: 'C' },
    { id: 'arc', label: 'Half Arc', icon: <Disc size={16} />, shortcut: 'A' },
    { id: 'cylinder', label: 'Cylinder', icon: <Cylinder size={16} />, shortcut: 'Y' },
  ];

  // Bottom utility tools (after Add Mesh)
  const bottomTools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'eraser', label: 'Eraser', icon: <Eraser size={16} />, shortcut: 'X' },
    { id: 'select', label: 'Select', icon: <MousePointer size={16} />, shortcut: 'V' },
    { id: 'pan', label: 'Pan', icon: <Hand size={16} />, shortcut: 'H / Space' },
    { id: 'zoom', label: 'Zoom', icon: <ZoomIn size={16} />, shortcut: 'Z' },
  ];

  const renderToolButton = (t: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }) => {
    const isActive = activeTool === t.id;
    return (
      <button
        key={t.id}
        onClick={() => onSelectTool(t.id)}
        title={`${t.label} (${t.shortcut})`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '6px 10px',
          borderRadius: 6,
          border: isActive
            ? (isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb')
            : '1px solid transparent',
          backgroundColor: isActive
            ? (isDark ? '#27272a' : '#f3f4f6')
            : 'transparent',
          color: isActive
            ? (isDark ? '#f4f4f5' : '#111827')
            : (isDark ? '#a1a1aa' : '#4b5563'),
          fontSize: 12,
          fontWeight: isActive ? 600 : 400,
          cursor: 'pointer',
          transition: 'all 0.1s ease',
          textAlign: 'left',
          width: '100%',
        }}
        className="tool-btn"
      >
        {t.icon}
        <span>{t.label}</span>
      </button>
    );
  };

  return (
    <aside
      style={{
        width: 175,
        minWidth: 175,
        maxWidth: 175,
        backgroundColor: isDark ? '#18181b' : '#ffffff',
        borderRight: isDark ? '1px solid #27272a' : '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 10px',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ============================================================ */}
        {/* 1. TOOLS Section                                             */}
        {/* ============================================================ */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: isDark ? '#a1a1aa' : '#9ca3af',
              letterSpacing: '0.08em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
            }}
          >
            TOOLS
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {topTools.map(renderToolButton)}

            {/* Add Mesh Accordion Item */}
            <div>
              <button
                onClick={() => setIsMeshAccordionOpen((prev) => !prev)}
                title="Add 3D Primitives (Cube, Cylinder, Sphere)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid transparent',
                  backgroundColor: 'transparent',
                  color: isDark ? '#a1a1aa' : '#4b5563',
                  fontSize: 12,
                  fontWeight: 400,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.1s ease',
                }}
                className="tool-btn"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Boxes size={16} />
                  <span>Add Mesh</span>
                </div>
                {isMeshAccordionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {/* Nested Mesh Primitives Card */}
              {isMeshAccordionOpen && (
                <div
                  style={{
                    marginTop: 3,
                    marginBottom: 4,
                    marginLeft: 6,
                    padding: '4px',
                    borderRadius: 6,
                    border: isDark ? '1px solid #27272a' : '1px solid #f3f4f6',
                    backgroundColor: isDark ? '#202024' : '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <button
                    onClick={() => onAddPrimitive?.('cube')}
                    title="Add 3D Cube Mesh"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isDark ? '#d4d4d8' : '#374151',
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    className="tool-btn"
                  >
                    <Box size={14} />
                    <span>Cube</span>
                  </button>

                  <button
                    onClick={() => onAddPrimitive?.('cylinder')}
                    title="Add 3D Cylinder Mesh"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isDark ? '#d4d4d8' : '#374151',
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    className="tool-btn"
                  >
                    <Cylinder size={14} />
                    <span>Cylinder</span>
                  </button>

                  <button
                    onClick={() => onAddPrimitive?.('sphere')}
                    title="Add 3D Sphere Mesh"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isDark ? '#d4d4d8' : '#374151',
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    className="tool-btn"
                  >
                    <Globe size={14} />
                    <span>Sphere</span>
                  </button>
                </div>
              )}
            </div>

            {bottomTools.map(renderToolButton)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. SNAP Section                                              */}
        {/* ============================================================ */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: isDark ? '#a1a1aa' : '#9ca3af',
              letterSpacing: '0.08em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
            }}
          >
            SNAP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: isDark ? '#d4d4d8' : '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Grid Snap</span>
              <ToggleSwitch
                checked={gridSettings.snapToGrid}
                onChange={(checked) => onUpdateGridSettings({ snapToGrid: checked })}
                isDark={isDark}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: isDark ? '#d4d4d8' : '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Isometric Snap</span>
              <ToggleSwitch
                checked={gridSettings.snapToIsometric}
                onChange={(checked) => onUpdateGridSettings({ snapToIsometric: checked })}
                isDark={isDark}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: isDark ? '#d4d4d8' : '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Endpoints</span>
              <ToggleSwitch
                checked={gridSettings.snapToEndpoints}
                onChange={(checked) => onUpdateGridSettings({ snapToEndpoints: checked })}
                isDark={isDark}
              />
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. GRID Section                                              */}
        {/* ============================================================ */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: isDark ? '#a1a1aa' : '#9ca3af',
              letterSpacing: '0.08em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
            }}
          >
            GRID
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: isDark ? '#d4d4d8' : '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Size</span>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <select
                  value={gridSettings.unitSize}
                  onChange={(e) => onUpdateGridSettings({ unitSize: Number(e.target.value) })}
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    padding: '2px 18px 2px 6px',
                    backgroundColor: isDark ? '#27272a' : '#f9fafb',
                    borderRadius: 4,
                    border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
                    color: isDark ? '#f4f4f5' : '#111827',
                    cursor: 'pointer',
                    outline: 'none',
                    appearance: 'none',
                  }}
                >
                  <option value={1} style={{ backgroundColor: isDark ? '#18181b' : '#ffffff' }}>1 × 1</option>
                  <option value={2} style={{ backgroundColor: isDark ? '#18181b' : '#ffffff' }}>2 × 2</option>
                  <option value={5} style={{ backgroundColor: isDark ? '#18181b' : '#ffffff' }}>5 × 5</option>
                  <option value={10} style={{ backgroundColor: isDark ? '#18181b' : '#ffffff' }}>10 × 10</option>
                </select>
                <ChevronDown
                  size={11}
                  color={isDark ? '#a1a1aa' : '#6b7280'}
                  style={{ position: 'absolute', right: 4, pointerEvents: 'none' }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: isDark ? '#d4d4d8' : '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Show Grid</span>
              <ToggleSwitch
                checked={gridSettings.showGrid}
                onChange={(checked) => onUpdateGridSettings({ showGrid: checked })}
                isDark={isDark}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
