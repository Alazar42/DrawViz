import React, { useState, useEffect, useCallback } from 'react';
import { useDrawingState } from './state/drawingState';
import { TopBar } from './components/TopBar';
import { ToolPanel } from './components/ToolPanel';
import { PropertyPanel } from './components/PropertyPanel';
import { InstructionsPanel } from './components/InstructionsPanel';
import { OrthoPanel } from './components/OrthoPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { IsometricCanvas } from './canvas/IsometricCanvas';
import { Three3DCanvas } from './canvas/Three3DCanvas';
import { AxisIndicator } from './canvas/AxisIndicator';
import { OrientationGizmo } from './canvas/OrientationGizmo';
import { DrawVizProject, DrawingCylinder, DrawingSphere, Point3D } from './types/drawing';

export const App: React.FC = () => {
  const state = useDrawingState();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [isToolShelfOpen, setIsToolShelfOpen] = useState(false);

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

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const hasMulti =
          state.selectedLineIds.length +
          state.selectedArcIds.length +
          state.selectedCylinderIds.length +
          state.selectedSphereIds.length +
          state.selectedVertices.length +
          state.selectedFaces.length > 0;

        if (hasMulti) {
          e.preventDefault();
          state.selectedSphereIds.forEach((id) => state.removeSphere(id));
          state.selectedCylinderIds.forEach((id) => state.removeCylinder(id));
          state.selectedArcIds.forEach((id) => state.removeArc(id));
          state.selectedLineIds.forEach((id) => state.removeLine(id));
          state.clearSelection();
          setStatusMessage('Deleted multi-selected items');
          return;
        }

        if (state.selectedSphereId) {
          e.preventDefault();
          state.removeSphere(state.selectedSphereId);
          state.setSelectedSphereId(null);
          setStatusMessage('Deleted sphere');
          return;
        }
        if (state.selectedArcId) {
          e.preventDefault();
          state.removeArc(state.selectedArcId);
          state.setSelectedArcId(null);
          setStatusMessage('Deleted arc');
          return;
        }
        if (state.selectedLineId) {
          e.preventDefault();
          state.removeLine(state.selectedLineId);
          state.setSelectedLineId(null);
          setStatusMessage('Deleted line');
          return;
        }
        if (state.selectedCylinderId) {
          e.preventDefault();
          state.removeCylinder(state.selectedCylinderId);
          state.setSelectedCylinderId(null);
          setStatusMessage('Deleted cylinder');
          return;
        }
      }

      if (e.key === 'Escape') {
        state.clearSelection();
        state.setActiveAnchor(null);
        setStatusMessage('Deselected all');
        return;
      }

      if (modKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        state.selectAll();
        setStatusMessage(`Selected all ${state.selectionMode}s (Ctrl+A)`);
        return;
      }

      if (modKey && (e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        const newGid = state.createGroupFromSelection();
        if (newGid) {
          setStatusMessage('Grouped selection (Ctrl+G)');
        } else {
          setStatusMessage('Select multiple items first (Shift+Click) to group');
        }
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'g' && !modKey) {
        state.setGroupMode(!state.groupMode);
        setStatusMessage(`Group Transform Mode: ${!state.groupMode ? 'ON (Move entire group together)' : 'OFF (Move single element)'}`);
        return;
      }

      if (e.key.toLowerCase() === 'g' && !modKey) {
        state.setGizmoMode('translate');
        setStatusMessage('Gizmo: Move (G)');
        return;
      }

      if (e.key.toLowerCase() === 'r' && !modKey) {
        state.setGizmoMode('rotate');
        setStatusMessage('Gizmo: Rotate (R)');
        return;
      }

      if (e.key.toLowerCase() === 's' && !modKey) {
        state.setGizmoMode('scale');
        setStatusMessage('Gizmo: Scale (S)');
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
        case 'a':
          if (!modKey) {
            state.setActiveTool('arc');
            setStatusMessage('Tool: Arc Creator (Click 2 vertices, manipulate R & +/- X,Y,Z)');
          }
          break;
        case 'y':
          state.setActiveTool('cylinder');
          setStatusMessage('Tool: 3D Cylinder');
          break;
        case 'x':
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
        case 'z':
          if (!modKey) {
            state.setActiveTool('zoom');
            setStatusMessage('Tool: Zoom');
          }
          break;
        case 't':
          if (!modKey) {
            setIsToolShelfOpen((prev) => !prev);
            setStatusMessage('Toggled Tool Shelf (T)');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    state.undo,
    state.redo,
    state.setActiveTool,
    state.selectedArcId,
    state.selectedLineId,
    state.selectedCylinderId,
    state.selectedSphereId,
    state.selectedLineIds,
    state.selectedArcIds,
    state.selectedCylinderIds,
    state.selectedSphereIds,
    state.selectedVertices,
    state.selectedFaces,
    state.createGroupFromSelection,
    state.clearSelection,
    state.groupMode,
    state.setGroupMode,
    state.removeArc,
    state.removeLine,
    state.removeCylinder,
    state.removeSphere,
    state.setSelectedArcId,
    state.setSelectedLineId,
    state.setSelectedCylinderId,
  ]);

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
      cylinders: state.cylinders,
      spheres: state.spheres,
      groups: state.groups,
      viewportConfig: {
        projection: state.isPerspective ? 'perspective' : 'orthographic',
        theme: state.theme,
        activeElevation: state.activeElevation,
        magnetSnapEnabled: true,
        solidShading: true,
      },
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
    const applyProjectData = (project: DrawVizProject, sourceName: string) => {
      if (project) {
        state.setLinesState(project.lines || []);
        state.setArcs(project.arcs || []);
        state.setCylinders(project.cylinders || []);
        state.setSpheres(project.spheres || []);
        state.setGroups(project.groups || []);
        if (project.layers) state.layers.splice(0, state.layers.length, ...project.layers);
        if (project.gridSettings) state.setGridSettings(project.gridSettings);
        if (project.viewportConfig) {
          if (project.viewportConfig.projection) {
            state.setIsPerspective(project.viewportConfig.projection === 'perspective');
          }
          if (project.viewportConfig.theme) {
            state.setTheme(project.viewportConfig.theme);
          }
          if (typeof project.viewportConfig.activeElevation === 'number') {
            state.setActiveElevation(project.viewportConfig.activeElevation);
          }
        }
        state.clearSelection();
        setStatusMessage(`Loaded ${sourceName}`);
      }
    };

    const wailsGo = (window as any).go?.main?.App;
    if (wailsGo && wailsGo.OpenFileDialog && wailsGo.LoadProject) {
      try {
        const filePath = await wailsGo.OpenFileDialog();
        if (filePath) {
          const project: DrawVizProject = await wailsGo.LoadProject(filePath);
          applyProjectData(project, filePath);
          return;
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
          applyProjectData(project, file.name);
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

  const handleAddPrimitive = (type: 'cube' | 'cylinder' | 'sphere') => {
    const elev = state.activeElevation;
    const s = 6;
    const x0 = 0;
    const y0 = 0;
    const z0 = elev;
    const now = Date.now();

    if (type === 'cube') {
      const p = [
        { x: x0, y: y0, z: z0 },
        { x: x0 + s, y: y0, z: z0 },
        { x: x0 + s, y: y0 + s, z: z0 },
        { x: x0, y: y0 + s, z: z0 },
        { x: x0, y: y0, z: z0 + s },
        { x: x0 + s, y: y0, z: z0 + s },
        { x: x0 + s, y: y0 + s, z: z0 + s },
        { x: x0, y: y0 + s, z: z0 + s },
      ];
      const edgePairs = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      const memberIds: string[] = [];

      edgePairs.forEach(([i, j], idx) => {
        const lineId = `cube-${now}-${idx}`;
        memberIds.push(lineId);
        state.addLine({
          id: lineId,
          start: p[i],
          end: p[j],
          layerId: state.activeLayerId,
          style: { stroke: state.theme === 'dark' ? '#f4f4f5' : '#111827', strokeWidth: 1.75, lineType: 'solid' },
        });
      });

      state.createGroup('Cube Mesh', 'mesh', memberIds);
      state.setActiveTool('select');
      setStatusMessage('Added 3D Cube Mesh (Grouped & Selected)');
    } else if (type === 'cylinder') {
      const cylId = `cylinder-${now}-${Math.floor(Math.random() * 1000)}`;
      const newCyl: DrawingCylinder = {
        id: cylId,
        center: { x: x0 + s / 2, y: y0 + s / 2, z: z0 },
        radius: 3,
        height: 6,
        normal: { x: 0, y: 0, z: 1 },
        layerId: state.activeLayerId,
        style: { stroke: state.theme === 'dark' ? '#f4f4f5' : '#111827', strokeWidth: 1.75, lineType: 'solid' },
      };
      state.addCylinder(newCyl);
      state.createGroup('Cylinder Mesh', 'mesh', [cylId]);
      state.setActiveTool('select');
      setStatusMessage('Added 3D Cylinder Mesh (Grouped & Selected)');
    } else if (type === 'sphere') {
      const c = { x: x0 + s / 2, y: y0 + s / 2, z: z0 + s / 2 };
      const r = 3;
      const sphId = `sphere-${now}-${Math.floor(Math.random() * 1000)}`;

      const newSphere: DrawingSphere = {
        id: sphId,
        center: c,
        radius: r,
        layerId: state.activeLayerId,
        style: { stroke: state.theme === 'dark' ? '#f4f4f5' : '#111827', strokeWidth: 1.75, lineType: 'solid' },
      };
      state.addSphere(newSphere);
      state.createGroup('Sphere Mesh', 'mesh', [sphId]);
      state.setActiveTool('select');
      setStatusMessage('Added 3D Solid Sphere (Grouped & Selected)');
    }
  };

  const handleNewDrawing = () => {
    if (window.confirm('Create a new drawing? Unsaved changes will be cleared.')) {
      state.resetCanvas();
      setStatusMessage('New canvas ready');
    }
  };

  return (
    <div
      data-theme={state.theme}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: state.theme === 'dark' ? '#18181b' : '#ffffff',
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
        theme={state.theme}
        onToggleTheme={state.toggleTheme}
      />

      {/* 2. Main Middle Workspace: ToolPanel + Canvas/Ortho + PropertyPanel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Left Tool Panel (Always visible, matching studio design) */}
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
          theme={state.theme}
          onAddPrimitive={handleAddPrimitive}
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
              cylinders={state.cylinders}
              spheres={state.spheres}
              activeLayerId={state.activeLayerId}
              selectedLineId={state.selectedLineId}
              selectedArcId={state.selectedArcId}
              selectedCylinderId={state.selectedCylinderId}
              selectedSphereId={state.selectedSphereId}
              activeTool={state.activeTool}
              onSelectTool={state.setActiveTool}
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
                if (v && state.groupMode) {
                  const vKey = `${v.x},${v.y},${v.z || 0}`;
                  const matchGroup = state.groups.find((g) => g.type === 'vertex' && g.memberIds.includes(vKey));
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Vertex Group: ${matchGroup.name}`);
                    return;
                  }
                }
                state.setSelectedVertex(v);
                state.setSelectedVertices(v ? [v] : []);
                if (v) {
                  state.setSelectedGroupId(null);
                  setStatusMessage(`Selected Vertex (${v.x}, ${v.y}, ${v.z || 0})`);
                }
              }}
              onSelectFace={(f) => {
                if (f && state.groupMode) {
                  const fKey = `face-${f.elevation}-${f.vertices.map((v) => `${v.x},${v.y}`).join('-')}`;
                  const matchGroup = state.groups.find((g) => g.type === 'plane' && g.memberIds.includes(fKey));
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Face Group: ${matchGroup.name}`);
                    return;
                  }
                }
                state.setSelectedFace(f);
                state.setSelectedFaces(f ? [f] : []);
                if (f) {
                  state.setSelectedGroupId(null);
                  setStatusMessage(`Selected Face at Elev ${f.elevation}`);
                }
              }}
              onSelectLine={(id) => {
                if (id && state.groupMode) {
                  const matchGroup = state.groups.find(
                    (g) => g.memberIds.includes(id) || state.lines.find((l) => l.id === id)?.groupId === g.id
                  );
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Group: ${matchGroup.name} (${matchGroup.memberIds.length} members)`);
                    return;
                  }
                }
                state.setSelectedLineId(id);
                state.setSelectedLineIds(id ? [id] : []);
                if (id) {
                  state.setSelectedGroupId(null);
                  state.setSelectedArcId(null);
                  state.setSelectedArcIds([]);
                  state.setSelectedCylinderId(null);
                  state.setSelectedCylinderIds([]);
                  state.setSelectedSphereId(null);
                  state.setSelectedSphereIds([]);
                  state.setSelectedVertex(null);
                  state.setSelectedVertices([]);
                  state.setSelectedFace(null);
                  state.setSelectedFaces([]);
                  setStatusMessage(`Selected Line ${id}`);
                }
              }}
              onSelectArc={(id) => {
                if (id && state.groupMode) {
                  const matchGroup = state.groups.find(
                    (g) => g.memberIds.includes(id) || state.arcs.find((a) => a.id === id)?.groupId === g.id
                  );
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Group: ${matchGroup.name}`);
                    return;
                  }
                }
                state.setSelectedArcId(id);
                state.setSelectedArcIds(id ? [id] : []);
                if (id) {
                  state.setSelectedGroupId(null);
                  state.setSelectedLineId(null);
                  state.setSelectedLineIds([]);
                  state.setSelectedCylinderId(null);
                  state.setSelectedCylinderIds([]);
                  state.setSelectedSphereId(null);
                  state.setSelectedSphereIds([]);
                  state.setSelectedVertex(null);
                  state.setSelectedVertices([]);
                  state.setSelectedFace(null);
                  state.setSelectedFaces([]);
                  const targetArc = state.arcs.find((a) => a.id === id);
                  const is2V = !!(targetArc?.startPoint && targetArc?.endPoint);
                  setStatusMessage(`Selected ${is2V ? 'Two-Vertex Arc' : 'Circle'} ${id}`);
                }
              }}
              onSelectCylinder={(id) => {
                if (id && state.groupMode) {
                  const matchGroup = state.groups.find(
                    (g) => g.memberIds.includes(id) || state.cylinders.find((c) => c.id === id)?.groupId === g.id
                  );
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Group: ${matchGroup.name}`);
                    return;
                  }
                }
                state.setSelectedCylinderId(id);
                state.setSelectedCylinderIds(id ? [id] : []);
                if (id) {
                  state.setSelectedGroupId(null);
                  state.setSelectedLineId(null);
                  state.setSelectedLineIds([]);
                  state.setSelectedArcId(null);
                  state.setSelectedArcIds([]);
                  state.setSelectedSphereId(null);
                  state.setSelectedSphereIds([]);
                  state.setSelectedVertex(null);
                  state.setSelectedVertices([]);
                  state.setSelectedFace(null);
                  state.setSelectedFaces([]);
                  setStatusMessage(`Selected Cylinder ${id}`);
                }
              }}
              onSelectSphere={(id) => {
                if (id && state.groupMode) {
                  const matchGroup = state.groups.find(
                    (g) => g.memberIds.includes(id) || state.spheres.find((s) => s.id === id)?.groupId === g.id
                  );
                  if (matchGroup) {
                    state.selectGroup(matchGroup.id);
                    setStatusMessage(`Selected Group: ${matchGroup.name}`);
                    return;
                  }
                }
                state.setSelectedSphereId(id);
                state.setSelectedSphereIds(id ? [id] : []);
                if (id) {
                  state.setSelectedGroupId(null);
                  state.setSelectedLineId(null);
                  state.setSelectedLineIds([]);
                  state.setSelectedArcId(null);
                  state.setSelectedArcIds([]);
                  state.setSelectedCylinderId(null);
                  state.setSelectedCylinderIds([]);
                  state.setSelectedVertex(null);
                  state.setSelectedVertices([]);
                  state.setSelectedFace(null);
                  state.setSelectedFaces([]);
                  setStatusMessage(`Selected Sphere ${id}`);
                }
              }}
              onAddLine={(line) => {
                state.addLine(line);
                setStatusMessage(`3D Line created (${state.lines.length + 1} total)`);
              }}
              onAddArc={(arc) => {
                state.addArc(arc);
                const is2V = !!(arc.startPoint && arc.endPoint);
                const dirStr = arc.bulgeDir ? ` (${arc.bulgeDir.toUpperCase()})` : '';
                setStatusMessage(`3D ${is2V ? 'Two-Vertex Arc' : 'Circle'} created (R: ${arc.radius}${dirStr})`);
              }}
              onAddCylinder={(cyl) => {
                state.addCylinder(cyl);
                setStatusMessage(`3D Cylinder created R: ${cyl.radius} H: ${cyl.height}`);
              }}
              onAddSphere={(sph) => {
                state.addSphere(sph);
                setStatusMessage(`3D Solid Sphere created R: ${sph.radius}`);
              }}
              onUpdateArc={state.updateArc}
              onUpdateCylinder={state.updateCylinder}
              onUpdateSphere={state.updateSphere}
              onRemoveLine={(id) => {
                state.removeLine(id);
                setStatusMessage('Line removed');
              }}
              onRemoveArc={(id) => {
                state.removeArc(id);
                setStatusMessage('Arc removed');
              }}
              onRemoveCylinder={(id) => {
                state.removeCylinder(id);
                setStatusMessage('Cylinder removed');
              }}
              onRemoveSphere={(id) => {
                state.removeSphere(id);
                setStatusMessage('Sphere removed');
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
              theme={state.theme}
              onToggleTheme={state.toggleTheme}
              onSetTheme={state.setTheme}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onTranslateEntity={state.translateEntity}
              onRotateEntity={state.rotateEntity}
              onScaleEntity={state.scaleEntity}
              gizmoMode={state.gizmoMode}
              onSetGizmoMode={state.setGizmoMode}
              onCommitTransform={state.commitTransform}
              groupMode={state.groupMode}
              groups={state.groups}
              selectedGroupId={state.selectedGroupId}
              onSelectGroup={state.selectGroup}
              selectedLineIds={state.selectedLineIds}
              selectedArcIds={state.selectedArcIds}
              selectedCylinderIds={state.selectedCylinderIds}
              selectedSphereIds={state.selectedSphereIds}
              selectedVertices={state.selectedVertices}
              selectedFaces={state.selectedFaces}
              selectionCategory={state.selectionCategory}
              onToggleSelectVertex={state.toggleSelectVertex}
              onToggleSelectEdge={state.toggleSelectEdge}
              onToggleSelectFace={state.toggleSelectFace}
              onToggleSelectMesh={state.toggleSelectMesh}
              onClearSelection={state.clearSelection}
              onCreateGroupFromSelection={(name) => {
                const id = state.createGroupFromSelection(name);
                if (id) {
                  setStatusMessage('Created group from selection (Ctrl+G)');
                }
                return id;
              }}
              isPerspective={state.isPerspective}
              onTogglePerspective={state.togglePerspective}
            />
          </div>

          {/* Bottom Collapsible Orthographic Multi-Views (WebGL Cameras) */}
          <OrthoPanel
            lines={state.lines}
            arcs={state.arcs}
            cylinders={state.cylinders}
            isOpen={state.showOrthoPanel}
            onToggle={() => state.setShowOrthoPanel(!state.showOrthoPanel)}
            selectedLineId={state.selectedLineId || state.selectedArcId || state.selectedCylinderId}
            onSelectLine={(id) => {
              state.setSelectedLineId(id);
              state.setSelectedArcId(id);
              state.setSelectedCylinderId(id);
              if (id) {
                setStatusMessage(`Selected entity from camera projection`);
              }
            }}
            theme={state.theme}
          />
        </div>

        {/* Right Property & Instructions Inspector */}
        <aside
          style={{
            width: 260,
            minWidth: 260,
            maxWidth: 260,
            backgroundColor: state.theme === 'dark' ? '#181a20' : '#ffffff',
            borderLeft: state.theme === 'dark' ? '1px solid #2d3139' : '1px solid #e5e7eb',
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
            selectedCylinder={state.cylinders.find((c) => c.id === state.selectedCylinderId) || null}
            selectedSphere={state.spheres.find((s) => s.id === state.selectedSphereId) || null}
            selectedVertex={state.selectedVertex}
            selectedFace={state.selectedFace}
            selectedLineIds={state.selectedLineIds}
            selectedArcIds={state.selectedArcIds}
            selectedCylinderIds={state.selectedCylinderIds}
            selectedSphereIds={state.selectedSphereIds}
            selectedVertices={state.selectedVertices}
            selectedFaces={state.selectedFaces}
            selectionCategory={state.selectionCategory}
            totalLines={state.lines.length}
            totalArcs={state.arcs.length}
            totalCylinders={state.cylinders.length}
            totalSpheres={state.spheres.length}
            unitSize={state.gridSettings.unitSize}
            zoom={state.viewport.zoom}
            activeTool={state.activeTool}
            theme={state.theme}
            groups={state.groups}
            groupMode={state.groupMode}
            selectedGroupId={state.selectedGroupId}
            onToggleGroupMode={state.setGroupMode}
            onCreateGroup={state.createGroup}
            onCreateGroupFromSelection={state.createGroupFromSelection}
            onSelectGroup={state.selectGroup}
            onDeleteGroupAndMembers={state.deleteGroupAndMembers}
            onRenameGroup={state.renameGroup}
            onClearSelection={state.clearSelection}
            onUngroup={state.ungroup}
            onDeleteLine={(id) => {
              state.removeLine(id);
              setStatusMessage('Deleted line');
            }}
            onDeleteArc={(id) => {
              state.removeArc(id);
              setStatusMessage('Deleted arc');
            }}
            onDeleteCylinder={(id) => {
              state.removeCylinder(id);
              setStatusMessage('Deleted cylinder');
            }}
            onDeleteSphere={(id) => {
              state.removeSphere(id);
              setStatusMessage('Deleted sphere');
            }}
            onUpdateArc={state.updateArc}
            onUpdateSphere={state.updateSphere}
            onExtrudeArc={(arc) => {
              const norm =
                arc.normal ??
                (arc.plane === 'top'
                  ? { x: 0, y: 0, z: 1 }
                  : arc.plane === 'front'
                  ? { x: 0, y: 1, z: 0 }
                  : { x: 1, y: 0, z: 0 });
              const newCyl: DrawingCylinder = {
                id: `cylinder-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                center: { ...arc.center },
                radius: arc.radius,
                height: 6,
                normal: norm,
                layerId: state.activeLayerId,
                style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
              };
              state.addCylinder(newCyl);
              state.setSelectedArcId(null);
              state.setSelectedCylinderId(newCyl.id);
              setStatusMessage('Extruded circle to 3D cylinder');
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

          <div style={{ height: 1, backgroundColor: state.theme === 'dark' ? '#2d3139' : '#f3f4f6' }} />

          <InstructionsPanel
            lesson={state.appMode !== 'practice' ? state.activeLesson : null}
            lines={state.lines}
            unitSize={state.gridSettings.unitSize}
            theme={state.theme}
          />
        </aside>
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar
        snapEnabled={state.gridSettings.snapToGrid}
        zoom={state.viewport.zoom}
        activeElevation={state.activeElevation}
        activeIsoplane={state.activeIsoplane}
        theme={state.theme}
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
        theme={state.theme}
        onSetTheme={state.setTheme}
      />
    </div>
  );
};

export default App;
