import React from 'react';
import { X, Keyboard, Sliders, Sun, Moon, Compass, Mouse } from 'lucide-react';
import { GridSettings, AppTheme } from '../types/drawing';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridSettings: GridSettings;
  onUpdateGridSettings: (settings: Partial<GridSettings>) => void;
  theme?: AppTheme;
  onSetTheme?: (theme: AppTheme) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  gridSettings,
  onUpdateGridSettings,
  theme = 'light',
  onSetTheme,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const viewportControls = [
    { action: 'Rotate / Orbit 3D View', input: 'Right-Click Drag' },
    { action: 'Pan 3D Workspace', input: 'Middle Drag / Shift + Right Drag' },
    { action: 'Zoom Viewport', input: 'Mouse Wheel' },
    { action: 'Cancel Active Drafting', input: 'Right-Click Tap / Escape' },
    { action: 'Camera Preset Views (Front, Side, Top)', input: 'Numpad 1 / 3 / 7' },
    { action: 'Toggle Ortho / Perspective', input: 'Numpad 5' },
    { action: 'Frame All Geometry', input: 'F / Home' },
    { action: 'Toggle Magnet Snapping', input: 'Shift + Tab' },
    { action: 'Invert Snap Detection', input: 'Hold Ctrl' },
    { action: 'Elevate Drafting Grid Z (- / +)', input: 'Q / E' },
    { action: 'Align Drafting Plane', input: 'Z / Y / X / V / N' },
    { action: 'Toggle Adjust Last Operation', input: 'F9' },
  ];

  const drawingShortcuts = [
    { key: 'V', description: 'Select Tool (inspect / modify entity)' },
    { key: 'L', description: 'Line Tool (3D continuous lines)' },
    { key: 'C', description: 'Circle Tool (3D planar circles)' },
    { key: 'A', description: 'Arc Tool (2-vertex parametric arcs)' },
    { key: 'Y', description: 'Cylinder Tool (3D cylindrical primitives)' },
    { key: 'X', description: 'Eraser Tool (click entity to remove)' },
    { key: 'H / Space', description: 'Pan Viewport tool' },
    { key: 'Z', description: 'Zoom Viewport tool' },
    { key: '1 / 2 / 3', description: 'Blender Selection Mode: Vertex, Edge, Face' },
    { key: 'E', description: 'Extrude selected Circle to 3D Cylinder' },
    { key: 'Delete / Backspace', description: 'Delete selected entity' },
    { key: 'Ctrl / Cmd + Z', description: 'Undo last drawing action' },
    { key: 'Ctrl / Cmd + Shift + Z', description: 'Redo previously undone action' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxHeight: '88vh',
          backgroundColor: isDark ? '#1e2026' : '#ffffff',
          borderRadius: 8,
          border: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDark ? '#181a20' : '#f9fafb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color={isDark ? '#38bdf8' : '#111827'} />
            <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#f8fafc' : '#111827' }}>
              Drafting Studio Settings & Controls
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#6b7280',
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div
          style={{
            padding: 18,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Theme Settings */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#374151',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Interface Theme
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => onSetTheme?.('light')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: theme === 'light' ? '2px solid #4f46e5' : (isDark ? '1px solid #334155' : '1px solid #e5e7eb'),
                  backgroundColor: theme === 'light' ? '#eff6ff' : (isDark ? '#22262e' : '#ffffff'),
                  color: isDark ? '#f1f5f9' : '#1e293b',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                <Sun size={16} color="#f59e0b" />
                <span>Light (Studio)</span>
              </button>
              <button
                onClick={() => onSetTheme?.('dark')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: theme === 'dark' ? '2px solid #38bdf8' : (isDark ? '1px solid #334155' : '1px solid #cbd5e1'),
                  backgroundColor: theme === 'dark' ? '#1e293b' : (isDark ? '#22262e' : '#f8fafc'),
                  color: isDark ? '#f8fafc' : '#1e293b',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                <Moon size={16} color="#38bdf8" />
                <span>Dark (Blender)</span>
              </button>
            </div>
          </div>

          {/* 3D Viewport Controls Reference */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#374151',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Compass size={13} color={isDark ? '#38bdf8' : '#4f46e5'} />
              <span>3D Viewport Navigation & Controls</span>
            </div>

            <div
              style={{
                backgroundColor: isDark ? '#181a20' : '#f9fafb',
                border: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {viewportControls.map((c, i) => (
                <div
                  key={c.action}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 12px',
                    fontSize: 11,
                    borderBottom: i < viewportControls.length - 1 ? (isDark ? '1px solid #22262e' : '1px solid #f3f4f6') : 'none',
                  }}
                >
                  <span style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}>{c.action}</span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      backgroundColor: isDark ? '#22262e' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                      padding: '2px 7px',
                      borderRadius: 4,
                      color: isDark ? '#38bdf8' : '#111827',
                      fontSize: 10,
                    }}
                  >
                    {c.input}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid Preferences */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#374151',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Drafting Grid Preferences
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                backgroundColor: isDark ? '#181a20' : '#f9fafb',
                border: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}>Grid Unit Spacing (Pixels)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  min="20"
                  max="40"
                  value={gridSettings.unitSize}
                  onChange={(e) =>
                    onUpdateGridSettings({ unitSize: parseInt(e.target.value, 10) })
                  }
                  style={{ width: 140, accentColor: '#38bdf8' }}
                />
                <span style={{ fontFamily: 'monospace', width: 34, textAlign: 'right', fontWeight: 600, color: isDark ? '#f8fafc' : '#111827' }}>
                  {gridSettings.unitSize}px
                </span>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Cheatsheet */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#374151',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Keyboard size={13} color={isDark ? '#38bdf8' : '#4f46e5'} />
              <span>Tools & Drafting Shortcuts</span>
            </div>

            <div
              style={{
                backgroundColor: isDark ? '#181a20' : '#f9fafb',
                border: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {drawingShortcuts.map((sc, i) => (
                <div
                  key={sc.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 12px',
                    fontSize: 11,
                    borderBottom: i < drawingShortcuts.length - 1 ? (isDark ? '1px solid #22262e' : '1px solid #f3f4f6') : 'none',
                  }}
                >
                  <span style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}>{sc.description}</span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      backgroundColor: isDark ? '#22262e' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                      padding: '1px 6px',
                      borderRadius: 3,
                      color: isDark ? '#f8fafc' : '#111827',
                    }}
                  >
                    {sc.key}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: isDark ? '#181a20' : '#fafafa',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              backgroundColor: '#3584e4',
              color: '#ffffff',
              border: 'none',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
