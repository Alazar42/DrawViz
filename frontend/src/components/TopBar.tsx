import React from 'react';
import { AppMode } from '../types/drawing';
import {
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  FilePlus,
  Settings,
  ChevronDown,
  Download,
} from 'lucide-react';

interface TopBarProps {
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExportSvg: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  appMode,
  onSetAppMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNew,
  onOpen,
  onSave,
  onExportSvg,
  onOpenSettings,
}) => {
  const modeLabels: Record<AppMode, string> = {
    practice: 'Practice Mode',
    lessons: 'Lessons',
    challenges: 'Challenges',
  };

  return (
    <header
      style={{
        height: 44,
        minHeight: 44,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        userSelect: 'none',
        zIndex: 20,
      }}
    >
      {/* Left: Branding & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#111827',
          }}
        >
          DrawViz
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#6b7280',
            fontWeight: 400,
            paddingLeft: 6,
            borderLeft: '1px solid #e5e7eb',
          }}
        >
          Interactive Technical Drawing Studio
        </span>
      </div>

      {/* Center: Mode Dropdown */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#1f2937',
          }}
        >
          <select
            value={appMode}
            onChange={(e) => onSetAppMode(e.target.value as AppMode)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              fontWeight: 500,
              color: '#1f2937',
              cursor: 'pointer',
              paddingRight: 4,
            }}
          >
            <option value="practice">Practice Mode</option>
            <option value="lessons">Lessons Mode</option>
            <option value="challenges">Challenges Mode</option>
          </select>
          <ChevronDown size={13} color="#6b7280" />
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="top-btn"
          style={{ opacity: canUndo ? 1 : 0.4 }}
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="top-btn"
          style={{ opacity: canRedo ? 1 : 0.4 }}
        >
          <Redo2 size={15} />
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: '#e5e7eb', margin: '0 4px' }} />

        <button onClick={onNew} title="New Drawing" className="top-btn">
          <FilePlus size={15} />
        </button>
        <button onClick={onOpen} title="Open Project (.drawviz)" className="top-btn">
          <FolderOpen size={15} />
        </button>
        <button onClick={onSave} title="Save Project (.drawviz)" className="top-btn">
          <Save size={15} />
        </button>
        <button onClick={onExportSvg} title="Export SVG" className="top-btn">
          <Download size={15} />
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: '#e5e7eb', margin: '0 4px' }} />

        <button onClick={onOpenSettings} title="Settings & Shortcuts" className="top-btn">
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
