import { useState, useEffect, useCallback } from 'react';
import {
  AppMode,
  DrawingLine,
  GridSettings,
  Layer,
  Point3D,
  ScreenPoint,
  ToolType,
} from '../types/drawing';
import { ViewportTransform } from '../geometry/isometric';
import { CURRICULUM, STEPPED_INCLINE_TARGET_LINES } from '../lessons/curriculum';

export interface CursorState {
  screen: ScreenPoint;
  logical: Point3D;
  snapType: string;
  angleDeg?: number;
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
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
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

  // History stack for Undo/Redo
  const [undoStack, setUndoStack] = useState<DrawingLine[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingLine[][]>([]);

  const pushToHistory = useCallback((currentLines: DrawingLine[]) => {
    setUndoStack((prev) => [...prev.slice(-30), currentLines]);
    setRedoStack([]);
  }, []);

  const setLines = useCallback(
    (newLines: DrawingLine[] | ((prev: DrawingLine[]) => DrawingLine[])) => {
      setLinesState((prev) => {
        const next = typeof newLines === 'function' ? newLines(prev) : newLines;
        pushToHistory(prev);
        return next;
      });
    },
    [pushToHistory]
  );

  const addLine = useCallback(
    (line: DrawingLine) => {
      setLinesState((prev) => {
        pushToHistory(prev);
        return [...prev, line];
      });
    },
    [pushToHistory]
  );

  const removeLine = useCallback(
    (id: string) => {
      setLinesState((prev) => {
        pushToHistory(prev);
        return prev.filter((l) => l.id !== id);
      });
      if (selectedLineId === id) setSelectedLineId(null);
    },
    [pushToHistory, selectedLineId]
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, lines]);
    setLinesState(previous);
    setSelectedLineId(null);
  }, [undoStack, lines]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, lines]);
    setLinesState(next);
    setSelectedLineId(null);
  }, [redoStack, lines]);

  const setViewport = useCallback((updates: Partial<ViewportTransform>) => {
    setViewportState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setGridSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetCanvas = useCallback(() => {
    pushToHistory(lines);
    setLinesState([]);
    setSelectedLineId(null);
    setActiveAnchor(null);
  }, [lines, pushToHistory]);

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
    showOrthoPanel,
    setShowOrthoPanel,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    resetCanvas,
  };
}
