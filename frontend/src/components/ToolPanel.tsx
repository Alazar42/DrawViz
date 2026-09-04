import React from 'react';
import { ToolType, GridSettings, AppMode } from '../types/drawing';
import {
  PenLine,
  Eraser,
  MousePointer,
  Hand,
  ZoomIn,
  BookOpen,
  Trophy,
  Activity,
  Layers,
  Magnet,
  Grid,
} from 'lucide-react';

interface ToolPanelProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  gridSettings: GridSettings;
  onUpdateGridSettings: (settings: Partial<GridSettings>) => void;
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({
  activeTool,
  onSelectTool,
  gridSettings,
  onUpdateGridSettings,
  appMode,
  onSetAppMode,
}) => {
  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'line', label: 'Line', icon: <PenLine size={16} />, shortcut: 'L' },
    { id: 'eraser', label: 'Erase', icon: <Eraser size={16} />, shortcut: 'E' },
    { id: 'select', label: 'Select', icon: <MousePointer size={16} />, shortcut: 'V' },
    { id: 'pan', label: 'Pan', icon: <Hand size={16} />, shortcut: 'H / Space' },
    { id: 'zoom', label: 'Zoom', icon: <ZoomIn size={16} />, shortcut: 'Z' },
  ];

  return (
    <aside
      style={{
        width: 140,
        minWidth: 140,
        maxWidth: 140,
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '12px 8px',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* TOOLS Section */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#9ca3af',
              letterSpacing: '0.06em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
            }}
          >
            Tools
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tools.map((t) => {
              const isActive = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTool(t.id)}
                  title={`${t.label} (${t.shortcut})`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: isActive ? '1px solid #d1d5db' : '1px solid transparent',
                    backgroundColor: isActive ? '#f3f4f6' : 'transparent',
                    color: isActive ? '#111827' : '#4b5563',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="tool-btn"
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SNAP Section */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#9ca3af',
              letterSpacing: '0.06em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Magnet size={11} />
            <span>Snap</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              <span>Grid Snap</span>
              <input
                type="checkbox"
                checked={gridSettings.snapToGrid}
                onChange={(e) => onUpdateGridSettings({ snapToGrid: e.target.checked })}
                style={{ cursor: 'pointer', accentColor: '#111827' }}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              <span>Isometric Snap</span>
              <input
                type="checkbox"
                checked={gridSettings.snapToIsometric}
                onChange={(e) => onUpdateGridSettings({ snapToIsometric: e.target.checked })}
                style={{ cursor: 'pointer', accentColor: '#111827' }}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              <span>Endpoints</span>
              <input
                type="checkbox"
                checked={gridSettings.snapToEndpoints}
                onChange={(e) => onUpdateGridSettings({ snapToEndpoints: e.target.checked })}
                style={{ cursor: 'pointer', accentColor: '#111827' }}
              />
            </label>
          </div>
        </div>

        {/* GRID Section */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#9ca3af',
              letterSpacing: '0.06em',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Grid size={11} />
            <span>Grid</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Size</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  padding: '1px 5px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                }}
              >
                1 × 1
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                padding: '2px 4px',
              }}
            >
              <span>Type</span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  color: '#111827',
                }}
              >
                Isometric
              </span>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#374151',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              <span>Show Grid</span>
              <input
                type="checkbox"
                checked={gridSettings.showGrid}
                onChange={(e) => onUpdateGridSettings({ showGrid: e.target.checked })}
                style={{ cursor: 'pointer', accentColor: '#111827' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Mode navigation icons at bottom */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 10,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => onSetAppMode('practice')}
          title="Practice Studio"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 4,
            color: appMode === 'practice' ? '#111827' : '#9ca3af',
            backgroundColor: appMode === 'practice' ? '#f3f4f6' : 'transparent',
          }}
        >
          <Activity size={16} />
        </button>
        <button
          onClick={() => onSetAppMode('lessons')}
          title="Lessons Curriculum"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 4,
            color: appMode === 'lessons' ? '#111827' : '#9ca3af',
            backgroundColor: appMode === 'lessons' ? '#f3f4f6' : 'transparent',
          }}
        >
          <BookOpen size={16} />
        </button>
        <button
          onClick={() => onSetAppMode('challenges')}
          title="Geometric Challenges"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 4,
            color: appMode === 'challenges' ? '#111827' : '#9ca3af',
            backgroundColor: appMode === 'challenges' ? '#f3f4f6' : 'transparent',
          }}
        >
          <Trophy size={16} />
        </button>
      </div>
    </aside>
  );
};
