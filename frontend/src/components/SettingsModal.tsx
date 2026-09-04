import React from 'react';
import { X, Keyboard, Sliders } from 'lucide-react';
import { GridSettings } from '../types/drawing';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridSettings: GridSettings;
  onUpdateGridSettings: (settings: Partial<GridSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  gridSettings,
  onUpdateGridSettings,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'L', description: 'Line Tool (Click to start, click to end, continuous)' },
    { key: 'V', description: 'Select Tool (Click line to inspect/delete)' },
    { key: 'E', description: 'Eraser Tool (Click line to remove)' },
    { key: 'H / Space + Drag', description: 'Pan canvas workspace' },
    { key: 'Escape', description: 'Cancel active line drafting' },
    { key: 'Delete / Backspace', description: 'Delete selected geometry' },
    { key: 'Ctrl / Cmd + Z', description: 'Undo last drawing action' },
    { key: 'Ctrl / Cmd + Shift + Z', description: 'Redo previously undone action' },
    { key: 'Mouse Wheel', description: 'Zoom centered on cursor' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          backgroundColor: '#ffffff',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color="#111827" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
              Drafting Studio Settings & Shortcuts
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Settings */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Drafting Grid Preferences
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4b5563' }}>Grid Unit Spacing (Pixels)</span>
                <input
                  type="range"
                  min="20"
                  max="40"
                  value={gridSettings.unitSize}
                  onChange={(e) =>
                    onUpdateGridSettings({ unitSize: parseInt(e.target.value, 10) })
                  }
                  style={{ width: 140, accentColor: '#111827' }}
                />
                <span style={{ fontFamily: 'monospace', width: 30, textAlign: 'right' }}>
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
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Keyboard size={13} />
              <span>Keyboard Shortcuts</span>
            </div>

            <div
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {shortcuts.map((sc, i) => (
                <div
                  key={sc.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    fontSize: 11,
                    borderBottom: i < shortcuts.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <span style={{ color: '#4b5563' }}>{sc.description}</span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      padding: '1px 5px',
                      borderRadius: 3,
                      color: '#111827',
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
            padding: '10px 16px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#fafafa',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '5px 14px',
              backgroundColor: '#111827',
              color: '#ffffff',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
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
