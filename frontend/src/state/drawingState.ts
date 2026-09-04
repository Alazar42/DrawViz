import { useState, useEffect, useCallback } from 'react';
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
  spheres: DrawingSphere[];
  groups: EntityGroup[];
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
  const [spheres, setSpheresState] = useState<DrawingSphere[]>([]);
  const [groups, setGroupsState] = useState<EntityGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<boolean>(true); // Transform group as one unit when grouped

  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedCylinderId, setSelectedCylinderId] = useState<string | null>(null);
  const [selectedSphereId, setSelectedSphereId] = useState<string | null>(null);

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

  // Keyboard shortcut listener for Blender-style 1, 2, 3 modes & G, R, S gizmo modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
      currentGroups: EntityGroup[] = groups
    ) => {
      setUndoStack((prev) => [
        ...prev.slice(-30),
        {
          lines: currentLines,
          arcs: currentArcs,
          cylinders: currentCylinders,
          spheres: currentSpheres,
          groups: currentGroups,
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

  // Group Management (Planes with Planes, Edges with Edges, Vertices with Vertices)
  const createGroup = useCallback(
    (name: string, type: GroupType, memberIds: string[]): string => {
      const newGroupId = `group-${type}-${Date.now()}`;
      const newGroup: EntityGroup = {
        id: newGroupId,
        name,
        type,
        memberIds,
      };

      pushToHistory(lines, arcs, cylinders, spheres, groups);

      setGroupsState((prev) => [...prev, newGroup]);

      // Tag members with groupId
      setLinesState((prev) =>
        prev.map((l) => (memberIds.includes(l.id) ? { ...l, groupId: newGroupId } : l))
      );
      setArcsState((prev) =>
        prev.map((a) => (memberIds.includes(a.id) ? { ...a, groupId: newGroupId } : a))
      );
      setCylindersState((prev) =>
        prev.map((c) => (memberIds.includes(c.id) ? { ...c, groupId: newGroupId } : c))
      );
      setSpheresState((prev) =>
        prev.map((s) => (memberIds.includes(s.id) ? { ...s, groupId: newGroupId } : s))
      );

      setSelectedGroupId(newGroupId);
      return newGroupId;
    },
    [lines, arcs, cylinders, spheres, groups, pushToHistory]
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

  // Realtime Live Translation & Transform Action
  const translateEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group',
      idOrData: any,
      delta: Point3D
    ) => {
      if (delta.x === 0 && delta.y === 0 && delta.z === 0) return;

      // Group Translation: Move all members of a group together
      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupMode && typeof idOrData === 'string'
          ? (lines.find((l) => l.id === idOrData)?.groupId ||
             arcs.find((a) => a.id === idOrData)?.groupId ||
             cylinders.find((c) => c.id === idOrData)?.groupId ||
             spheres.find((s) => s.id === idOrData)?.groupId)
          : groupMode && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || groups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      if (targetGroupId) {
        setLinesState((prev) =>
          prev.map((l) =>
            l.groupId === targetGroupId
              ? {
                  ...l,
                  start: { x: l.start.x + delta.x, y: l.start.y + delta.y, z: (l.start.z || 0) + delta.z },
                  end: { x: l.end.x + delta.x, y: l.end.y + delta.y, z: (l.end.z || 0) + delta.z },
                }
              : l
          )
        );
        setArcsState((prev) =>
          prev.map((a) =>
            a.groupId === targetGroupId
              ? {
                  ...a,
                  center: { x: a.center.x + delta.x, y: a.center.y + delta.y, z: (a.center.z || 0) + delta.z },
                  startPoint: a.startPoint
                    ? { x: a.startPoint.x + delta.x, y: a.startPoint.y + delta.y, z: (a.startPoint.z || 0) + delta.z }
                    : undefined,
                  endPoint: a.endPoint
                    ? { x: a.endPoint.x + delta.x, y: a.endPoint.y + delta.y, z: (a.endPoint.z || 0) + delta.z }
                    : undefined,
                }
              : a
          )
        );
        setCylindersState((prev) =>
          prev.map((c) =>
            c.groupId === targetGroupId
              ? { ...c, center: { x: c.center.x + delta.x, y: c.center.y + delta.y, z: (c.center.z || 0) + delta.z } }
              : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            s.groupId === targetGroupId
              ? { ...s, center: { x: s.center.x + delta.x, y: s.center.y + delta.y, z: (s.center.z || 0) + delta.z } }
              : s
          )
        );
        return;
      }

      if (type === 'vertex') {
        const targetPt = idOrData as Point3D;
        const matchesPt = (p: Point3D) => p.x === targetPt.x && p.y === targetPt.y && (p.z || 0) === (targetPt.z || 0);

        setLinesState((prev) =>
          prev.map((l) => {
            const startMatch = matchesPt(l.start);
            const endMatch = matchesPt(l.end);
            if (!startMatch && !endMatch) return l;
            return {
              ...l,
              start: startMatch
                ? { x: l.start.x + delta.x, y: l.start.y + delta.y, z: (l.start.z || 0) + delta.z }
                : l.start,
              end: endMatch
                ? { x: l.end.x + delta.x, y: l.end.y + delta.y, z: (l.end.z || 0) + delta.z }
                : l.end,
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
              startPoint: p1Match
                ? { x: a.startPoint!.x + delta.x, y: a.startPoint!.y + delta.y, z: (a.startPoint!.z || 0) + delta.z }
                : a.startPoint,
              endPoint: p2Match
                ? { x: a.endPoint!.x + delta.x, y: a.endPoint!.y + delta.y, z: (a.endPoint!.z || 0) + delta.z }
                : a.endPoint,
            };
          })
        );
        setSelectedVertex({
          x: targetPt.x + delta.x,
          y: targetPt.y + delta.y,
          z: (targetPt.z || 0) + delta.z,
        });
      } else if (type === 'line') {
        const lineId = idOrData as string;
        setLinesState((prev) =>
          prev.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  start: { x: l.start.x + delta.x, y: l.start.y + delta.y, z: (l.start.z || 0) + delta.z },
                  end: { x: l.end.x + delta.x, y: l.end.y + delta.y, z: (l.end.z || 0) + delta.z },
                }
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
                  center: { x: a.center.x + delta.x, y: a.center.y + delta.y, z: (a.center.z || 0) + delta.z },
                  startPoint: a.startPoint
                    ? { x: a.startPoint.x + delta.x, y: a.startPoint.y + delta.y, z: (a.startPoint.z || 0) + delta.z }
                    : undefined,
                  endPoint: a.endPoint
                    ? { x: a.endPoint.x + delta.x, y: a.endPoint.y + delta.y, z: (a.endPoint.z || 0) + delta.z }
                    : undefined,
                }
              : a
          )
        );
      } else if (type === 'cylinder') {
        const cylId = idOrData as string;
        setCylindersState((prev) =>
          prev.map((c) =>
            c.id === cylId
              ? { ...c, center: { x: c.center.x + delta.x, y: c.center.y + delta.y, z: (c.center.z || 0) + delta.z } }
              : c
          )
        );
      } else if (type === 'sphere') {
        const sphId = idOrData as string;
        setSpheresState((prev) =>
          prev.map((s) =>
            s.id === sphId
              ? { ...s, center: { x: s.center.x + delta.x, y: s.center.y + delta.y, z: (s.center.z || 0) + delta.z } }
              : s
          )
        );
      } else if (type === 'face') {
        const face = idOrData as Face3D;
        const faceVertices = face.vertices;
        const matchesFaceVertex = (p: Point3D) =>
          faceVertices.some((fv) => fv.x === p.x && fv.y === p.y && (fv.z || 0) === (p.z || 0));

        setLinesState((prev) =>
          prev.map((l) => {
            const startInFace = matchesFaceVertex(l.start);
            const endInFace = matchesFaceVertex(l.end);
            if (!startInFace && !endInFace) return l;
            return {
              ...l,
              start: startInFace
                ? { x: l.start.x + delta.x, y: l.start.y + delta.y, z: (l.start.z || 0) + delta.z }
                : l.start,
              end: endInFace
                ? { x: l.end.x + delta.x, y: l.end.y + delta.y, z: (l.end.z || 0) + delta.z }
                : l.end,
            };
          })
        );
        setSelectedFace({
          ...face,
          center: { x: face.center.x + delta.x, y: face.center.y + delta.y, z: face.center.z + delta.z },
          vertices: face.vertices.map((v) => ({ x: v.x + delta.x, y: v.y + delta.y, z: (v.z || 0) + delta.z })),
          elevation: face.elevation + (face.plane === 'top' ? delta.z : face.plane === 'front' ? delta.y : delta.x),
        });
      }
    },
    [groupMode, lines, arcs, cylinders, spheres]
  );

  const rotateEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group',
      idOrData: any,
      pivot: Point3D,
      eulerRad: Point3D
    ) => {
      if (eulerRad.x === 0 && eulerRad.y === 0 && eulerRad.z === 0) return;

      const cosX = Math.cos(eulerRad.x), sinX = Math.sin(eulerRad.x);
      const cosY = Math.cos(eulerRad.y), sinY = Math.sin(eulerRad.y);
      const cosZ = Math.cos(eulerRad.z), sinZ = Math.sin(eulerRad.z);

      const rotatePt = (p: Point3D): Point3D => {
        const x = p.x - pivot.x;
        const y = p.y - pivot.y;
        const z = (p.z || 0) - (pivot.z || 0);

        // Rotate Z
        const x1 = x * cosZ - y * sinZ;
        const y1 = x * sinZ + y * cosZ;
        const z1 = z;

        // Rotate Y
        const x2 = x1 * cosY + z1 * sinY;
        const y2 = y1;
        const z2 = -x1 * sinY + z1 * cosY;

        // Rotate X
        const x3 = x2;
        const y3 = y2 * cosX - z2 * sinX;
        const z3 = y2 * sinX + z2 * cosX;

        return {
          x: Math.round(x3 + pivot.x),
          y: Math.round(y3 + pivot.y),
          z: Math.round(z3 + (pivot.z || 0)),
        };
      };

      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupMode && typeof idOrData === 'string'
          ? (lines.find((l) => l.id === idOrData)?.groupId ||
             arcs.find((a) => a.id === idOrData)?.groupId ||
             cylinders.find((c) => c.id === idOrData)?.groupId ||
             spheres.find((s) => s.id === idOrData)?.groupId)
          : groupMode && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || groups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      if (targetGroupId) {
        setLinesState((prev) =>
          prev.map((l) =>
            l.groupId === targetGroupId
              ? { ...l, start: rotatePt(l.start), end: rotatePt(l.end) }
              : l
          )
        );
        setArcsState((prev) =>
          prev.map((a) =>
            a.groupId === targetGroupId
              ? {
                  ...a,
                  center: rotatePt(a.center),
                  startPoint: a.startPoint ? rotatePt(a.startPoint) : undefined,
                  endPoint: a.endPoint ? rotatePt(a.endPoint) : undefined,
                }
              : a
          )
        );
        setCylindersState((prev) =>
          prev.map((c) =>
            c.groupId === targetGroupId
              ? { ...c, center: rotatePt(c.center) }
              : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            s.groupId === targetGroupId
              ? { ...s, center: rotatePt(s.center) }
              : s
          )
        );
        return;
      }

      if (type === 'line') {
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
      }
    },
    [groupMode, lines, arcs, cylinders, spheres, groups]
  );

  const scaleEntity = useCallback(
    (
      type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group',
      idOrData: any,
      pivot: Point3D,
      scaleFactor: Point3D
    ) => {
      if (scaleFactor.x === 1 && scaleFactor.y === 1 && scaleFactor.z === 1) return;

      const scalePt = (p: Point3D): Point3D => ({
        x: Math.round(pivot.x + (p.x - pivot.x) * scaleFactor.x),
        y: Math.round(pivot.y + (p.y - pivot.y) * scaleFactor.y),
        z: Math.round((pivot.z || 0) + ((p.z || 0) - (pivot.z || 0)) * scaleFactor.z),
      });
      const avgScale = (Math.abs(scaleFactor.x) + Math.abs(scaleFactor.y) + Math.abs(scaleFactor.z)) / 3;

      const targetGroupId =
        type === 'group'
          ? (idOrData as string)
          : groupMode && typeof idOrData === 'string'
          ? (lines.find((l) => l.id === idOrData)?.groupId ||
             arcs.find((a) => a.id === idOrData)?.groupId ||
             cylinders.find((c) => c.id === idOrData)?.groupId ||
             spheres.find((s) => s.id === idOrData)?.groupId)
          : groupMode && type === 'face' && idOrData
          ? ((idOrData as Face3D).groupId || groups.find((g) => g.type === 'plane' && g.memberIds.includes((idOrData as Face3D).id))?.id)
          : null;

      if (targetGroupId) {
        setLinesState((prev) =>
          prev.map((l) =>
            l.groupId === targetGroupId
              ? { ...l, start: scalePt(l.start), end: scalePt(l.end) }
              : l
          )
        );
        setArcsState((prev) =>
          prev.map((a) =>
            a.groupId === targetGroupId
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
        setCylindersState((prev) =>
          prev.map((c) =>
            c.groupId === targetGroupId
              ? {
                  ...c,
                  center: scalePt(c.center),
                  radius: Math.max(1, Math.round(c.radius * avgScale)),
                  height: Math.max(1, Math.round(c.height * scaleFactor.z)),
                }
              : c
          )
        );
        setSpheresState((prev) =>
          prev.map((s) =>
            s.groupId === targetGroupId
              ? {
                  ...s,
                  center: scalePt(s.center),
                  radius: Math.max(1, Math.round(s.radius * avgScale)),
                }
              : s
          )
        );
        return;
      }

      if (type === 'line') {
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
                  height: Math.max(1, Math.round(c.height * scaleFactor.z)),
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
      }
    },
    [groupMode, lines, arcs, cylinders, spheres, groups]
  );

  const commitTransform = useCallback(() => {
    pushToHistory(lines, arcs, cylinders, spheres, groups);
  }, [lines, arcs, cylinders, spheres, groups, pushToHistory]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      { lines, arcs, cylinders, spheres, groups },
    ]);
    setLinesState(previous.lines);
    setArcsState(previous.arcs);
    setCylindersState(previous.cylinders || []);
    setSpheresState(previous.spheres || []);
    setGroupsState(previous.groups || []);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
  }, [undoStack, lines, arcs, cylinders, spheres, groups]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      { lines, arcs, cylinders, spheres, groups },
    ]);
    setLinesState(next.lines);
    setArcsState(next.arcs);
    setCylindersState(next.cylinders || []);
    setSpheresState(next.spheres || []);
    setGroupsState(next.groups || []);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
  }, [redoStack, lines, arcs, cylinders, spheres, groups]);

  const setViewport = useCallback((updates: Partial<ViewportTransform>) => {
    setViewportState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setGridSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetCanvas = useCallback(() => {
    pushToHistory(lines, arcs, cylinders, spheres, groups);
    setLinesState([]);
    setArcsState([]);
    setCylindersState([]);
    setSpheresState([]);
    setGroupsState([]);
    setSelectedLineId(null);
    setSelectedArcId(null);
    setSelectedCylinderId(null);
    setSelectedSphereId(null);
    setSelectedVertex(null);
    setSelectedFace(null);
    setActiveAnchor(null);
  }, [lines, arcs, cylinders, spheres, groups, pushToHistory]);

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
    selectedGroupId,
    setSelectedGroupId,
    groupMode,
    setGroupMode,
    createGroup,
    ungroup,
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
  };
}
