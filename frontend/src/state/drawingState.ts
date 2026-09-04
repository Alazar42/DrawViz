import { useState, useEffect, useCallback } from 'react';
import {
  AppMode,
  DrawingLine,
  DrawingArc,
  DrawingCylinder,
  GridSettings,
  Layer,
  Point3D,
  ScreenPoint,
  ToolType,
} from '../types/drawing';
import { ViewportTransform, IsoplaneType } from '../geometry/isometric';
import { HostPlaneInfo } from '../geometry/snapping';
import { CURRICULUM, STEPPED_INCLINE_TARGET_LINES } from '../lessons/curriculum';

export interface CursorState {
  screen: ScreenPoint;
  logical: Point3D;
  snapType: string;
  angleDeg?: number;
  hostPlane?: HostPlaneInfo;
}

interface HistorySnapshot {
  lines: DrawingLine[];
  arcs: DrawingArc[];
  cylinders: DrawingCylinder[];
}

const DEFAULT_LAYERS: Layer[] = [
  { id: 'layer-1', name: 'Layer 1', visible: true, locked: false, color: '#111827' },
];

const DEFAULT_GRID_SETTINGS: GridSettings = {
  unitSize: 28,
  snapToGrid: true,
  snapToIsometric: true,
  snapToEndpoints: true,
  showGrid: true,
  gridType: 'isometric',
};

// Initial state with preloaded isometric stepped block (as in user screenshot)
const INITIAL_DEMO_LINES: DrawingLine[] = STEPPED_INCLINE_TARGET_LINES.map((l) => ({
  ...l,
  layerId: 'layer-1',
}));

export function useDrawingState() {
  const [lines, setLinesState] = useState<DrawingLine[]>(INITIAL_DEMO_LINES);
  const [arcs, setArcsState] = useState<DrawingArc[]>([]);
  const [cylinders, setCylindersState] = useState<DrawingCylinder[]>([]);
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedCylinderId, setSelectedCylinderId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('line');
  const [gridSettings, setGridSettingsState] = useState<GridSettings>(DEFAULT_GRID_SETTINGS);
  const [viewport, setViewportState] = useState<ViewportTransform>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });
  const [cursorState, setCursorState] = useState<CursorState>({
    screen: { x: 0, y: 0 },
    logical: { x: 0, y: 0, z: 0 },
    snapType: 'grid',
  });
  const [activeAnchor, setActiveAnchor] = useState<Point3D | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('practice');
  const [activeLessonId, setActiveLessonId] = useState<string>('challenge-1');
  const [showOrthoPanel, setShowOrthoPanel] = useState<boolean>(true);
  const [activeElevation, setActiveElevation] = useState<number>(0);
  const [activeIsoplane, setActiveIsoplane] = useState<IsoplaneType>('top');
  const [selectionMode, setSelectionMode] = useState<import('../types/drawing').SelectionMode>('edge');
  const [selectedVertex, setSelectedVertex] = useState<Point3D | null>(null);
  const [selectedFace, setSelectedFace] = useState<import('../types/drawing').Face3D | null>(null);

  // Keyboard shortcut listener for Blender-style 1, 2, 3 modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === '1') {
        setSelectionMode('vertex');
      } else if (e.key === '2') {
        setSelectionMode('edge');
      } else if (e.key === '3') {
        setSelectionMode('face');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // History stack for Undo/Redo (stores lines, arcs, cylinders)
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const pushToHistory = useCallback((currentLines: DrawingLine[], currentArcs: DrawingArc[], currentCylinders: DrawingCylinder[] = cylinders) => {
    setUndoStack((prev) => [...prev.slice(-30), { lines: currentLines, arcs: currentArcs, cylinders: currentCylinders }]);
    setRedoStack([]);
  }, [cylinders]);

  const setLines = useCallback(
    (newLines: DrawingLine[] | ((prev: DrawingLine[]) => DrawingLine[])) => {
      setLinesState((prev) => {
        const next = typeof newLines === 'function' ? newLines(prev) : newLines;
        pushToHistory(prev, arcs, cylinders);
        return next;
      });
    },
    [pushToHistory, arcs, cylinders]
  );

  const addLine = useCallback(
    (line: DrawingLine) => {
      setLinesState((prev) => {
        pushToHistory(prev, arcs, cylinders);
        return [...prev, line];
      });
    },
    [pushToHistory, arcs, cylinders]
  );

  const removeLine = useCallback(
    (id: string) => {
      setLinesState((prev) => {
        pushToHistory(prev, arcs, cylinders);
        return prev.filter((l) => l.id !== id);
      });
      if (selectedLineId === id) setSelectedLineId(null);
    },
    [pushToHistory, arcs, cylinders, selectedLineId]
  );

  const setArcs = useCallback(
    (newArcs: DrawingArc[] | ((prev: DrawingArc[]) => DrawingArc[])) => {
      setArcsState((prev) => {
        const next = typeof newArcs === 'function' ? newArcs(prev) : newArcs;
        pushToHistory(lines, prev, cylinders);
        return next;
      });
    },
    [pushToHistory, lines, cylinders]
  );

  const addArc = useCallback(
    (arc: DrawingArc) => {
      setArcsState((prev) => {
        pushToHistory(lines, prev, cylinders);
        return [...prev, arc];
      });
    },
    [pushToHistory, lines, cylinders]
  );

  const removeArc = useCallback(
    (id: string) => {
      setArcsState((prev) => {
        pushToHistory(lines, prev, cylinders);
        return prev.filter((a) => a.id !== id);
      });
      if (selectedArcId === id) setSelectedArcId(null);
    },
    [pushToHistory, lines, cylinders, selectedArcId]
  );

  const setCylinders = useCallback(
    (newCylinders: DrawingCylinder[] | ((prev: DrawingCylinder[]) => DrawingCylinder[])) => {
      setCylindersState((prev) => {
        const next = typeof newCylinders === 'function' ? newCylinders(prev) : newCylinders;
        pushToHistory(lines, arcs, prev);
        return next;
      });
    },
    [pushToHistory, lines, arcs]
  );

  const addCylinder = useCallback(
    (cylinder: DrawingCylinder) => {
      setCylindersState((prev) => {
        pushToHistory(lines, arcs, prev);
        return [...prev, cylinder];
      });
    },
    [pushToHistory, lines, arcs]
  );

  const removeCylinder = useCallback(
    (id: string) => {
      setCylindersState((prev) => {
        pushToHistory(lines, arcs, prev);
        return prev.filter((c) => c.id !== id);
      });
      if (selectedCylinderId === id) setSelectedCylinderId(null);
    },
    [pushToHistory, lines, arcs, selectedCylinderId]
  );

  const updateArc = useCallback((arc: DrawingArc) => {
    setArcsState((prev) => prev.map((a) => (a.id === arc.id ? arc : a)));
  }, []);

  const updateCylinder = useCallback((cylinder: DrawingCylinder) => {
    setCylindersState((prev) => prev.map((c) => (c.id === cylinder.id ? cylinder : c)));
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, { lines, arcs, cylinders }]);
    setLinesState(previous.lines);
    setArcsState(previous.arcs);
    setCylindersState(previous.cylinders || []);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
  }, [undoStack, lines, arcs, cylinders]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, { lines, arcs, cylinders }]);
    setLinesState(next.lines);
    setArcsState(next.arcs);
    setCylindersState(next.cylinders || []);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
  }, [redoStack, lines, arcs, cylinders]);

  const setViewport = useCallback((updates: Partial<ViewportTransform>) => {
    setViewportState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setGridSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetCanvas = useCallback(() => {
    pushToHistory(lines, arcs, cylinders);
    setLinesState([]);
    setArcsState([]);
    setCylindersState([]);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setActiveAnchor(null);
  }, [lines, arcs, cylinders, pushToHistory]);

  const addLayer = useCallback(() => {
    const newId = `layer-${layers.length + 1}`;
    const newLayer: Layer = {
      id: newId,
      name: `Layer ${layers.length + 1}`,
      visible: true,
      locked: false,
      color: '#111827',
    };
    setLayers((prev) => [...prev, newLayer]);
    setActiveLayerId(newId);
  }, [layers.length]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers((prev) =>
      prev.map((ly) => (ly.id === layerId ? { ...ly, visible: !ly.visible } : ly))
    );
  }, []);

  const deleteLayer = useCallback(
    (layerId: string) => {
      if (layers.length <= 1) return;
      setLayers((prev) => prev.filter((ly) => ly.id !== layerId));
      setLinesState((prev) => prev.filter((l) => l.layerId !== layerId));
      setArcsState((prev) => prev.filter((a) => a.layerId !== layerId));
      if (activeLayerId === layerId) {
        const remaining = layers.filter((ly) => ly.id !== layerId);
        setActiveLayerId(remaining[0].id);
      }
    },
    [layers, activeLayerId]
  );

  const selectedLine = lines.find((l) => l.id === selectedLineId) || null;
  const activeLesson = CURRICULUM.find((l) => l.id === activeLessonId) || null;

  return {
    lines,
    setLinesState,
    setLines,
    addLine,
    removeLine,
    selectedLineId,
    setSelectedLineId,
    selectedLine,
    activeTool,
    setActiveTool,
    gridSettings,
    setGridSettings,
    viewport,
    setViewport,
    cursorState,
    setCursorState,
    activeAnchor,
    setActiveAnchor,
    appMode,
    setAppMode,
    activeLessonId,
    setActiveLessonId,
    activeLesson,
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    toggleLayerVisibility,
    deleteLayer,
    arcs,
    setArcsState,
    setArcs,
    addArc,
    updateArc,
    removeArc,
    selectedArcId,
    setSelectedArcId,
    selectedArc: arcs.find((a) => a.id === selectedArcId) || null,
    cylinders,
    setCylindersState,
    setCylinders,
    addCylinder,
    updateCylinder,
    removeCylinder,
    selectedCylinderId,
    setSelectedCylinderId,
    selectedCylinder: cylinders.find((c) => c.id === selectedCylinderId) || null,
    showOrthoPanel,
    setShowOrthoPanel,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    resetCanvas,
    activeElevation,
    setActiveElevation,
    activeIsoplane,
    setActiveIsoplane,
    selectionMode,
    setSelectionMode,
    selectedVertex,
    setSelectedVertex,
    selectedFace,
    setSelectedFace,
  };
}
