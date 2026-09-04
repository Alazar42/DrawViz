import React, { useState, useEffect, useCallback } from 'react';
import { useDrawingState } from './state/drawingState';
import { TopBar } from './components/TopBar';
import { ToolPanel } from './components/ToolPanel';
import { PropertyPanel } from './components/PropertyPanel';
import { LayersPanel } from './components/LayersPanel';
import { InstructionsPanel } from './components/InstructionsPanel';
import { OrthoPanel } from './components/OrthoPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { IsometricCanvas } from './canvas/IsometricCanvas';
import { Three3DCanvas } from './canvas/Three3DCanvas';
import { AxisIndicator } from './canvas/AxisIndicator';
import { OrientationGizmo } from './canvas/OrientationGizmo';
import { DrawVizProject } from './types/drawing';

export const App: React.FC = () => {
  const state = useDrawingState();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready');

  // Sync active lesson when appMode changes
  useEffect(() => {
    if (state.appMode === 'challenges') {
      state.setActiveLessonId('challenge-1');
    } else if (state.appMode === 'lessons') {
      state.setActiveLessonId('lesson-1');
    }
  }, [state.appMode]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          state.redo();
          setStatusMessage('Redo action');
        } else {
          state.undo();
          setStatusMessage('Undo action');
        }
        return;
      }

      if (modKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'l':
          state.setActiveTool('line');
          setStatusMessage('Tool: Line');
          break;
        case 'c':
          state.setActiveTool('circle');
          setStatusMessage('Tool: Circle / Isocircle');
          break;
        case 'e':
          state.setActiveTool('eraser');
          setStatusMessage('Tool: Eraser');
          break;
        case 'v':
          state.setActiveTool('select');
          setStatusMessage('Tool: Select');
          break;
        case 'h':
          state.setActiveTool('pan');
          setStatusMessage('Tool: Pan');
          break;
        case 'z':
          if (!modKey) {
            state.setActiveTool('zoom');
            setStatusMessage('Tool: Zoom');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.undo, state.redo, state.setActiveTool]);

  // Zoom Helpers
  const handleZoomIn = () => {
    state.setViewport({ zoom: Math.min(4.0, Math.round((state.viewport.zoom + 0.15) * 100) / 100) });
  };

  const handleZoomOut = () => {
    state.setViewport({ zoom: Math.max(0.2, Math.round((state.viewport.zoom - 0.15) * 100) / 100) });
  };

  const handleZoomReset = () => {
    state.setViewport({ zoom: 1.0 });
  };

  // File Operations (Wails Native + Web Fallback)
  const handleSaveProject = async () => {
    const project: DrawVizProject = {
      version: '1.0.0',
      metadata: {
        name: 'Technical Drawing',
        author: 'Student',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        mode: state.appMode,
      },
      gridSettings: state.gridSettings,
      layers: state.layers,
      lines: state.lines,
      arcs: state.arcs,
      activeLessonId: state.activeLessonId,
    };

    const wailsGo = (window as any).go?.main?.App;
    if (wailsGo && wailsGo.SaveFileDialog && wailsGo.SaveProject) {
      try {
        const filePath = await wailsGo.SaveFileDialog('drawing.drawviz');
        if (filePath) {
          await wailsGo.SaveProject(filePath, project);
          setStatusMessage(`Saved to ${filePath}`);
          return;
        }
      } catch (err) {
        console.error('Save error via Wails:', err);
      }
    }

    // Fallback: browser download
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.drawviz';
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Project exported as drawing.drawviz');
  };

  const handleOpenProject = async () => {
    const wailsGo = (window as any).go?.main?.App;
    if (wailsGo && wailsGo.OpenFileDialog && wailsGo.LoadProject) {
      try {
        const filePath = await wailsGo.OpenFileDialog();
        if (filePath) {
          const project: DrawVizProject = await wailsGo.LoadProject(filePath);
          if (project && (project.lines || project.arcs)) {
            state.setLinesState(project.lines || []);
            state.setArcs(project.arcs || []);
            if (project.layers) state.layers.splice(0, state.layers.length, ...project.layers);
            if (project.gridSettings) state.setGridSettings(project.gridSettings);
            setStatusMessage(`Loaded ${filePath}`);
            return;
          }
        }
      } catch (err) {
        console.error('Open error via Wails:', err);
      }
    }

    // Fallback: browser file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.drawviz,.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const project = JSON.parse(evt.target?.result as string) as DrawVizProject;
          if (project && (project.lines || project.arcs)) {
            state.setLinesState(project.lines || []);
            state.setArcs(project.arcs || []);
            if (project.layers) state.layers.splice(0, state.layers.length, ...project.layers);
            if (project.gridSettings) state.setGridSettings(project.gridSettings);
            setStatusMessage(`Loaded ${file.name}`);
          }
        } catch (parseErr) {
          alert('Failed to parse .drawviz file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportSvg = () => {
    // Generate clean technical SVG
    const svgLines = state.lines
      .map((l) => {
        const x1 = l.start.x * 20;
        const y1 = l.start.y * 20;
        const x2 = l.end.x * 20;
        const y2 = l.end.y * 20;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111827" stroke-width="1.75" />`;
      })
      .join('\n  ');

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000" width="1000" height="1000">
  <rect width="100%" height="100%" fill="#ffffff" />
  ${svgLines}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'technical-drawing.svg';
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported technical-drawing.svg');
  };

  const handleNewDrawing = () => {
    if (window.confirm('Create a new drawing? Unsaved changes will be cleared.')) {
      state.resetCanvas();
      setStatusMessage('New canvas ready');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#f9fafb',
      }}
    >
      {/* 1. Top Bar */}
      <TopBar
        appMode={state.appMode}
        onSetAppMode={state.setAppMode}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={state.undo}
        onRedo={state.redo}
        onNew={handleNewDrawing}
        onOpen={handleOpenProject}
        onSave={handleSaveProject}
        onExportSvg={handleExportSvg}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Main Middle Workspace: ToolPanel + Canvas/Ortho + PropertyPanel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Left Narrow Tool Panel */}
        <ToolPanel
          activeTool={state.activeTool}
          onSelectTool={state.setActiveTool}
          gridSettings={state.gridSettings}
          onUpdateGridSettings={state.setGridSettings}
          appMode={state.appMode}
          onSetAppMode={state.setAppMode}
          activeElevation={state.activeElevation}
          onSetElevation={(elev) => {
            state.setActiveElevation(elev);
            setStatusMessage(`Active Elevation set to Z = ${elev >= 0 ? `+${elev}` : elev}`);
          }}
          activeIsoplane={state.activeIsoplane}
          onSetIsoplane={(iso) => {
            state.setActiveIsoplane(iso);
            setStatusMessage(`Switched to ${iso.toUpperCase()} Isoplane`);
          }}
        />

        {/* Center Drawing Canvas & Collapsible Bottom Orthographic Panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minWidth: 0,
          }}
        >
          {/* Main 3D Canvas */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <Three3DCanvas
              lines={state.lines}
              arcs={state.arcs}
              activeLayerId={state.activeLayerId}
              selectedLineId={state.selectedLineId}
              selectedArcId={state.selectedArcId}
              activeTool={state.activeTool}
              gridSettings={state.gridSettings}
              activeAnchor={state.activeAnchor}
              activeElevation={state.activeElevation}
              activeIsoplane={state.activeIsoplane}
              selectionMode={state.selectionMode}
              selectedVertex={state.selectedVertex}
              selectedFace={state.selectedFace}
              onSetSelectionMode={(mode) => {
                state.setSelectionMode(mode);
                setStatusMessage(`Selection Mode: ${mode.toUpperCase()}`);
              }}
              onSelectVertex={(v) => {
                state.setSelectedVertex(v);
                if (v) setStatusMessage(`Selected Vertex (${v.x}, ${v.y}, ${v.z || 0})`);
              }}
              onSelectFace={(f) => {
                state.setSelectedFace(f);
                if (f) setStatusMessage(`Selected ${f.plane.toUpperCase()} Face at Elev ${f.elevation}`);
              }}
              onSelectLine={(id) => {
                state.setSelectedLineId(id);
                if (id) {
                  state.setSelectedArcId(null);
                  setStatusMessage(`Selected Line ${id}`);
                }
              }}
              onSelectArc={(id) => {
                state.setSelectedArcId(id);
                if (id) {
                  state.setSelectedLineId(null);
                  setStatusMessage(`Selected Circle ${id}`);
                }
              }}
              onAddLine={(line) => {
                state.addLine(line);
                setStatusMessage(`3D Line created (${state.lines.length + 1} total)`);
              }}
              onAddArc={(arc) => {
                state.addArc(arc);
                setStatusMessage(`3D Circle created [${arc.plane.toUpperCase()}] R: ${arc.radius}`);
              }}
              onRemoveLine={(id) => {
                state.removeLine(id);
                setStatusMessage('Line removed');
              }}
              onRemoveArc={(id) => {
                state.removeArc(id);
                setStatusMessage('Circle removed');
              }}
              onSetAnchor={state.setActiveAnchor}
              onSetElevation={(elev) => {
                state.setActiveElevation(elev);
                setStatusMessage(`Active Elevation set to Z = ${elev >= 0 ? `+${elev}` : elev}`);
              }}
              onSetIsoplane={(iso) => {
                state.setActiveIsoplane(iso);
                setStatusMessage(`Switched to ${iso.toUpperCase()} Isoplane`);
              }}
            />
          </div>

          {/* Bottom Collapsible Orthographic Multi-Views (WebGL Cameras) */}
          <OrthoPanel
            lines={state.lines}
            arcs={state.arcs}
            isOpen={state.showOrthoPanel}
            onToggle={() => state.setShowOrthoPanel(!state.showOrthoPanel)}
            selectedLineId={state.selectedLineId || state.selectedArcId}
            onSelectLine={(id) => {
              state.setSelectedLineId(id);
              state.setSelectedArcId(id);
              if (id) {
                setStatusMessage(`Selected entity from camera projection`);
              }
            }}
          />
        </div>

        {/* Right Property, Layer & Instructions Panel */}
        <aside
          style={{
            width: 220,
            minWidth: 220,
            maxWidth: 220,
            backgroundColor: '#ffffff',
            borderLeft: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: 12,
            overflowY: 'auto',
            userSelect: 'none',
          }}
        >
          <PropertyPanel
            selectedLine={state.selectedLine}
            selectedArc={state.selectedArc}
            selectedVertex={state.selectedVertex}
            selectedFace={state.selectedFace}
            totalLines={state.lines.length}
            totalArcs={state.arcs.length}
            layers={state.layers}
            unitSize={state.gridSettings.unitSize}
            zoom={state.viewport.zoom}
            activeTool={state.activeTool}
            onDeleteLine={(id) => {
              state.removeLine(id);
              setStatusMessage('Deleted line');
            }}
            onDeleteArc={(id) => {
              state.removeArc(id);
              setStatusMessage('Deleted isocircle');
            }}
            onUpdateLineStyle={(id, style) => {
              state.setLines((prev) =>
                prev.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...style } } : l))
              );
            }}
            onSketchOnFace={(face) => {
              state.setActiveIsoplane(face.plane);
              state.setActiveElevation(face.elevation);
              state.setActiveTool('line');
              setStatusMessage(`Drafting Grid aligned to Face [${face.plane.toUpperCase()}] Elev ${face.elevation}`);
            }}
          />

          <div style={{ height: 1, backgroundColor: '#f3f4f6' }} />

          <LayersPanel
            layers={state.layers}
            activeLayerId={state.activeLayerId}
            onSelectLayer={state.setActiveLayerId}
            onToggleVisibility={state.toggleLayerVisibility}
            onAddLayer={state.addLayer}
            onDeleteLayer={state.deleteLayer}
          />

          <div style={{ height: 1, backgroundColor: '#f3f4f6' }} />

          <InstructionsPanel
            lesson={state.appMode !== 'practice' ? state.activeLesson : null}
            lines={state.lines}
            unitSize={state.gridSettings.unitSize}
          />
        </aside>
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar
        snapEnabled={state.gridSettings.snapToGrid}
        zoom={state.viewport.zoom}
        activeElevation={state.activeElevation}
        activeIsoplane={state.activeIsoplane}
        onSetElevation={(elev) => {
          state.setActiveElevation(elev);
          setStatusMessage(`Active Elevation set to Z = ${elev >= 0 ? `+${elev}` : elev}`);
        }}
        onSetIsoplane={(iso) => {
          state.setActiveIsoplane(iso);
          setStatusMessage(`Switched to ${iso.toUpperCase()} Isoplane`);
        }}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        statusText={statusMessage}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        gridSettings={state.gridSettings}
        onUpdateGridSettings={state.setGridSettings}
      />
    </div>
  );
};

export default App;
