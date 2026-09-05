import React from 'react';
import { AppMode, AppTheme } from '../types/drawing';
import {
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  FilePlus,
  Settings,
  ChevronDown,
  Download,
  Sun,
  Moon,
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
  onExportSvg?: () => void;
  onExport?: () => void;
  onOpenSettings: () => void;
  theme?: AppTheme;
  onToggleTheme?: () => void;
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
  onExport,
  onOpenSettings,
  theme = 'light',
  onToggleTheme,
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      style={{
        height: 44,
        minHeight: 44,
        backgroundColor: isDark ? '#1e2026' : '#ffffff',
        borderBottom: isDark ? '1px solid #2d3139' : '1px solid #e5e7eb',
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
            color: isDark ? '#f8fafc' : '#111827',
          }}
        >
          DrawViz
        </span>
        <span
          style={{
            fontSize: 11,
            color: isDark ? '#94a3b8' : '#6b7280',
            fontWeight: 400,
            paddingLeft: 6,
            borderLeft: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
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
            border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
            backgroundColor: isDark ? '#282c34' : '#f9fafb',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: isDark ? '#f1f5f9' : '#1f2937',
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
              color: isDark ? '#f1f5f9' : '#1f2937',
              cursor: 'pointer',
              paddingRight: 4,
            }}
          >
            <option value="practice" style={{ backgroundColor: isDark ? '#1e2026' : '#ffffff', color: isDark ? '#f1f5f9' : '#1f2937' }}>
              Practice Mode
            </option>
            <option value="lessons" style={{ backgroundColor: isDark ? '#1e2026' : '#ffffff', color: isDark ? '#f1f5f9' : '#1f2937' }}>
              Lessons Mode
            </option>
            <option value="challenges" style={{ backgroundColor: isDark ? '#1e2026' : '#ffffff', color: isDark ? '#f1f5f9' : '#1f2937' }}>
              Challenges Mode
            </option>
          </select>
          <ChevronDown size={13} color={isDark ? '#94a3b8' : '#6b7280'} />
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="top-btn"
          style={{
            opacity: canUndo ? 1 : 0.4,
            color: isDark ? '#cbd5e1' : '#4b5563',
          }}
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="top-btn"
          style={{
            opacity: canRedo ? 1 : 0.4,
            color: isDark ? '#cbd5e1' : '#4b5563',
          }}
        >
          <Redo2 size={15} />
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: isDark ? '#334155' : '#e5e7eb', margin: '0 4px' }} />

        <button
          onClick={onNew}
          title="New Drawing"
          className="top-btn"
          style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}
        >
          <FilePlus size={15} />
        </button>
        <button
          onClick={onOpen}
          title="Open Project (.drawviz)"
          className="top-btn"
          style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}
        >
          <FolderOpen size={15} />
        </button>
        <button
          onClick={onSave}
          title="Save Project (.drawviz)"
          className="top-btn"
          style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}
        >
          <Save size={15} />
        </button>
        <button
          onClick={onExport || onExportSvg}
          title="Export Technical Drawing (PDF / SVG) (Ctrl+E)"
          className="top-btn"
          style={{
            color: isDark ? '#38bdf8' : '#0284c7',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 4,
            border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(2, 132, 199, 0.3)',
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)',
          }}
        >
          <Download size={14} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Export</span>
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: isDark ? '#334155' : '#e5e7eb', margin: '0 4px' }} />

        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={`Toggle Theme (Current: ${isDark ? 'Dark' : 'Light'})`}
            className="top-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#282c34' : '#f1f5f9',
              border: isDark ? '1px solid #3d4452' : '1px solid #e2e8f0',
              borderRadius: 5,
              padding: '4px 6px',
              cursor: 'pointer',
            }}
          >
            {isDark ? <Moon size={14} color="#38bdf8" /> : <Sun size={14} color="#f59e0b" />}
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Settings & Shortcuts"
          className="top-btn"
          style={{ color: isDark ? '#cbd5e1' : '#4b5563' }}
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
