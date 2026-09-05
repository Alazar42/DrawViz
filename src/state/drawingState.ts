import { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import {
  AppMode,
  DrawingLine,
  DrawingArc,
  DrawingCylinder,
  DrawingSphere,
  EntityGroup,
  GroupType,
  GridSettings,
  Layer,
  Point3D,
  ScreenPoint,
  ToolType,
  AppTheme,
  Face3D,
  SelectionMode,
} from '../types/drawing';
import { ViewportTransform, IsoplaneType } from '../geometry/isometric';
import { HostPlaneInfo } from '../geometry/snapping';
import { extractFacesFromLines } from '../geometry/faces';
import { CURRICULUM } from '../lessons/curriculum';

// Accurate logical-to-Three.js spatial rotation:
// X_three = X_logical, Y_three = Z_logical (Up), Z_three = Y_logical (Depth)
function rotateLogicalPoint(p: Point3D, pivot: Point3D, dRotThree: Point3D): Point3D {
  const v = new THREE.Vector3(p.x - pivot.x, (p.z || 0) - (pivot.z || 0), p.y - pivot.y);
  const euler = new THREE.Euler(dRotThree.x, dRotThree.y, dRotThree.z, 'XYZ');
  v.applyEuler(euler);
  return {
    x: Math.round((v.x + pivot.x) * 100) / 100,
    y: Math.round((v.z + pivot.y) * 100) / 100,
    z: Math.round((v.y + (pivot.z || 0)) * 100) / 100,
  };
}

function scaleLogicalPoint(p: Point3D, pivot: Point3D, sThree: Point3D): Point3D {
  const v = new THREE.Vector3(p.x - pivot.x, (p.z || 0) - (pivot.z || 0), p.y - pivot.y);
  v.x *= sThree.x;
  v.y *= sThree.y;
  v.z *= sThree.z;
  return {
    x: Math.round((v.x + pivot.x) * 100) / 100,
    y: Math.round((v.z + pivot.y) * 100) / 100,
    z: Math.round((v.y + (pivot.z || 0)) * 100) / 100,
  };
}

export function matchesAnyPoint(p: Point3D, targetPts: Point3D[], tol = 0.25): boolean {
  return targetPts.some(
    (tp) => Math.hypot(tp.x - p.x, tp.y - p.y, (tp.z || 0) - (p.z || 0)) < tol
  );
}

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
  spheres: DrawingSphere[];
  groups: EntityGroup[];
  faceColors?: Record<string, string>;
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

const STORAGE_KEY = 'drawviz_cache';

function loadFromCache(): { lines: DrawingLine[]; arcs: DrawingArc[]; cylinders: DrawingCylinder[]; spheres: DrawingSphere[]; groups: EntityGroup[]; faceColors: Record<string, string> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.lines)) return data;
    }
  } catch {}
  return null;
}

function saveToCache(data: { lines: DrawingLine[]; arcs: DrawingArc[]; cylinders: DrawingCylinder[]; spheres: DrawingSphere[]; groups: EntityGroup[]; faceColors: Record<string, string> }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useDrawingState() {
  const cached = useRef(loadFromCache());
  const [lines, setLinesState] = useState<DrawingLine[]>(cached.current?.lines ?? []);
  const [arcs, setArcsState] = useState<DrawingArc[]>(cached.current?.arcs ?? []);
  const [cylinders, setCylindersState] = useState<DrawingCylinder[]>(cached.current?.cylinders ?? []);
  const [spheres, setSpheresState] = useState<DrawingSphere[]>(cached.current?.spheres ?? []);
  const [groups, setGroupsState] = useState<EntityGroup[]>(cached.current?.groups ?? []);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<boolean>(true); // Transform group as one unit when grouped

  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedCylinderId, setSelectedCylinderId] = useState<string | null>(null);
  const [selectedSphereId, setSelectedSphereId] = useState<string | null>(null);

  // Multi-Selection State (Shift + Click on same type)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectedArcIds, setSelectedArcIds] = useState<string[]>([]);
  const [selectedCylinderIds, setSelectedCylinderIds] = useState<string[]>([]);
  const [selectedSphereIds, setSelectedSphereIds] = useState<string[]>([]);
  const [selectedVertices, setSelectedVertices] = useState<Point3D[]>([]);
  const [selectedFaces, setSelectedFaces] = useState<Face3D[]>([]);
  const [selectionCategory, setSelectionCategory] = useState<'vertex' | 'edge' | 'plane' | 'mesh' | null>(null);

  // Camera projection state (Orthographic vs Perspective)
  const [isPerspective, setIsPerspective] = useState<boolean>(false);
  const togglePerspective = useCallback(() => setIsPerspective((prev) => !prev), []);

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
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('edge');
  const [selectedVertex, setSelectedVertex] = useState<Point3D | null>(null);
  const [selectedFace, setSelectedFace] = useState<Face3D | null>(null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Fresh state refs to completely prevent stale closure issues in transform handlers
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;
  const cylindersRef = useRef(cylinders);
  cylindersRef.current = cylinders;
  const spheresRef = useRef(spheres);
  spheresRef.current = spheres;
  const groupModeRef = useRef(groupMode);
  groupModeRef.current = groupMode;
  const selectedGroupIdRef = useRef(selectedGroupId);
  selectedGroupIdRef.current = selectedGroupId;
  const selectedLineIdsRef = useRef(selectedLineIds);
  selectedLineIdsRef.current = selectedLineIds;
  const selectedArcIdsRef = useRef(selectedArcIds);
  selectedArcIdsRef.current = selectedArcIds;
  const selectedCylinderIdsRef = useRef(selectedCylinderIds);
  selectedCylinderIdsRef.current = selectedCylinderIds;
  const selectedSphereIdsRef = useRef(selectedSphereIds);
  selectedSphereIdsRef.current = selectedSphereIds;
  const selectedVerticesRef = useRef(selectedVertices);
  selectedVerticesRef.current = selectedVertices;
  const selectedFacesRef = useRef(selectedFaces);
  selectedFacesRef.current = selectedFaces;
  const selectedFaceRef = useRef(selectedFace);
  selectedFaceRef.current = selectedFace;

  const [faceColors, setFaceColors] = useState<Record<string, string>>(cached.current?.faceColors ?? {});
  const faceColorsRef = useRef(faceColors);
  faceColorsRef.current = faceColors;

  // Auto-save to localStorage whenever drawing data changes
  useEffect(() => {
    saveToCache({ lines, arcs, cylinders, spheres, groups, faceColors });
  }, [lines, arcs, cylinders, spheres, groups, faceColors]);

  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('drawviz_theme');
      return (saved === 'dark' || saved === 'light') ? saved : 'light';
    } catch {
      return 'light';
    }
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('drawviz_theme', next);
      } catch {}
      return next;
    });
  }, []);

  const setAppTheme = useCallback((t: AppTheme) => {
    setTheme(t);
    try {
      localStorage.setItem('drawviz_theme', t);
    } catch {}
  }, []);

  const selectAllRef = useRef<() => void>(() => {});

  // Keyboard shortcut listener for Blender-style 1, 2, 3 modes, G, R, S gizmo modes & Ctrl+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllRef.current();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '1') {
        setSelectionMode('vertex');
      } else if (e.key === '2') {
        setSelectionMode('edge');
      } else if (e.key === '3') {
        setSelectionMode('face');
      } else if (e.key === 'g' || e.key === 'G') {
        setGizmoMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        setGizmoMode('rotate');
      } else if (e.key === 's' || e.key === 'S') {
        setGizmoMode('scale');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // History stack for Undo/Redo (stores lines, arcs, cylinders, spheres, groups)
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const pushToHistory = useCallback(
    (
      currentLines: DrawingLine[] = lines,
      currentArcs: DrawingArc[] = arcs,
      currentCylinders: DrawingCylinder[] = cylinders,
      currentSpheres: DrawingSphere[] = spheres,
      currentGroups: EntityGroup[] = groups,
      currentFaceColors: Record<string, string> = faceColorsRef.current
    ) => {
      setUndoStack((prev) => [
        ...prev.slice(-30),
        {
          lines: currentLines,
          arcs: currentArcs,
          cylinders: currentCylinders,
          spheres: currentSpheres,
          groups: currentGroups,
          faceColors: { ...currentFaceColors },
        },
      ]);
      setRedoStack([]);
    },
    [lines, arcs, cylinders, spheres, groups]
  );

  const setLines = useCallback(
    (newLines: DrawingLine[] | ((prev: DrawingLine[]) => DrawingLine[])) => {
      setLinesState((prev) => {
        const next = typeof newLines === 'function' ? newLines(prev) : newLines;
        pushToHistory(prev, arcs, cylinders, spheres, groups);
        return next;
      });
    },
    [pushToHistory, arcs, cylinders, spheres, groups]
  );

  const addLine = useCallback(
    (line: DrawingLine) => {
      setLinesState((prev) => {
        pushToHistory(prev, arcs, cylinders, spheres, groups);
        return [...prev, line];
      });
    },
    [pushToHistory, arcs, cylinders, spheres, groups]
  );

  const removeLine = useCallback(
    (id: string) => {
      setLinesState((prev) => {
        pushToHistory(prev, arcs, cylinders, spheres, groups);
        return prev.filter((l) => l.id !== id);
      });
      if (selectedLineId === id) setSelectedLineId(null);
    },
    [pushToHistory, arcs, cylinders, spheres, groups, selectedLineId]
  );

  const setArcs = useCallback(
    (newArcs: DrawingArc[] | ((prev: DrawingArc[]) => DrawingArc[])) => {
      setArcsState((prev) => {
        const next = typeof newArcs === 'function' ? newArcs(prev) : newArcs;
        pushToHistory(lines, prev, cylinders, spheres, groups);
        return next;
      });
    },
    [pushToHistory, lines, cylinders, spheres, groups]
  );

  const addArc = useCallback(
    (arc: DrawingArc) => {
      setArcsState((prev) => {
        pushToHistory(lines, prev, cylinders, spheres, groups);
        return [...prev, arc];
      });
    },
    [pushToHistory, lines, cylinders, spheres, groups]
  );

  const removeArc = useCallback(
    (id: string) => {
      setArcsState((prev) => {
        pushToHistory(lines, prev, cylinders, spheres, groups);
        return prev.filter((a) => a.id !== id);
      });
      if (selectedArcId === id) setSelectedArcId(null);
    },
    [pushToHistory, lines, cylinders, spheres, groups, selectedArcId]
  );

  const setCylinders = useCallback(
    (newCylinders: DrawingCylinder[] | ((prev: DrawingCylinder[]) => DrawingCylinder[])) => {
      setCylindersState((prev) => {
        const next = typeof newCylinders === 'function' ? newCylinders(prev) : newCylinders;
        pushToHistory(lines, arcs, prev, spheres, groups);
        return next;
      });
    },
    [pushToHistory, lines, arcs, spheres, groups]
  );

  const addCylinder = useCallback(
    (cylinder: DrawingCylinder) => {
      setCylindersState((prev) => {
        pushToHistory(lines, arcs, prev, spheres, groups);
        return [...prev, cylinder];
      });
    },
    [pushToHistory, lines, arcs, spheres, groups]
  );

  const removeCylinder = useCallback(
    (id: string) => {
      setCylindersState((prev) => {
        pushToHistory(lines, arcs, prev, spheres, groups);
        return prev.filter((c) => c.id !== id);
      });
      if (selectedCylinderId === id) setSelectedCylinderId(null);
    },
    [pushToHistory, lines, arcs, spheres, groups, selectedCylinderId]
  );

  const updateArc = useCallback((arc: DrawingArc) => {
    setArcsState((prev) => prev.map((a) => (a.id === arc.id ? arc : a)));
  }, []);

  const updateCylinder = useCallback((cylinder: DrawingCylinder) => {
    setCylindersState((prev) => prev.map((c) => (c.id === cylinder.id ? cylinder : c)));
  }, []);

  // Spheres (first-class 3D solid surface entities)
  const setSpheres = useCallback(
    (newSpheres: DrawingSphere[] | ((prev: DrawingSphere[]) => DrawingSphere[])) => {
      setSpheresState((prev) => {
        const next = typeof newSpheres === 'function' ? newSpheres(prev) : newSpheres;
        pushToHistory(lines, arcs, cylinders, prev, groups);
        return next;
      });
    },
    [pushToHistory, lines, arcs, cylinders, groups]
  );

  const addSphere = useCallback(
    (sphere: DrawingSphere) => {
      setSpheresState((prev) => {
        pushToHistory(lines, arcs, cylinders, prev, groups);
        return [...prev, sphere];
      });
    },
    [pushToHistory, lines, arcs, cylinders, groups]
  );

  const removeSphere = useCallback(
    (id: string) => {
      setSpheresState((prev) => {
        pushToHistory(lines, arcs, cylinders, prev, groups);
        return prev.filter((s) => s.id !== id);
      });
      if (selectedSphereId === id) setSelectedSphereId(null);
    },
    [pushToHistory, lines, arcs, cylinders, groups, selectedSphereId]
  );

  const updateSphere = useCallback((sphere: DrawingSphere) => {
    setSpheresState((prev) => prev.map((s) => (s.id === sphere.id ? sphere : s)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedLineIds([]);
    setSelectedLineId(null);
    setSelectedArcIds([]);
    setSelectedArcId(null);
    setSelectedCylinderIds([]);
    setSelectedCylinderId(null);
    setSelectedSphereIds([]);
    setSelectedSphereId(null);
    setSelectedVertices([]);
    setSelectedVertex(null);
    setSelectedFaces([]);
    setSelectedFace(null);
    setSelectedGroupId(null);
    setSelectionCategory(null);
  }, []);

  const selectAll = useCallback(() => {
    setActiveTool('select');
    if (selectionMode === 'face') {
      const allFaces = extractFacesFromLines(linesRef.current, arcsRef.current);
      setSelectedFaces(allFaces);
      setSelectedFace(allFaces[allFaces.length - 1] || null);
      setSelectedLineIds([]);
      setSelectedLineId(null);
      setSelectedArcIds([]);
      setSelectedArcId(null);
      setSelectedVertices([]);
      setSelectedVertex(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedGroupId(null);
      setSelectionCategory('plane');
    } else if (selectionMode === 'edge') {
      const curLines = linesRef.current;
      const curArcs = arcsRef.current;
      const lineIds = curLines.map((l) => l.id);
      const arcIds = curArcs.map((a) => a.id);
      setSelectedLineIds(lineIds);
      setSelectedLineId(lineIds[lineIds.length - 1] || null);
      setSelectedArcIds(arcIds);
      setSelectedArcId(arcIds[arcIds.length - 1] || null);
      setSelectedFaces([]);
      setSelectedFace(null);
      setSelectedVertices([]);
      setSelectedVertex(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedGroupId(null);
      setSelectionCategory('edge');
    } else if (selectionMode === 'vertex') {
      const pts: Point3D[] = [];
      const seen = new Set<string>();
      linesRef.current.forEach((l) => {
        const k1 = `${Math.round(l.start.x * 100) / 100},${Math.round(l.start.y * 100) / 100},${Math.round((l.start.z || 0) * 100) / 100}`;
        if (!seen.has(k1)) { seen.add(k1); pts.push(l.start); }
        const k2 = `${Math.round(l.end.x * 100) / 100},${Math.round(l.end.y * 100) / 100},${Math.round((l.end.z || 0) * 100) / 100}`;
        if (!seen.has(k2)) { seen.add(k2); pts.push(l.end); }
      });
      arcsRef.current.forEach((a) => {
        if (a.startPoint) {
          const k1 = `${Math.round(a.startPoint.x * 100) / 100},${Math.round(a.startPoint.y * 100) / 100},${Math.round((a.startPoint.z || 0) * 100) / 100}`;
          if (!seen.has(k1)) { seen.add(k1); pts.push(a.startPoint); }
        }
        if (a.endPoint) {
          const k2 = `${Math.round(a.endPoint.x * 100) / 100},${Math.round(a.endPoint.y * 100) / 100},${Math.round((a.endPoint.z || 0) * 100) / 100}`;
          if (!seen.has(k2)) { seen.add(k2); pts.push(a.endPoint); }
        }
      });
      setSelectedVertices(pts);
      setSelectedVertex(pts[pts.length - 1] || null);
      setSelectedFaces([]);
      setSelectedFace(null);
      setSelectedLineIds([]);
      setSelectedLineId(null);
      setSelectedArcIds([]);
      setSelectedArcId(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedGroupId(null);
      setSelectionCategory('vertex');
    }
  }, [selectionMode]);

  selectAllRef.current = selectAll;

  const selectGroup = useCallback((groupId: string | null) => {
    if (!groupId) {
      setSelectedGroupId(null);
      return;
    }
    const group = groupsRef.current.find((g) => g.id === groupId);
    if (!group) return;

    clearSelection();
    setSelectedGroupId(groupId);

    const curLines = linesRef.current;
    const curArcs = arcsRef.current;
    const curCyls = cylindersRef.current;
    const curSphs = spheresRef.current;

    const gLines = curLines.filter((l) => group.memberIds.includes(l.id) || l.groupId === groupId).map((l) => l.id);
    const gArcs = curArcs.filter((a) => group.memberIds.includes(a.id) || a.groupId === groupId).map((a) => a.id);
    const gCyls = curCyls.filter((c) => group.memberIds.includes(c.id) || c.groupId === groupId).map((c) => c.id);
    const gSph = curSphs.filter((s) => group.memberIds.includes(s.id) || s.groupId === groupId).map((s) => s.id);

    if (gLines.length > 0) {
      setSelectedLineIds(gLines);
      setSelectedLineId(gLines[gLines.length - 1] || null);
      setSelectionCategory('edge');
    }
    if (gArcs.length > 0) {
      setSelectedArcIds(gArcs);
      setSelectedArcId(gArcs[gArcs.length - 1] || null);
      setSelectionCategory('edge');
    }
    if (gCyls.length > 0) {
      setSelectedCylinderIds(gCyls);
      setSelectedCylinderId(gCyls[gCyls.length - 1] || null);
      setSelectionCategory('mesh');
    }
    if (gSph.length > 0) {
      setSelectedSphereIds(gSph);
      setSelectedSphereId(gSph[gSph.length - 1] || null);
      setSelectionCategory('mesh');
    }
    if (group.type === 'plane') {
      const allFaces = extractFacesFromLines(curLines, curArcs);
      const gFaces = allFaces.filter((f) => group.memberIds.includes(f.id) || f.groupId === groupId);
      setSelectedFaces(gFaces);
      setSelectedFace(gFaces[gFaces.length - 1] || null);
      setSelectionCategory('plane');
    }
    if (group.type === 'vertex') {
      const gVertices: Point3D[] = group.memberIds.map((mid) => {
        const parts = mid.replace(/^v-/, '').split('_').map(Number);
        return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
      });
      setSelectedVertices(gVertices);
      setSelectedVertex(gVertices[gVertices.length - 1] || null);
      setSelectionCategory('vertex');
    }
  }, [clearSelection]);

  // Group Management (Planes with Planes, Edges with Edges, Vertices with Vertices)
  const createGroup = useCallback(
    (name: string, type: GroupType, memberIds: string[]): string => {
      const newGroupId = `group-${type}-${Date.now()}`;
      let effectiveMemberIds = [...memberIds];
      let planeLineIds: string[] = [];

      if (type === 'plane') {
        const curFaces = extractFacesFromLines(linesRef.current, arcsRef.current);
        const matchingFaces = curFaces.filter((f) => memberIds.includes(f.id));
        const faceVerts = (matchingFaces.length > 0 ? matchingFaces : curFaces).flatMap((f) => f.vertices);
        planeLineIds = linesRef.current
          .filter((l) => matchesAnyPoint(l.start, faceVerts) && matchesAnyPoint(l.end, faceVerts))
          .map((l) => l.id);
        effectiveMemberIds = Array.from(new Set([...effectiveMemberIds, ...planeLineIds]));
      }

      const newGroup: EntityGroup = {
        id: newGroupId,
        name,
        type,
        memberIds: effectiveMemberIds,
      };

      pushToHistory(linesRef.current, arcsRef.current, cylindersRef.current, spheresRef.current, groupsRef.current);

      setGroupsState((prev) => [...prev, newGroup]);

      // Tag members with groupId
      setLinesState((prev) =>
        prev.map((l) => (effectiveMemberIds.includes(l.id) || planeLineIds.includes(l.id) ? { ...l, groupId: newGroupId } : l))
      );
      setArcsState((prev) =>
        prev.map((a) => (effectiveMemberIds.includes(a.id) ? { ...a, groupId: newGroupId } : a))
      );
      setCylindersState((prev) =>
        prev.map((c) => (effectiveMemberIds.includes(c.id) ? { ...c, groupId: newGroupId } : c))
      );
      setSpheresState((prev) =>
        prev.map((s) => (effectiveMemberIds.includes(s.id) ? { ...s, groupId: newGroupId } : s))
      );

      setSelectedGroupId(newGroupId);

      const curLines = linesRef.current;
      const curArcs = arcsRef.current;
      const curCyls = cylindersRef.current;
      const curSphs = spheresRef.current;

      const gLines = curLines.filter((l) => effectiveMemberIds.includes(l.id) || planeLineIds.includes(l.id)).map((l) => l.id);
      const gArcs = curArcs.filter((a) => memberIds.includes(a.id)).map((a) => a.id);
      const gCyls = curCyls.filter((c) => memberIds.includes(c.id)).map((c) => c.id);
      const gSph = curSphs.filter((s) => memberIds.includes(s.id)).map((s) => s.id);

      // Fallback to memberIds if state update is queued in the same tick
      const effectiveLineIds = gLines.length > 0 ? gLines : memberIds.filter((id) => !id.startsWith('cylinder') && !id.startsWith('sphere') && !id.startsWith('v-') && !id.startsWith('face'));
      const effectiveCylIds = gCyls.length > 0 ? gCyls : memberIds.filter((id) => id.startsWith('cylinder'));
      const effectiveSphIds = gSph.length > 0 ? gSph : memberIds.filter((id) => id.startsWith('sphere'));

      if (effectiveLineIds.length > 0) {
        setSelectedLineIds(effectiveLineIds);
        setSelectedLineId(effectiveLineIds[effectiveLineIds.length - 1] || null);
        setSelectionCategory('edge');
      }
      if (gArcs.length > 0) {
        setSelectedArcIds(gArcs);
        setSelectedArcId(gArcs[gArcs.length - 1] || null);
        setSelectionCategory('edge');
      }
      if (effectiveCylIds.length > 0) {
        setSelectedCylinderIds(effectiveCylIds);
        setSelectedCylinderId(effectiveCylIds[effectiveCylIds.length - 1] || null);
        setSelectionCategory('mesh');
      }
      if (effectiveSphIds.length > 0) {
        setSelectedSphereIds(effectiveSphIds);
        setSelectedSphereId(effectiveSphIds[effectiveSphIds.length - 1] || null);
        setSelectionCategory('mesh');
      }

      return newGroupId;
    },
    [pushToHistory]
  );

  const ungroup = useCallback(
    (groupId: string) => {
      pushToHistory(lines, arcs, cylinders, spheres, groups);

      setGroupsState((prev) => prev.filter((g) => g.id !== groupId));

      setLinesState((prev) =>
        prev.map((l) => (l.groupId === groupId ? { ...l, groupId: undefined } : l))
      );
      setArcsState((prev) =>
        prev.map((a) => (a.groupId === groupId ? { ...a, groupId: undefined } : a))
      );
      setCylindersState((prev) =>
        prev.map((c) => (c.groupId === groupId ? { ...c, groupId: undefined } : c))
      );
      setSpheresState((prev) =>
        prev.map((s) => (s.groupId === groupId ? { ...s, groupId: undefined } : s))
      );

      if (selectedGroupId === groupId) setSelectedGroupId(null);
    },
    [lines, arcs, cylinders, spheres, groups, selectedGroupId, pushToHistory]
  );

  const setGroups = useCallback((newGroups: EntityGroup[]) => {
    setGroupsState(newGroups);
  }, []);

  // Multi-Selection Methods (Shift-Click Same-Type Constraint)
  const toggleSelectVertex = useCallback((pt: Point3D | null, multi: boolean = false) => {
    if (!pt) {
      if (!multi) {
        setSelectedVertices([]);
        setSelectedVertex(null);
        setSelectedGroupId(null);
        if (selectionCategory === 'vertex') setSelectionCategory(null);
      }
      return;
    }

    const vKey = `v-${pt.x}_${pt.y}_${pt.z || 0}`;
    const matchingGroup = groups.find(
      (g) => g.type === 'vertex' && g.memberIds.includes(vKey)
    );

    if (matchingGroup && groupMode) {
      if (!multi) {
        selectGroup(matchingGroup.id);
        return;
      }
    }

    if (!multi) {
      setSelectedLineIds([]);
      setSelectedLineId(null);
      setSelectedArcIds([]);
      setSelectedArcId(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedFaces([]);
      setSelectedFace(null);
      setSelectedGroupId(null);

      setSelectedVertices([pt]);
      setSelectedVertex(pt);
      setSelectionCategory('vertex');
      return;
    }

    if (selectionCategory && selectionCategory !== 'vertex') return;

    setSelectedVertices((prev) => {
      const idx = prev.findIndex((v) => v.x === pt.x && v.y === pt.y && (v.z || 0) === (pt.z || 0));
      let next: Point3D[];
      if (idx >= 0) {
        next = prev.filter((_, i) => i !== idx);
      } else {
        next = [...prev, pt];
      }
      setSelectedVertex(next[next.length - 1] || null);
      setSelectionCategory(next.length > 0 ? 'vertex' : null);
      return next;
    });
  }, [groups, groupMode, selectGroup, selectionCategory]);

  const toggleSelectEdge = useCallback((type: 'line' | 'arc', id: string | null, multi: boolean = false) => {
    if (!id) {
      if (!multi) {
        setSelectedLineIds([]);
        setSelectedLineId(null);
        setSelectedArcIds([]);
        setSelectedArcId(null);
        setSelectedGroupId(null);
        if (selectionCategory === 'edge') setSelectionCategory(null);
      }
      return;
    }

    // Check if this edge belongs to an existing group
    const matchingGroup = groups.find(
      (g) =>
        g.memberIds.includes(id) ||
        (type === 'line' && lines.find((l) => l.id === id)?.groupId === g.id) ||
        (type === 'arc' && arcs.find((a) => a.id === id)?.groupId === g.id)
    );

    if (matchingGroup && groupMode) {
      if (!multi) {
        selectGroup(matchingGroup.id);
        return;
      } else {
        const gLines = lines.filter((l) => matchingGroup.memberIds.includes(l.id) || l.groupId === matchingGroup.id).map((l) => l.id);
        const gArcs = arcs.filter((a) => matchingGroup.memberIds.includes(a.id) || a.groupId === matchingGroup.id).map((a) => a.id);
        const isAlreadySelected = gLines.some((lid) => selectedLineIds.includes(lid)) || gArcs.some((aid) => selectedArcIds.includes(aid));

        if (isAlreadySelected) {
          setSelectedLineIds((prev) => prev.filter((lid) => !gLines.includes(lid)));
          setSelectedArcIds((prev) => prev.filter((aid) => !gArcs.includes(aid)));
          if (selectedGroupId === matchingGroup.id) setSelectedGroupId(null);
        } else {
          setSelectedLineIds((prev) => Array.from(new Set([...prev, ...gLines])));
          setSelectedArcIds((prev) => Array.from(new Set([...prev, ...gArcs])));
          setSelectedGroupId(matchingGroup.id);
        }
        setSelectionCategory('edge');
        return;
      }
    }

    if (!multi) {
      setSelectedVertices([]);
      setSelectedVertex(null);
      setSelectedFaces([]);
      setSelectedFace(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedGroupId(null);

      if (type === 'line') {
        setSelectedLineIds([id]);
        setSelectedLineId(id);
        setSelectedArcIds([]);
        setSelectedArcId(null);
      } else {
        setSelectedArcIds([id]);
        setSelectedArcId(id);
        setSelectedLineIds([]);
        setSelectedLineId(null);
      }
      setSelectionCategory('edge');
      return;
    }

    if (selectionCategory && selectionCategory !== 'edge') return;

    if (type === 'line') {
      setSelectedLineIds((prev) => {
        const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        setSelectedLineId(next[next.length - 1] || null);
        return next;
      });
    } else {
      setSelectedArcIds((prev) => {
        const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        setSelectedArcId(next[next.length - 1] || null);
        return next;
      });
    }
    setSelectionCategory('edge');
  }, [groups, lines, arcs, groupMode, selectGroup, selectedLineIds, selectedArcIds, selectedGroupId, selectionCategory]);

  const toggleSelectFace = useCallback((face: Face3D | null, multi: boolean = false) => {
    if (!face) {
      if (!multi) {
        setSelectedFaces([]);
        setSelectedFace(null);
        setSelectedGroupId(null);
        if (selectionCategory === 'plane') setSelectionCategory(null);
      }
      return;
    }

    const matchingGroup = groups.find(
      (g) => g.type === 'plane' && (g.memberIds.includes(face.id) || face.groupId === g.id)
    );

    if (matchingGroup && groupMode) {
      if (!multi) {
        selectGroup(matchingGroup.id);
        return;
      }
    }

    if (!multi) {
      setSelectedVertices([]);
      setSelectedVertex(null);
      setSelectedLineIds([]);
      setSelectedLineId(null);
      setSelectedArcIds([]);
      setSelectedArcId(null);
      setSelectedCylinderIds([]);
      setSelectedCylinderId(null);
      setSelectedSphereIds([]);
      setSelectedSphereId(null);
      setSelectedGroupId(null);

      setSelectedFaces([face]);
      setSelectedFace(face);
      setSelectionCategory('plane');
      return;
    }

    if (selectionCategory && selectionCategory !== 'plane') return;

    setSelectedFaces((prev) => {
      const idx = prev.findIndex((f) => f.id === face.id);
      let next: Face3D[];
      if (idx >= 0) {
        next = prev.filter((_, i) => i !== idx);
      } else {
        next = [...prev, face];
      }
      setSelectedFace(next[next.length - 1] || null);
      setSelectionCategory(next.length > 0 ? 'plane' : null);
      return next;
    });
  }, [groups, groupMode, selectGroup, selectionCategory]);

  const toggleSelectMesh = useCallback((type: 'cylinder' | 'sphere', id: string | null, multi: boolean = false) => {
    if (!id) {
      if (!multi) {
        setSelectedCylinderIds([]);
        setSelectedCylinderId(null);
        setSelectedSphereIds([]);
        setSelectedSphereId(null);
        setSelectedGroupId(null);
        if (selectionCategory === 'mesh') setSelectionCategory(null);
      }
      return;
    }

    const matchingGroup = groups.find(
      (g) =>
        g.memberIds.includes(id) ||
        (type === 'cylinder' && cylinders.find((c) => c.id === id)?.groupId === g.id) ||
        (type === 'sphere' && spheres.find((s) => s.id === id)?.groupId === g.id)
    );

    if (matchingGroup && groupMode) {
      if (!multi) {
        selectGroup(matchingGroup.id);
        return;
      } else {
        const gCyls = cylinders.filter((c) => matchingGroup.memberIds.includes(c.id) || c.groupId === matchingGroup.id).map((c) => c.id);
        const gSph = spheres.filter((s) => matchingGroup.memberIds.includes(s.id) || s.groupId === matchingGroup.id).map((s) => s.id);
        const isAlreadySelected = gCyls.some((cid) => selectedCylinderIds.includes(cid)) || gSph.some((sid) => selectedSphereIds.includes(sid));

        if (isAlreadySelected) {
          setSelectedCylinderIds((prev) => prev.filter((cid) => !gCyls.includes(cid)));
          setSelectedSphereIds((prev) => prev.filter((sid) => !gSph.includes(sid)));
          if (selectedGroupId === matchingGroup.id) setSelectedGroupId(null);
        } else {
          setSelectedCylinderIds((prev) => Array.from(new Set([...prev, ...gCyls])));
          setSelectedSphereIds((prev) => Array.from(new Set([...prev, ...gSph])));
          setSelectedGroupId(matchingGroup.id);
        }
        setSelectionCategory('mesh');
        return;
      }
    }

    if (!multi) {
      setSelectedVertices([]);
      setSelectedVertex(null);
      setSelectedLineIds([]);
      setSelectedLineId(null);
      setSelectedArcIds([]);
      setSelectedArcId(null);
      setSelectedFaces([]);
      setSelectedFace(null);
      setSelectedGroupId(null);

      if (type === 'cylinder') {
        setSelectedCylinderIds([id]);
        setSelectedCylinderId(id);
        setSelectedSphereIds([]);
        setSelectedSphereId(null);
      } else {
        setSelectedSphereIds([id]);
        setSelectedSphereId(id);
        setSelectedCylinderIds([]);
        setSelectedCylinderId(null);
      }
      setSelectionCategory('mesh');
      return;
    }

    if (selectionCategory && selectionCategory !== 'mesh') return;

    if (type === 'cylinder') {
      setSelectedCylinderIds((prev) => {
        const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        setSelectedCylinderId(next[next.length - 1] || null);
        return next;
      });
    } else {
      setSelectedSphereIds((prev) => {
        const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        setSelectedSphereId(next[next.length - 1] || null);
        return next;
      });
    }
    setSelectionCategory('mesh');
  }, [groups, cylinders, spheres, groupMode, selectGroup, selectedCylinderIds, selectedSphereIds, selectedGroupId, selectionCategory]);

  const createGroupFromSelection = useCallback((customName?: string): string | null => {
    pushToHistory(lines, arcs, cylinders, spheres, groups);

    // Collect all candidate member IDs including single selection if multi array is empty
    const lineIds = selectedLineIds.length > 0 ? selectedLineIds : (selectedLineId ? [selectedLineId] : []);
    const arcIds = selectedArcIds.length > 0 ? selectedArcIds : (selectedArcId ? [selectedArcId] : []);
    const cylIds = selectedCylinderIds.length > 0 ? selectedCylinderIds : (selectedCylinderId ? [selectedCylinderId] : []);
    const sphIds = selectedSphereIds.length > 0 ? selectedSphereIds : (selectedSphereId ? [selectedSphereId] : []);
    const verts = selectedVertices.length > 0 ? selectedVertices : (selectedVertex ? [selectedVertex] : []);
    const faces = selectedFaces.length > 0 ? selectedFaces : (selectedFace ? [selectedFace] : []);

    const count =
      verts.length +
      lineIds.length +
      arcIds.length +
      faces.length +
      cylIds.length +
      sphIds.length;

    if (count === 0) return null;

    let groupType: GroupType = 'edge';
    let memberIds: string[] = [];
    let defaultName = 'Group';

    if (selectionCategory === 'plane' || faces.length > 0) {
      groupType = 'plane';
      const allFaceVerts = faces.flatMap((f) => f.vertices);
      const planeLineIds = linesRef.current
        .filter((l) => matchesAnyPoint(l.start, allFaceVerts) && matchesAnyPoint(l.end, allFaceVerts))
        .map((l) => l.id);
      memberIds = Array.from(new Set([...faces.map((f) => f.id), ...planeLineIds]));
      defaultName = `Plane Group ${groups.filter((g) => g.type === 'plane').length + 1}`;
    } else if (selectionCategory === 'vertex' || verts.length > 0) {
      groupType = 'vertex';
      memberIds = verts.map((v) => `v-${v.x}_${v.y}_${v.z || 0}`);
      defaultName = `Vertex Group ${groups.filter((g) => g.type === 'vertex').length + 1}`;
    } else if (selectionCategory === 'mesh' || (cylIds.length + sphIds.length > 0)) {
      groupType = 'mesh';
      memberIds = [...cylIds, ...sphIds];
      defaultName = `Mesh Group ${groups.filter((g) => g.type === 'mesh').length + 1}`;
    } else {
      groupType = 'edge';
      memberIds = [...lineIds, ...arcIds];
      defaultName = `Edge Group ${groups.filter((g) => g.type === 'edge').length + 1}`;
    }

    const newGroupId = `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newGroup: EntityGroup = {
      id: newGroupId,
      name: customName?.trim() || defaultName,
      type: groupType,
      memberIds,
    };

    if (groupType === 'edge') {
      setLinesState((prev) =>
        prev.map((l) => (memberIds.includes(l.id) ? { ...l, groupId: newGroupId } : l))
      );
      setArcsState((prev) =>
        prev.map((a) => (memberIds.includes(a.id) ? { ...a, groupId: newGroupId } : a))
      );
      setSelectedLineIds(lineIds);
      setSelectedLineId(lineIds[lineIds.length - 1] || null);
      setSelectedArcIds(arcIds);
      setSelectedArcId(arcIds[arcIds.length - 1] || null);
      setSelectionCategory('edge');
    } else if (groupType === 'mesh') {
      setCylindersState((prev) =>
        prev.map((c) => (memberIds.includes(c.id) ? { ...c, groupId: newGroupId } : c))
      );
      setSpheresState((prev) =>
        prev.map((s) => (memberIds.includes(s.id) ? { ...s, groupId: newGroupId } : s))
      );
      setSelectedCylinderIds(cylIds);
      setSelectedCylinderId(cylIds[cylIds.length - 1] || null);
      setSelectedSphereIds(sphIds);
      setSelectedSphereId(sphIds[sphIds.length - 1] || null);
      setSelectionCategory('mesh');
    } else if (groupType === 'plane') {
      const allFaceVerts = faces.flatMap((f) => f.vertices);
      setLinesState((prev) =>
        prev.map((l) =>
          memberIds.includes(l.id) || (matchesAnyPoint(l.start, allFaceVerts) && matchesAnyPoint(l.end, allFaceVerts))
            ? { ...l, groupId: newGroupId }
            : l
        )
      );
      setSelectedFaces(faces);
      setSelectedFace(faces[faces.length - 1] || null);
      setSelectionCategory('plane');
    } else if (groupType === 'vertex') {
      setSelectedVertices(verts);
      setSelectedVertex(verts[verts.length - 1] || null);
      setSelectionCategory('vertex');
    }

    setGroupsState((prev) => [...prev, newGroup]);
    setSelectedGroupId(newGroupId);
    return newGroupId;
  }, [
    pushToHistory,
    lines,
    arcs,
    cylinders,
    spheres,
    groups,
    selectedVertices,
    selectedVertex,
    selectedLineIds,
    selectedLineId,
    selectedArcIds,
    selectedArcId,
    selectedFaces,
    selectedFace,
    selectedCylinderIds,
    selectedCylinderId,
    selectedSphereIds,
    selectedSphereId,
    selectionCategory,
  ]);

  const deleteGroupAndMembers = useCallback((groupId: string) => {
    pushToHistory(lines, arcs, cylinders, spheres, groups);
    setLinesState((prev) => prev.filter((l) => l.groupId !== groupId));
    setArcsState((prev) => prev.filter((a) => a.groupId !== groupId));
    setCylindersState((prev) => prev.filter((c) => c.groupId !== groupId));
    setSpheresState((prev) => prev.filter((s) => s.groupId !== groupId));
    setGroupsState((prev) => prev.filter((g) => g.id !== groupId));
    clearSelection();
  }, [lines, arcs, cylinders, spheres, groups, pushToHistory, clearSelection]);

  const renameGroup = useCallback((groupId: string, newName: string) => {
    setGroupsState((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: newName.trim() || g.name } : g))
    );
  }, []);

  // Realtime Live Translation & Transform Action
  // Realtime Live Translation & Transform Action
  const translateEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
      idOrData: any,
      delta: Point3D
    ) => {
      if (delta.x === 0 && delta.y === 0 && delta.z === 0) return;

      const currentGroups = groupsRef.current;
      const currentLines = linesRef.current;
      const currentArcs = arcsRef.current;
      const currentCyls = cylindersRef.current;
      const currentSphs = spheresRef.current;

      const transformPt = (p: Point3D): Point3D => ({
        x: Math.round((p.x + delta.x) * 100) / 100,
        y: Math.round((p.y + delta.y) * 100) / 100,
        z: Math.round(((p.z || 0) + delta.z) * 100) / 100,
      });

      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupModeRef.current && typeof idOrData === 'string'
          ? (currentLines.find((l) => l.id === idOrData)?.groupId ||
             currentArcs.find((a) => a.id === idOrData)?.groupId ||
             currentCyls.find((c) => c.id === idOrData)?.groupId ||
             currentSphs.find((s) => s.id === idOrData)?.groupId ||
             currentGroups.find((g) => g.memberIds.includes(idOrData))?.id)
          : groupModeRef.current && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || currentGroups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      // Group Translation
      if (type === 'group' || (groupModeRef.current && targetGroupId)) {
        const gid = (type === 'group' ? (idOrData as string) : targetGroupId)!;
        const grp = currentGroups.find((g) => g.id === gid);
        const memberIds = grp ? grp.memberIds : [];

        let planeGroupVerts: Point3D[] = [];
        if (grp?.type === 'plane') {
          currentLines.filter((l) => l.groupId === gid || memberIds.includes(l.id)).forEach((l) => planeGroupVerts.push(l.start, l.end));
          const allFaces = extractFacesFromLines(currentLines, currentArcs);
          const groupFaces = allFaces.filter((f) => memberIds.includes(f.id) || f.groupId === gid);
          planeGroupVerts.push(...groupFaces.flatMap((f) => f.vertices));
          memberIds.filter((mid) => mid.startsWith('face-')).forEach((mid) => {
            const rawKeys = mid.replace(/^face-/, '').split('|');
            rawKeys.forEach((k) => {
              const coords = k.split(',').map(Number);
              if (coords.length >= 3 && !coords.some(isNaN)) {
                planeGroupVerts.push({ x: coords[0], y: coords[1], z: coords[2] });
              }
            });
          });
        }

        let vertexGroupVerts: Point3D[] = [];
        if (grp?.type === 'vertex') {
          vertexGroupVerts = memberIds.map((mid) => {
            const parts = mid.replace(/^v-/, '').split('_').map(Number);
            return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
          });
        }

        const isDirectMember = (id: string, entityGroupId?: string) =>
          entityGroupId === gid || memberIds.includes(id);

        setLinesState((prev) =>
          prev.map((l) => {
            if (isDirectMember(l.id, l.groupId)) {
              return { ...l, start: transformPt(l.start), end: transformPt(l.end), groupId: gid };
            }
            if (planeGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, planeGroupVerts);
              const em = matchesAnyPoint(l.end, planeGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? transformPt(l.start) : l.start,
                  end: em ? transformPt(l.end) : l.end,
                  groupId: gid,
                };
              }
            }
            if (vertexGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, vertexGroupVerts);
              const em = matchesAnyPoint(l.end, vertexGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? transformPt(l.start) : l.start,
                  end: em ? transformPt(l.end) : l.end,
                };
              }
            }
            return l;
          })
        );
        setArcsState((prev) =>
          prev.map((a) => {
            if (isDirectMember(a.id, a.groupId)) {
              return {
                ...a,
                center: transformPt(a.center),
                startPoint: a.startPoint ? transformPt(a.startPoint) : undefined,
                endPoint: a.endPoint ? transformPt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            if (planeGroupVerts.length > 0 && matchesAnyPoint(a.center, planeGroupVerts)) {
              return {
                ...a,
                center: transformPt(a.center),
                startPoint: a.startPoint ? transformPt(a.startPoint) : undefined,
                endPoint: a.endPoint ? transformPt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            return a;
          })
        );
        setCylindersState((prev) =>
          prev.map((c) =>
            isDirectMember(c.id, c.groupId) ? { ...c, center: transformPt(c.center) } : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            isDirectMember(s.id, s.groupId) ? { ...s, center: transformPt(s.center) } : s
          )
        );
        if (grp?.type === 'plane') {
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: transformPt(f.center),
              vertices: f.vertices.map((v) => transformPt(v)),
              elevation: f.elevation + (f.plane === 'top' ? delta.z : f.plane === 'front' ? delta.y : delta.x),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: transformPt(prev.center),
                  vertices: prev.vertices.map((v) => transformPt(v)),
                  elevation: prev.elevation + (prev.plane === 'top' ? delta.z : prev.plane === 'front' ? delta.y : delta.x),
                }
              : null
          );
        }
        return;
      }

      if (type === 'multi') {
        const selLines = selectedLineIdsRef.current;
        const selArcs = selectedArcIdsRef.current;
        const selCyls = selectedCylinderIdsRef.current;
        const selSphs = selectedSphereIdsRef.current;
        const selVerts = selectedVerticesRef.current;
        const selFaces = selectedFacesRef.current;

        if (selLines.length > 0) {
          setLinesState((prev) =>
            prev.map((l) =>
              selLines.includes(l.id)
                ? { ...l, start: transformPt(l.start), end: transformPt(l.end) }
                : l
            )
          );
        }
        if (selArcs.length > 0) {
          setArcsState((prev) =>
            prev.map((a) =>
              selArcs.includes(a.id)
                ? {
                    ...a,
                    center: transformPt(a.center),
                    startPoint: a.startPoint ? transformPt(a.startPoint) : undefined,
                    endPoint: a.endPoint ? transformPt(a.endPoint) : undefined,
                  }
                : a
            )
          );
        }
        if (selCyls.length > 0) {
          setCylindersState((prev) =>
            prev.map((c) => (selCyls.includes(c.id) ? { ...c, center: transformPt(c.center) } : c))
          );
        }
        if (selSphs.length > 0) {
          setSpheresState((prev) =>
            prev.map((s) => (selSphs.includes(s.id) ? { ...s, center: transformPt(s.center) } : s))
          );
        }
        if (selVerts.length > 0) {
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, selVerts);
              const em = matchesAnyPoint(l.end, selVerts);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? transformPt(l.start) : l.start,
                end: em ? transformPt(l.end) : l.end,
              };
            })
          );
          setSelectedVertices((prev) => prev.map((v) => transformPt(v)));
        }
        if (selFaces.length > 0) {
          const allFaceVertices = selFaces.flatMap((f) => f.vertices);
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, allFaceVertices);
              const em = matchesAnyPoint(l.end, allFaceVertices);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? transformPt(l.start) : l.start,
                end: em ? transformPt(l.end) : l.end,
              };
            })
          );
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: transformPt(f.center),
              vertices: f.vertices.map((v) => transformPt(v)),
              elevation: f.elevation + (f.plane === 'top' ? delta.z : f.plane === 'front' ? delta.y : delta.x),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: transformPt(prev.center),
                  vertices: prev.vertices.map((v) => transformPt(v)),
                  elevation: prev.elevation + (prev.plane === 'top' ? delta.z : prev.plane === 'front' ? delta.y : delta.x),
                }
              : null
          );
        }
        return;
      }

      if (type === 'vertex') {
        const targetPt = idOrData as Point3D;
        const matchesPt = (p: Point3D) => matchesAnyPoint(p, [targetPt]);

        setLinesState((prev) =>
          prev.map((l) => {
            const startMatch = matchesPt(l.start);
            const endMatch = matchesPt(l.end);
            if (!startMatch && !endMatch) return l;
            return {
              ...l,
              start: startMatch ? transformPt(l.start) : l.start,
              end: endMatch ? transformPt(l.end) : l.end,
            };
          })
        );
        setArcsState((prev) =>
          prev.map((a) => {
            const p1Match = a.startPoint && matchesPt(a.startPoint);
            const p2Match = a.endPoint && matchesPt(a.endPoint);
            if (!p1Match && !p2Match) return a;
            return {
              ...a,
              startPoint: p1Match ? transformPt(a.startPoint!) : a.startPoint,
              endPoint: p2Match ? transformPt(a.endPoint!) : a.endPoint,
            };
          })
        );
        setSelectedVertex(transformPt(targetPt));
      } else if (type === 'line') {
        const lineId = idOrData as string;
        setLinesState((prev) =>
          prev.map((l) =>
            l.id === lineId
              ? { ...l, start: transformPt(l.start), end: transformPt(l.end) }
              : l
          )
        );
      } else if (type === 'arc') {
        const arcId = idOrData as string;
        setArcsState((prev) =>
          prev.map((a) =>
            a.id === arcId
              ? {
                  ...a,
                  center: transformPt(a.center),
                  startPoint: a.startPoint ? transformPt(a.startPoint) : undefined,
                  endPoint: a.endPoint ? transformPt(a.endPoint) : undefined,
                }
              : a
          )
        );
      } else if (type === 'cylinder') {
        const cylId = idOrData as string;
        setCylindersState((prev) =>
          prev.map((c) =>
            c.id === cylId ? { ...c, center: transformPt(c.center) } : c
          )
        );
      } else if (type === 'sphere') {
        const sphId = idOrData as string;
        setSpheresState((prev) =>
          prev.map((s) =>
            s.id === sphId ? { ...s, center: transformPt(s.center) } : s
          )
        );
      } else if (type === 'face') {
        const face = (idOrData as Face3D) || selectedFaceRef.current;
        if (!face) return;
        const faceVertices = face.vertices;
        setLinesState((prev) =>
          prev.map((l) => {
            const startInFace = matchesAnyPoint(l.start, faceVertices);
            const endInFace = matchesAnyPoint(l.end, faceVertices);
            if (!startInFace && !endInFace) return l;
            return {
              ...l,
              start: startInFace ? transformPt(l.start) : l.start,
              end: endInFace ? transformPt(l.end) : l.end,
            };
          })
        );
        setSelectedFace({
          ...face,
          center: transformPt(face.center),
          vertices: face.vertices.map((v) => transformPt(v)),
          elevation: face.elevation + (face.plane === 'top' ? delta.z : face.plane === 'front' ? delta.y : delta.x),
        });
        setSelectedFaces((prev) =>
          prev.map((f) =>
            f.id === face.id || matchesAnyPoint(f.center, [face.center])
              ? {
                  ...f,
                  center: transformPt(f.center),
                  vertices: f.vertices.map((v) => transformPt(v)),
                  elevation: f.elevation + (f.plane === 'top' ? delta.z : f.plane === 'front' ? delta.y : delta.x),
                }
              : f
          )
        );
      }
    },
    []
  );

  const rotateEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
      idOrData: any,
      pivot: Point3D,
      eulerRad: Point3D
    ) => {
      if (eulerRad.x === 0 && eulerRad.y === 0 && eulerRad.z === 0) return;

      const rotatePt = (p: Point3D): Point3D => rotateLogicalPoint(p, pivot, eulerRad);

      const currentGroups = groupsRef.current;
      const currentLines = linesRef.current;
      const currentArcs = arcsRef.current;
      const currentCyls = cylindersRef.current;
      const currentSphs = spheresRef.current;

      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupModeRef.current && typeof idOrData === 'string'
          ? (currentLines.find((l) => l.id === idOrData)?.groupId ||
             currentArcs.find((a) => a.id === idOrData)?.groupId ||
             currentCyls.find((c) => c.id === idOrData)?.groupId ||
             currentSphs.find((s) => s.id === idOrData)?.groupId ||
             currentGroups.find((g) => g.memberIds.includes(idOrData))?.id)
          : groupModeRef.current && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || currentGroups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      // Group Rotation
      if (type === 'group' || (groupModeRef.current && targetGroupId)) {
        const gid = (type === 'group' ? (idOrData as string) : targetGroupId)!;
        const grp = currentGroups.find((g) => g.id === gid);
        const memberIds = grp ? grp.memberIds : [];

        let planeGroupVerts: Point3D[] = [];
        if (grp?.type === 'plane') {
          currentLines.filter((l) => l.groupId === gid || memberIds.includes(l.id)).forEach((l) => planeGroupVerts.push(l.start, l.end));
          const allFaces = extractFacesFromLines(currentLines, currentArcs);
          const groupFaces = allFaces.filter((f) => memberIds.includes(f.id) || f.groupId === gid);
          planeGroupVerts.push(...groupFaces.flatMap((f) => f.vertices));
          memberIds.filter((mid) => mid.startsWith('face-')).forEach((mid) => {
            const rawKeys = mid.replace(/^face-/, '').split('|');
            rawKeys.forEach((k) => {
              const coords = k.split(',').map(Number);
              if (coords.length >= 3 && !coords.some(isNaN)) {
                planeGroupVerts.push({ x: coords[0], y: coords[1], z: coords[2] });
              }
            });
          });
        }

        let vertexGroupVerts: Point3D[] = [];
        if (grp?.type === 'vertex') {
          vertexGroupVerts = memberIds.map((mid) => {
            const parts = mid.replace(/^v-/, '').split('_').map(Number);
            return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
          });
        }

        const isDirectMember = (id: string, entityGroupId?: string) =>
          entityGroupId === gid || memberIds.includes(id);

        setLinesState((prev) =>
          prev.map((l) => {
            if (isDirectMember(l.id, l.groupId)) {
              return { ...l, start: rotatePt(l.start), end: rotatePt(l.end), groupId: gid };
            }
            if (planeGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, planeGroupVerts);
              const em = matchesAnyPoint(l.end, planeGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? rotatePt(l.start) : l.start,
                  end: em ? rotatePt(l.end) : l.end,
                  groupId: gid,
                };
              }
            }
            if (vertexGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, vertexGroupVerts);
              const em = matchesAnyPoint(l.end, vertexGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? rotatePt(l.start) : l.start,
                  end: em ? rotatePt(l.end) : l.end,
                };
              }
            }
            return l;
          })
        );
        setArcsState((prev) =>
          prev.map((a) => {
            if (isDirectMember(a.id, a.groupId)) {
              return {
                ...a,
                center: rotatePt(a.center),
                startPoint: a.startPoint ? rotatePt(a.startPoint) : undefined,
                endPoint: a.endPoint ? rotatePt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            if (planeGroupVerts.length > 0 && matchesAnyPoint(a.center, planeGroupVerts)) {
              return {
                ...a,
                center: rotatePt(a.center),
                startPoint: a.startPoint ? rotatePt(a.startPoint) : undefined,
                endPoint: a.endPoint ? rotatePt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            return a;
          })
        );
        setCylindersState((prev) =>
          prev.map((c) =>
            isDirectMember(c.id, c.groupId) ? { ...c, center: rotatePt(c.center) } : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            isDirectMember(s.id, s.groupId) ? { ...s, center: rotatePt(s.center) } : s
          )
        );
        if (grp?.type === 'plane') {
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: rotatePt(f.center),
              vertices: f.vertices.map((v) => rotatePt(v)),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: rotatePt(prev.center),
                  vertices: prev.vertices.map((v) => rotatePt(v)),
                }
              : null
          );
        }
        return;
      }

      if (type === 'multi') {
        const selLines = selectedLineIdsRef.current;
        const selArcs = selectedArcIdsRef.current;
        const selCyls = selectedCylinderIdsRef.current;
        const selSphs = selectedSphereIdsRef.current;
        const selVerts = selectedVerticesRef.current;
        const selFaces = selectedFacesRef.current;

        if (selLines.length > 0) {
          setLinesState((prev) =>
            prev.map((l) => (selLines.includes(l.id) ? { ...l, start: rotatePt(l.start), end: rotatePt(l.end) } : l))
          );
        }
        if (selArcs.length > 0) {
          setArcsState((prev) =>
            prev.map((a) =>
              selArcs.includes(a.id)
                ? {
                    ...a,
                    center: rotatePt(a.center),
                    startPoint: a.startPoint ? rotatePt(a.startPoint) : undefined,
                    endPoint: a.endPoint ? rotatePt(a.endPoint) : undefined,
                  }
                : a
            )
          );
        }
        if (selCyls.length > 0) {
          setCylindersState((prev) =>
            prev.map((c) => (selCyls.includes(c.id) ? { ...c, center: rotatePt(c.center) } : c))
          );
        }
        if (selSphs.length > 0) {
          setSpheresState((prev) =>
            prev.map((s) => (selSphs.includes(s.id) ? { ...s, center: rotatePt(s.center) } : s))
          );
        }
        if (selVerts.length > 0) {
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, selVerts);
              const em = matchesAnyPoint(l.end, selVerts);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? rotatePt(l.start) : l.start,
                end: em ? rotatePt(l.end) : l.end,
              };
            })
          );
          setSelectedVertices((prev) => prev.map((v) => rotatePt(v)));
        }
        if (selFaces.length > 0) {
          const allFaceVertices = selFaces.flatMap((f) => f.vertices);
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, allFaceVertices);
              const em = matchesAnyPoint(l.end, allFaceVertices);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? rotatePt(l.start) : l.start,
                end: em ? rotatePt(l.end) : l.end,
              };
            })
          );
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: rotatePt(f.center),
              vertices: f.vertices.map((v) => rotatePt(v)),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: rotatePt(prev.center),
                  vertices: prev.vertices.map((v) => rotatePt(v)),
                }
              : null
          );
        }
        return;
      }

      if (type === 'vertex') {
        const targetPt = idOrData as Point3D;
        const matchesPt = (p: Point3D) => matchesAnyPoint(p, [targetPt]);

        setLinesState((prev) =>
          prev.map((l) => {
            const startMatch = matchesPt(l.start);
            const endMatch = matchesPt(l.end);
            if (!startMatch && !endMatch) return l;
            return {
              ...l,
              start: startMatch ? rotatePt(l.start) : l.start,
              end: endMatch ? rotatePt(l.end) : l.end,
            };
          })
        );
        setSelectedVertex(rotatePt(targetPt));
      } else if (type === 'line') {
        const lineId = idOrData as string;
        setLinesState((prev) =>
          prev.map((l) => (l.id === lineId ? { ...l, start: rotatePt(l.start), end: rotatePt(l.end) } : l))
        );
      } else if (type === 'arc') {
        const arcId = idOrData as string;
        setArcsState((prev) =>
          prev.map((a) =>
            a.id === arcId
              ? {
                  ...a,
                  center: rotatePt(a.center),
                  startPoint: a.startPoint ? rotatePt(a.startPoint) : undefined,
                  endPoint: a.endPoint ? rotatePt(a.endPoint) : undefined,
                }
              : a
          )
        );
      } else if (type === 'cylinder') {
        const cylId = idOrData as string;
        setCylindersState((prev) =>
          prev.map((c) => (c.id === cylId ? { ...c, center: rotatePt(c.center) } : c))
        );
      } else if (type === 'sphere') {
        const sphId = idOrData as string;
        setSpheresState((prev) =>
          prev.map((s) => (s.id === sphId ? { ...s, center: rotatePt(s.center) } : s))
        );
      } else if (type === 'face') {
        const face = (idOrData as Face3D) || selectedFaceRef.current;
        if (!face) return;
        const faceVertices = face.vertices;
        setLinesState((prev) =>
          prev.map((l) => {
            const startInFace = matchesAnyPoint(l.start, faceVertices);
            const endInFace = matchesAnyPoint(l.end, faceVertices);
            if (!startInFace && !endInFace) return l;
            return {
              ...l,
              start: startInFace ? rotatePt(l.start) : l.start,
              end: endInFace ? rotatePt(l.end) : l.end,
            };
          })
        );
        setSelectedFace({
          ...face,
          center: rotatePt(face.center),
          vertices: face.vertices.map((v) => rotatePt(v)),
        });
        setSelectedFaces((prev) =>
          prev.map((f) =>
            f.id === face.id || matchesAnyPoint(f.center, [face.center])
              ? {
                  ...f,
                  center: rotatePt(f.center),
                  vertices: f.vertices.map((v) => rotatePt(v)),
                }
              : f
          )
        );
      }
    },
    []
  );

  const scaleEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
      idOrData: any,
      pivot: Point3D,
      scaleFactor: Point3D
    ) => {
      if (scaleFactor.x === 1 && scaleFactor.y === 1 && scaleFactor.z === 1) return;

      const scalePt = (p: Point3D): Point3D => scaleLogicalPoint(p, pivot, scaleFactor);
      const avgScale = (Math.abs(scaleFactor.x) + Math.abs(scaleFactor.y) + Math.abs(scaleFactor.z)) / 3;

      const currentGroups = groupsRef.current;
      const currentLines = linesRef.current;
      const currentArcs = arcsRef.current;
      const currentCyls = cylindersRef.current;
      const currentSphs = spheresRef.current;

      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupModeRef.current && typeof idOrData === 'string'
          ? (currentLines.find((l) => l.id === idOrData)?.groupId ||
             currentArcs.find((a) => a.id === idOrData)?.groupId ||
             currentCyls.find((c) => c.id === idOrData)?.groupId ||
             currentSphs.find((s) => s.id === idOrData)?.groupId ||
             currentGroups.find((g) => g.memberIds.includes(idOrData))?.id)
          : groupModeRef.current && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || currentGroups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      // Group Scaling
      if (type === 'group' || (groupModeRef.current && targetGroupId)) {
        const gid = (type === 'group' ? (idOrData as string) : targetGroupId)!;
        const grp = currentGroups.find((g) => g.id === gid);
        const memberIds = grp ? grp.memberIds : [];

        let planeGroupVerts: Point3D[] = [];
        if (grp?.type === 'plane') {
          currentLines.filter((l) => l.groupId === gid || memberIds.includes(l.id)).forEach((l) => planeGroupVerts.push(l.start, l.end));
          const allFaces = extractFacesFromLines(currentLines, currentArcs);
          const groupFaces = allFaces.filter((f) => memberIds.includes(f.id) || f.groupId === gid);
          planeGroupVerts.push(...groupFaces.flatMap((f) => f.vertices));
          memberIds.filter((mid) => mid.startsWith('face-')).forEach((mid) => {
            const rawKeys = mid.replace(/^face-/, '').split('|');
            rawKeys.forEach((k) => {
              const coords = k.split(',').map(Number);
              if (coords.length >= 3 && !coords.some(isNaN)) {
                planeGroupVerts.push({ x: coords[0], y: coords[1], z: coords[2] });
              }
            });
          });
        }

        let vertexGroupVerts: Point3D[] = [];
        if (grp?.type === 'vertex') {
          vertexGroupVerts = memberIds.map((mid) => {
            const parts = mid.replace(/^v-/, '').split('_').map(Number);
            return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
          });
        }

        const isDirectMember = (id: string, entityGroupId?: string) =>
          entityGroupId === gid || memberIds.includes(id);

        setLinesState((prev) =>
          prev.map((l) => {
            if (isDirectMember(l.id, l.groupId)) {
              return { ...l, start: scalePt(l.start), end: scalePt(l.end), groupId: gid };
            }
            if (planeGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, planeGroupVerts);
              const em = matchesAnyPoint(l.end, planeGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? scalePt(l.start) : l.start,
                  end: em ? scalePt(l.end) : l.end,
                  groupId: gid,
                };
              }
            }
            if (vertexGroupVerts.length > 0) {
              const sm = matchesAnyPoint(l.start, vertexGroupVerts);
              const em = matchesAnyPoint(l.end, vertexGroupVerts);
              if (sm || em) {
                return {
                  ...l,
                  start: sm ? scalePt(l.start) : l.start,
                  end: em ? scalePt(l.end) : l.end,
                };
              }
            }
            return l;
          })
        );
        setArcsState((prev) =>
          prev.map((a) => {
            if (isDirectMember(a.id, a.groupId)) {
              return {
                ...a,
                center: scalePt(a.center),
                radius: Math.max(1, Math.round(a.radius * avgScale)),
                startPoint: a.startPoint ? scalePt(a.startPoint) : undefined,
                endPoint: a.endPoint ? scalePt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            if (planeGroupVerts.length > 0 && matchesAnyPoint(a.center, planeGroupVerts)) {
              return {
                ...a,
                center: scalePt(a.center),
                radius: Math.max(1, Math.round(a.radius * avgScale)),
                startPoint: a.startPoint ? scalePt(a.startPoint) : undefined,
                endPoint: a.endPoint ? scalePt(a.endPoint) : undefined,
                groupId: gid,
              };
            }
            return a;
          })
        );
        setCylindersState((prev) =>
          prev.map((c) =>
            isDirectMember(c.id, c.groupId)
              ? {
                  ...c,
                  center: scalePt(c.center),
                  radius: Math.max(1, Math.round(c.radius * avgScale)),
                  height: Math.max(1, Math.round(c.height * scaleFactor.y)),
                }
              : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            isDirectMember(s.id, s.groupId)
              ? {
                  ...s,
                  center: scalePt(s.center),
                  radius: Math.max(1, Math.round(s.radius * avgScale)),
                }
              : s
          )
        );
        if (grp?.type === 'plane') {
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: scalePt(f.center),
              vertices: f.vertices.map((v) => scalePt(v)),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: scalePt(prev.center),
                  vertices: prev.vertices.map((v) => scalePt(v)),
                }
              : null
          );
        }
        return;
      }

      if (type === 'multi') {
        const selLines = selectedLineIdsRef.current;
        const selArcs = selectedArcIdsRef.current;
        const selCyls = selectedCylinderIdsRef.current;
        const selSphs = selectedSphereIdsRef.current;
        const selVerts = selectedVerticesRef.current;
        const selFaces = selectedFacesRef.current;

        if (selLines.length > 0) {
          setLinesState((prev) =>
            prev.map((l) => (selLines.includes(l.id) ? { ...l, start: scalePt(l.start), end: scalePt(l.end) } : l))
          );
        }
        if (selArcs.length > 0) {
          setArcsState((prev) =>
            prev.map((a) =>
              selArcs.includes(a.id)
                ? {
                    ...a,
                    center: scalePt(a.center),
                    radius: Math.max(1, Math.round(a.radius * avgScale)),
                    startPoint: a.startPoint ? scalePt(a.startPoint) : undefined,
                    endPoint: a.endPoint ? scalePt(a.endPoint) : undefined,
                  }
                : a
            )
          );
        }
        if (selCyls.length > 0) {
          setCylindersState((prev) =>
            prev.map((c) =>
              selCyls.includes(c.id)
                ? {
                    ...c,
                    center: scalePt(c.center),
                    radius: Math.max(1, Math.round(c.radius * avgScale)),
                    height: Math.max(1, Math.round(c.height * scaleFactor.y)),
                  }
                : c
            )
          );
        }
        if (selSphs.length > 0) {
          setSpheresState((prev) =>
            prev.map((s) =>
              selSphs.includes(s.id)
                ? { ...s, center: scalePt(s.center), radius: Math.max(1, Math.round(s.radius * avgScale)) }
                : s
            )
          );
        }
        if (selVerts.length > 0) {
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, selVerts);
              const em = matchesAnyPoint(l.end, selVerts);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? scalePt(l.start) : l.start,
                end: em ? scalePt(l.end) : l.end,
              };
            })
          );
          setSelectedVertices((prev) => prev.map((v) => scalePt(v)));
        }
        if (selFaces.length > 0) {
          const allFaceVertices = selFaces.flatMap((f) => f.vertices);
          setLinesState((prev) =>
            prev.map((l) => {
              const sm = matchesAnyPoint(l.start, allFaceVertices);
              const em = matchesAnyPoint(l.end, allFaceVertices);
              if (!sm && !em) return l;
              return {
                ...l,
                start: sm ? scalePt(l.start) : l.start,
                end: em ? scalePt(l.end) : l.end,
              };
            })
          );
          setSelectedFaces((prev) =>
            prev.map((f) => ({
              ...f,
              center: scalePt(f.center),
              vertices: f.vertices.map((v) => scalePt(v)),
            }))
          );
          setSelectedFace((prev) =>
            prev
              ? {
                  ...prev,
                  center: scalePt(prev.center),
                  vertices: prev.vertices.map((v) => scalePt(v)),
                }
              : null
          );
        }
        return;
      }

      if (type === 'vertex') {
        const targetPt = idOrData as Point3D;
        const matchesPt = (p: Point3D) => matchesAnyPoint(p, [targetPt]);

        setLinesState((prev) =>
          prev.map((l) => {
            const startMatch = matchesPt(l.start);
            const endMatch = matchesPt(l.end);
            if (!startMatch && !endMatch) return l;
            return {
              ...l,
              start: startMatch ? scalePt(l.start) : l.start,
              end: endMatch ? scalePt(l.end) : l.end,
            };
          })
        );
        setSelectedVertex(scalePt(targetPt));
      } else if (type === 'line') {
        const lineId = idOrData as string;
        setLinesState((prev) =>
          prev.map((l) => (l.id === lineId ? { ...l, start: scalePt(l.start), end: scalePt(l.end) } : l))
        );
      } else if (type === 'arc') {
        const arcId = idOrData as string;
        setArcsState((prev) =>
          prev.map((a) =>
            a.id === arcId
              ? {
                  ...a,
                  center: scalePt(a.center),
                  radius: Math.max(1, Math.round(a.radius * avgScale)),
                  startPoint: a.startPoint ? scalePt(a.startPoint) : undefined,
                  endPoint: a.endPoint ? scalePt(a.endPoint) : undefined,
                }
              : a
          )
        );
      } else if (type === 'cylinder') {
        const cylId = idOrData as string;
        setCylindersState((prev) =>
          prev.map((c) =>
            c.id === cylId
              ? {
                  ...c,
                  center: scalePt(c.center),
                  radius: Math.max(1, Math.round(c.radius * avgScale)),
                  height: Math.max(1, Math.round(c.height * scaleFactor.y)),
                }
              : c
          )
        );
      } else if (type === 'sphere') {
        const sphId = idOrData as string;
        setSpheresState((prev) =>
          prev.map((s) =>
            s.id === sphId
              ? {
                  ...s,
                  center: scalePt(s.center),
                  radius: Math.max(1, Math.round(s.radius * avgScale)),
                }
              : s
          )
        );
      } else if (type === 'face') {
        const face = (idOrData as Face3D) || selectedFaceRef.current;
        if (!face) return;
        const faceVertices = face.vertices;
        setLinesState((prev) =>
          prev.map((l) => {
            const startInFace = matchesAnyPoint(l.start, faceVertices);
            const endInFace = matchesAnyPoint(l.end, faceVertices);
            if (!startInFace && !endInFace) return l;
            return {
              ...l,
              start: startInFace ? scalePt(l.start) : l.start,
              end: endInFace ? scalePt(l.end) : l.end,
            };
          })
        );
        setSelectedFace({
          ...face,
          center: scalePt(face.center),
          vertices: face.vertices.map((v) => scalePt(v)),
        });
        setSelectedFaces((prev) =>
          prev.map((f) =>
            f.id === face.id || matchesAnyPoint(f.center, [face.center])
              ? {
                  ...f,
                  center: scalePt(f.center),
                  vertices: f.vertices.map((v) => scalePt(v)),
                }
              : f
          )
        );
      }
    },
    []
  );

  const commitTransform = useCallback(() => {
    pushToHistory(linesRef.current, arcsRef.current, cylindersRef.current, spheresRef.current, groupsRef.current);
  }, [pushToHistory]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      { lines, arcs, cylinders, spheres, groups, faceColors: { ...faceColorsRef.current } },
    ]);
    setLinesState(previous.lines);
    setArcsState(previous.arcs);
    setCylindersState(previous.cylinders || []);
    setSpheresState(previous.spheres || []);
    setGroupsState(previous.groups || []);
    setFaceColors(previous.faceColors || {});
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
    setSelectedLineIds([]);
    setSelectedArcIds([]);
    setSelectedCylinderIds([]);
    setSelectedSphereIds([]);
    setSelectedVertices([]);
    setSelectedFaces([]);
    setSelectionCategory(null);
  }, [undoStack, lines, arcs, cylinders, spheres, groups]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      { lines, arcs, cylinders, spheres, groups, faceColors: { ...faceColorsRef.current } },
    ]);
    setLinesState(next.lines);
    setArcsState(next.arcs);
    setCylindersState(next.cylinders || []);
    setSpheresState(next.spheres || []);
    setGroupsState(next.groups || []);
    setFaceColors(next.faceColors || {});
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
    setSelectedLineIds([]);
    setSelectedArcIds([]);
    setSelectedCylinderIds([]);
    setSelectedSphereIds([]);
    setSelectedVertices([]);
    setSelectedFaces([]);
    setSelectionCategory(null);
  }, [redoStack, lines, arcs, cylinders, spheres, groups]);

  const setViewport = useCallback((updates: Partial<ViewportTransform>) => {
    setViewportState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setGridSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetCanvas = useCallback(() => {
    pushToHistory(lines, arcs, cylinders, spheres, groups, faceColorsRef.current);
    setLinesState([]);
    setArcsState([]);
    setCylindersState([]);
    setSpheresState([]);
    setGroupsState([]);
    setFaceColors({});
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
    setSelectedLineIds([]);
    setSelectedArcIds([]);
    setSelectedCylinderIds([]);
    setSelectedSphereIds([]);
    setSelectedVertices([]);
    setSelectedFaces([]);
    setSelectionCategory(null);
    setActiveAnchor(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, [lines, arcs, cylinders, spheres, groups, pushToHistory]);

  const updateSelectedPlaneColor = useCallback(
    (color: string) => {
      pushToHistory(
        linesRef.current,
        arcsRef.current,
        cylindersRef.current,
        spheresRef.current,
        groupsRef.current,
        faceColorsRef.current
      );

      const targetFaceIds: string[] = [];
      const targetFaceVerts: Point3D[] = [];

      if (selectedFace) {
        targetFaceIds.push(selectedFace.id);
        targetFaceVerts.push(...selectedFace.vertices);
      }
      if (selectedFaces.length > 0) {
        selectedFaces.forEach((f) => {
          targetFaceIds.push(f.id);
          targetFaceVerts.push(...f.vertices);
        });
      }

      // If active group is a plane group, also color the group and all member planes
      if (selectedGroupId) {
        const grp = groupsRef.current.find((g) => g.id === selectedGroupId);
        if (grp?.type === 'plane') {
          targetFaceIds.push(...grp.memberIds.filter((mid) => mid.startsWith('face-')));
          setGroupsState((prev) =>
            prev.map((g) => (g.id === selectedGroupId ? { ...g, color } : g))
          );
        }
      }

      // Update faceColors dictionary
      setFaceColors((prev) => {
        const next = { ...prev };
        targetFaceIds.forEach((fid) => {
          next[fid] = color;
        });
        return next;
      });

      // Update selected face states
      setSelectedFace((prev) => (prev ? { ...prev, color } : null));
      setSelectedFaces((prev) => prev.map((f) => ({ ...f, color })));

      // Tag member lines with faceColor so color persists through transforms & JSON exports
      if (targetFaceVerts.length > 0) {
        setLinesState((prev) =>
          prev.map((l) => {
            if (matchesAnyPoint(l.start, targetFaceVerts) && matchesAnyPoint(l.end, targetFaceVerts)) {
              return {
                ...l,
                style: {
                  ...l.style,
                  faceColor: color,
                },
              };
            }
            return l;
          })
        );
      }
    },
    [selectedFace, selectedFaces, selectedGroupId, pushToHistory]
  );

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
      setCylindersState((prev) => prev.filter((c) => c.layerId !== layerId));
      setSpheresState((prev) => prev.filter((s) => s.layerId !== layerId));
      if (activeLayerId === layerId) {
        const remaining = layers.filter((ly) => ly.id !== layerId);
        setActiveLayerId(remaining[0].id);
      }
    },
    [layers, activeLayerId]
  );

  const selectedLine = lines.find((l) => l.id === selectedLineId) || null;
  const selectedSphere = spheres.find((s) => s.id === selectedSphereId) || null;
  const selectedCylinder = cylinders.find((c) => c.id === selectedCylinderId) || null;
  const selectedArc = arcs.find((a) => a.id === selectedArcId) || null;
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
    selectedArc,
    cylinders,
    setCylindersState,
    setCylinders,
    addCylinder,
    updateCylinder,
    removeCylinder,
    selectedCylinderId,
    setSelectedCylinderId,
    selectedCylinder,
    spheres,
    setSpheresState,
    setSpheres,
    addSphere,
    updateSphere,
    removeSphere,
    selectedSphereId,
    setSelectedSphereId,
    selectedSphere,
    groups,
    setGroups,
    selectedGroupId,
    setSelectedGroupId,
    groupMode,
    setGroupMode,
    createGroup,
    ungroup,
    createGroupFromSelection,
    selectGroup,
    deleteGroupAndMembers,
    renameGroup,
    selectedLineIds,
    setSelectedLineIds,
    selectedArcIds,
    setSelectedArcIds,
    selectedCylinderIds,
    setSelectedCylinderIds,
    selectedSphereIds,
    setSelectedSphereIds,
    selectedVertices,
    setSelectedVertices,
    selectedFaces,
    setSelectedFaces,
    selectionCategory,
    setSelectionCategory,
    toggleSelectVertex,
    toggleSelectEdge,
    toggleSelectFace,
    toggleSelectMesh,
    clearSelection,
    selectAll,
    isPerspective,
    setIsPerspective,
    togglePerspective,
    gizmoMode,
    setGizmoMode,
    translateEntity,
    rotateEntity,
    scaleEntity,
    commitTransform,
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
    theme,
    toggleTheme,
    setTheme: setAppTheme,
    faceColors,
    setFaceColors,
    updateSelectedPlaneColor,
  };
}
