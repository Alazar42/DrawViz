import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  DrawingLine,
  DrawingArc,
  DrawingCylinder,
  DrawingSphere,
  EntityGroup,
  Point3D,
  ScreenPoint,
  ToolType,
  GridSettings,
  SelectionMode,
  Face3D,
  AlignmentMode,
  ArcBulgeDirection,
  AppTheme,
} from '../types/drawing';
import { IsoplaneType } from '../geometry/isometric';
import { CursorState, matchesAnyPoint } from '../state/drawingState';
import { cursorStore } from '../state/cursorStore';
import { extractFacesFromLines } from '../geometry/faces';
import {
  getArcPoints,
  getArc3DPoints,
  getTwoPointArcPoints,
  getCylinderGeometryData,
  logicalToThreeNormal,
  threeToLogicalNormal,
  calculateFaceNormalThree,
} from '../geometry/circle3d';
import {
  Layers,
  RotateCcw,
  Sparkles,
  Square,
  Minus,
  Dot,
  Magnet,
  Maximize2,
  Box,
  ChevronDown,
  ChevronUp,
  Check,
  RefreshCw,
  MousePointer,
  PenLine,
  Circle,
  Disc,
  Cylinder,
  Eraser,
  Hand,
  ZoomIn,
  Move,
  RotateCw,
  Scaling,
} from 'lucide-react';

interface Three3DCanvasProps {
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  cylinders?: DrawingCylinder[];
  spheres?: DrawingSphere[];
  activeLayerId: string;
  selectedLineId: string | null;
  selectedArcId?: string | null;
  selectedCylinderId?: string | null;
  selectedSphereId?: string | null;
  selectedVertex?: Point3D | null;
  selectedFace?: Face3D | null;
  selectionMode?: SelectionMode;
  activeTool: ToolType;
  onSelectTool?: (tool: ToolType) => void;
  gridSettings: GridSettings;
  activeAnchor: Point3D | null;
  activeElevation?: number;
  activeIsoplane?: IsoplaneType;
  onSelectLine: (id: string | null) => void;
  onSelectArc?: (id: string | null) => void;
  onSelectCylinder?: (id: string | null) => void;
  onSelectSphere?: (id: string | null) => void;
  onSelectVertex?: (pt: Point3D | null) => void;
  onSelectFace?: (face: Face3D | null) => void;
  onSetSelectionMode?: (mode: SelectionMode) => void;
  onAddLine: (line: DrawingLine) => void;
  onAddArc?: (arc: DrawingArc) => void;
  onAddCylinder?: (cylinder: DrawingCylinder) => void;
  onAddSphere?: (sphere: DrawingSphere) => void;
  onUpdateArc?: (arc: DrawingArc) => void;
  onUpdateCylinder?: (cylinder: DrawingCylinder) => void;
  onUpdateSphere?: (sphere: DrawingSphere) => void;
  onRemoveLine: (id: string) => void;
  onRemoveArc?: (id: string) => void;
  onRemoveCylinder?: (id: string) => void;
  onRemoveSphere?: (id: string) => void;
  onSetAnchor: (anchor: Point3D | null) => void;
  onCursorUpdate?: (state: CursorState) => void;
  onSetElevation?: (elevation: number) => void;
  onSetIsoplane?: (isoplane: IsoplaneType) => void;
  theme?: AppTheme;
  onToggleTheme?: () => void;
  onSetTheme?: (theme: AppTheme) => void;
  onOpenSettings?: () => void;
  onTranslateEntity?: (
    type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
    idOrData: any,
    delta: Point3D
  ) => void;
  onRotateEntity?: (
    type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
    idOrData: any,
    pivot: Point3D,
    eulerRad: Point3D
  ) => void;
  onScaleEntity?: (
    type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group' | 'multi',
    idOrData: any,
    pivot: Point3D,
    scaleFactor: Point3D
  ) => void;
  gizmoMode?: 'translate' | 'rotate' | 'scale';
  onSetGizmoMode?: (mode: 'translate' | 'rotate' | 'scale') => void;
  onCommitTransform?: () => void;
  groupMode?: boolean;
  groups?: EntityGroup[];
  selectedGroupId?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
  selectedLineIds?: string[];
  selectedArcIds?: string[];
  selectedCylinderIds?: string[];
  selectedSphereIds?: string[];
  selectedVertices?: Point3D[];
  selectedFaces?: Face3D[];
  selectionCategory?: 'vertex' | 'edge' | 'plane' | 'mesh' | null;
  onToggleSelectVertex?: (pt: Point3D | null, multi: boolean) => void;
  onToggleSelectEdge?: (type: 'line' | 'arc', id: string | null, multi: boolean) => void;
  onToggleSelectFace?: (face: Face3D | null, multi: boolean) => void;
  onToggleSelectMesh?: (type: 'cylinder' | 'sphere', id: string | null, multi: boolean) => void;
  onClearSelection?: () => void;
  onCreateGroupFromSelection?: (name?: string) => string | null;
  isPerspective?: boolean;
  onTogglePerspective?: () => void;
}

// Reusable math objects for zero garbage collection
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _mouseVec = new THREE.Vector2();
const _draftingPlane = new THREE.Plane();
const _intersectPt = new THREE.Vector3();
const _rotMatrix = new THREE.Matrix4();
const _gizmoVx = new THREE.Vector3();
const _gizmoVy = new THREE.Vector3();
const _gizmoVz = new THREE.Vector3();

// Convert DrawViz logical (X, Y: depth, Z: height) to Three.js world space:
// X_three = X_logical, Y_three = Z_logical (Up), Z_three = Y_logical (Depth)
function logicalToThree(pt: Point3D): THREE.Vector3 {
  return new THREE.Vector3(pt.x, pt.z || 0, pt.y);
}

function threeToLogical(v: THREE.Vector3): Point3D {
  return {
    x: Math.round(v.x),
    y: Math.round(v.z),
    z: Math.round(v.y),
  };
}

export type CameraPreset = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left' | 'free';

export const Three3DCanvas: React.FC<Three3DCanvasProps> = memo(({
  lines,
  arcs = [],
  cylinders = [],
  spheres = [],
  activeLayerId,
  selectedLineId,
  selectedArcId = null,
  selectedCylinderId = null,
  selectedSphereId = null,
  selectedVertex = null,
  selectedFace = null,
  selectedLineIds = [],
  selectedArcIds = [],
  selectedCylinderIds = [],
  selectedSphereIds = [],
  selectedVertices = [],
  selectedFaces = [],
  selectionCategory = null,
  selectionMode = 'edge',
  activeTool,
  onSelectTool,
  gridSettings,
  activeAnchor,
  activeElevation = 0,
  activeIsoplane = 'top',
  onSelectLine,
  onSelectArc,
  onSelectCylinder,
  onSelectSphere,
  onSelectVertex,
  onSelectFace,
  onToggleSelectVertex,
  onToggleSelectEdge,
  onToggleSelectFace,
  onToggleSelectMesh,
  onClearSelection,
  onCreateGroupFromSelection,
  onSetSelectionMode,
  onAddLine,
  onAddArc,
  onAddCylinder,
  onAddSphere,
  onUpdateArc,
  onUpdateCylinder,
  onUpdateSphere,
  onRemoveLine,
  onRemoveArc,
  onRemoveCylinder,
  onRemoveSphere,
  onSetAnchor,
  onCursorUpdate,
  onSetElevation,
  onSetIsoplane,
  theme = 'light',
  onToggleTheme,
  onSetTheme,
  onOpenSettings,
  onTranslateEntity,
  onRotateEntity,
  onScaleEntity,
  gizmoMode = 'translate',
  onSetGizmoMode,
  onCommitTransform,
  groupMode = true,
  groups = [],
  selectedGroupId = null,
  onSelectGroup,
  isPerspective: propIsPerspective,
  onTogglePerspective,
}) => {
  const isDark = theme === 'dark';
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 3D Transform Gizmo Container & Controls (CAD/Blender Grade)
  const transformGroupRef = useRef<THREE.Group>(new THREE.Group());
  const pivotMeshRef = transformGroupRef as unknown as React.MutableRefObject<THREE.Mesh>;
  const transformControlsRef = useRef<TransformControls | null>(null);
  const axisGuideLineRef = useRef<THREE.Line | null>(null);

  // Selection & Callback Refs for 1:1 zero-lag gizmo interaction
  const selectedVertexRef = useRef(selectedVertex);
  selectedVertexRef.current = selectedVertex;
  const selectedLineIdRef = useRef(selectedLineId);
  selectedLineIdRef.current = selectedLineId;
  const selectedArcIdRef = useRef(selectedArcId);
  selectedArcIdRef.current = selectedArcId;
  const selectedCylinderIdRef = useRef(selectedCylinderId);
  selectedCylinderIdRef.current = selectedCylinderId;
  const selectedSphereIdRef = useRef(selectedSphereId);
  selectedSphereIdRef.current = selectedSphereId;
  const selectedFaceRef = useRef(selectedFace);
  selectedFaceRef.current = selectedFace;

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

  const multiCount =
    selectedLineIds.length +
    selectedArcIds.length +
    selectedCylinderIds.length +
    selectedSphereIds.length +
    selectedVertices.length +
    selectedFaces.length;
  const multiCountRef = useRef(multiCount);
  multiCountRef.current = multiCount;

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
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const selectedGroupIdRef = useRef(selectedGroupId);
  selectedGroupIdRef.current = selectedGroupId;

  const onTranslateEntityRef = useRef(onTranslateEntity);
  onTranslateEntityRef.current = onTranslateEntity;
  const onRotateEntityRef = useRef(onRotateEntity);
  onRotateEntityRef.current = onRotateEntity;
  const onScaleEntityRef = useRef(onScaleEntity);
  onScaleEntityRef.current = onScaleEntity;
  const onCommitTransformRef = useRef(onCommitTransform);
  onCommitTransformRef.current = onCommitTransform;

  // Live Drag state
  const isDraggingRef = useRef(false);
  const dragStartPivotPos = useRef(new THREE.Vector3());
  const dragStartPivotRot = useRef(new THREE.Euler());
  const dragStartPivotScale = useRef(new THREE.Vector3(1, 1, 1));
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Blender Modal Transform state: 'translate' (G), 'rotate' (R), 'scale' (S)
  const [modalTransform, setModalTransform] = useState<{
    active: boolean;
    mode: 'translate' | 'rotate' | 'scale';
    axisLock: 'X' | 'Y' | 'Z' | null;
  }>({
    active: false,
    mode: 'translate',
    axisLock: null,
  });

  const modalStartRef = useRef<{
    mousePos: { x: number; y: number };
    startPivotPos: THREE.Vector3;
    startPivotRot: THREE.Euler;
    startPivotScale: THREE.Vector3;
    axisLock: 'X' | 'Y' | 'Z' | null;
  }>({
    mousePos: { x: 0, y: 0 },
    startPivotPos: new THREE.Vector3(),
    startPivotRot: new THREE.Euler(),
    startPivotScale: new THREE.Vector3(1, 1, 1),
    axisLock: null,
  });
  const modalTransformRef = useRef(modalTransform);
  modalTransformRef.current = modalTransform;

  const hasSelectionRef = useRef(false);
  hasSelectionRef.current = !!(
    selectedLineId ||
    selectedArcId ||
    selectedCylinderId ||
    selectedSphereId ||
    selectedVertex ||
    selectedFace ||
    selectedLineIds.length > 0 ||
    selectedArcIds.length > 0 ||
    selectedCylinderIds.length > 0 ||
    selectedSphereIds.length > 0 ||
    selectedVertices.length > 0 ||
    selectedFaces.length > 0
  );

  // Live Transform HUD overlay state
  const [liveTransformHud, setLiveTransformHud] = useState<{
    visible: boolean;
    mode: 'translate' | 'rotate' | 'scale';
    dx: number;
    dy: number;
    dz: number;
    angle?: number;
    scale?: number;
  }>({
    visible: false,
    mode: 'translate',
    dx: 0,
    dy: 0,
    dz: 0,
    angle: 0,
    scale: 1,
  });

  // Dynamic 3D Scene Groups
  const geometryGroupRef = useRef<THREE.Group>(new THREE.Group());
  const facesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const gridGroupRef = useRef<THREE.Group>(new THREE.Group());
  const previewGroupRef = useRef<THREE.Group>(new THREE.Group());
  const hoverGroupRef = useRef<THREE.Group>(new THREE.Group());
  const selectionHighlightGroupRef = useRef<THREE.Group>(new THREE.Group());

  // Cursor & Snap Indicators in 3D
  const cursorMarkerRef = useRef<THREE.Mesh | null>(null);
  const vertexSnapRingRef = useRef<THREE.Mesh | null>(null);
  const edgeSnapMarkerRef = useRef<THREE.Mesh | null>(null);
  const midpointSnapMarkerRef = useRef<THREE.Mesh | null>(null);

  // Extracted Faces storage for Raycasting & "Sketch on Face"
  const extractedFacesRef = useRef<Face3D[]>([]);

  // Viewport State
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [isPerspective, setIsPerspective] = useState<boolean>(false);
  const [solidShading, setSolidShading] = useState<boolean>(true);
  const [magnetSnapEnabled, setMagnetSnapEnabled] = useState<boolean>(true);
  const [snapModes, setSnapModes] = useState<{
    vertex: boolean;
    midpoint: boolean;
    edge: boolean;
    face: boolean;
    grid: boolean;
  }>({
    vertex: true,
    midpoint: true,
    edge: true,
    face: true,
    grid: true,
  });

  // Direct DOM refs for zero-overhead updates
  const tooltipRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  // Active Anchor & Pointer Position Refs
  const activeAnchorRef = useRef<Point3D | null>(activeAnchor);
  activeAnchorRef.current = activeAnchor;

  const activeElevationRef = useRef<number>(activeElevation);
  activeElevationRef.current = activeElevation;

  const pointerDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);

  const currentSnapRef = useRef<{
    logical: Point3D;
    screen: ScreenPoint;
    type: 'vertex' | 'midpoint' | 'edge' | 'face' | 'grid';
    lineId?: string | null;
    arcId?: string | null;
    faceData?: Face3D | null;
    sphereData?: DrawingSphere | null;
    cylinderData?: DrawingCylinder | null;
  } | null>(null);

  // Normal alignment for circles, half arcs, and cylinders on inclined planes
  const activeNormalRef = useRef<Point3D>({ x: 0, y: 0, z: 1 });
  // Multi-step cylinder drafting: 0 = idle, 1 = radius, 2 = height
  const cylinderDraftRef = useRef<{
    step: 0 | 1 | 2;
    center: Point3D | null;
    radius: number;
    normal: Point3D;
  }>({
    step: 0,
    center: null,
    radius: 5,
    normal: { x: 0, y: 0, z: 1 },
  });

  // Blender-style Orientation & Operator Control (Full User Control)
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>('world-z');
  const [activeBulgeDir, setActiveBulgeDir] = useState<ArcBulgeDirection>('+z');
  const [lastCreatedEntity, setLastCreatedEntity] = useState<{
    type: 'circle' | 'arc' | 'cylinder';
    id: string;
    radius: number;
    height?: number;
    normal: Point3D;
    alignmentMode: AlignmentMode;
    center: Point3D;
    startAngle?: number;
    endAngle?: number;
    startPoint?: Point3D;
    endPoint?: Point3D;
    bulgeDir?: ArcBulgeDirection;
    chordDistance?: number;
  } | null>(null);
  const [isOperatorOpen, setIsOperatorOpen] = useState<boolean>(true);

  // Blender-style Alignment Normal Resolver
  const getDraftingNormal = useCallback(
    (mode: AlignmentMode, snapPt?: Point3D, faceData?: Face3D | null): Point3D => {
      if (mode === 'world-z') {
        return { x: 0, y: 0, z: 1 };
      }
      if (mode === 'world-y') {
        return { x: 0, y: 1, z: 0 };
      }
      if (mode === 'world-x') {
        return { x: 1, y: 0, z: 0 };
      }
      if (mode === 'view') {
        const cam = activeCameraRef.current;
        if (cam) {
          const dir = new THREE.Vector3();
          cam.getWorldDirection(dir);
          return threeToLogicalNormal(dir.negate());
        }
        return { x: 0, y: 0, z: 1 };
      }
      if (mode === 'surface') {
        if (faceData) {
          return faceData.normal;
        }
        if (snapPt) {
          const face = extractedFacesRef.current.find((f) =>
            f.vertices.some(
              (v) =>
                Math.hypot(v.x - snapPt.x, v.y - snapPt.y, (v.z || 0) - (snapPt.z || 0)) < 0.2
            )
          );
          if (face) return face.normal;
        }
        return { x: 0, y: 0, z: 1 };
      }
      return { x: 0, y: 0, z: 1 };
    },
    []
  );

  // -------------------------------------------------------------
  // Zero-Overhead 2D Canvas Orientation Gizmo
  // -------------------------------------------------------------
  const renderGizmo = (camera: THREE.Camera) => {
    const canvas = gizmoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const center = w / 2;
    const r = 28;

    // Outer circle
    ctx.fillStyle = theme === 'dark' ? 'rgba(30, 32, 38, 0.75)' : 'rgba(255, 255, 255, 0.75)';
    ctx.strokeStyle = theme === 'dark' ? '#333a46' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // View matrix rotation
    _rotMatrix.extractRotation(camera.matrixWorldInverse);
    _gizmoVx.set(1, 0, 0).applyMatrix4(_rotMatrix);
    _gizmoVy.set(0, 0, 1).applyMatrix4(_rotMatrix); // depth
    _gizmoVz.set(0, 1, 0).applyMatrix4(_rotMatrix); // height

    const axes = [
      { name: 'X', color: '#ef4444', x: _gizmoVx.x, y: _gizmoVx.y, z: _gizmoVx.z },
      { name: 'Y', color: '#22c55e', x: _gizmoVy.x, y: _gizmoVy.y, z: _gizmoVy.z },
      { name: 'Z', color: '#3b82f6', x: _gizmoVz.x, y: _gizmoVz.y, z: _gizmoVz.z },
    ];

    axes.sort((a, b) => a.z - b.z);

    axes.forEach((ax) => {
      const px = center + ax.x * r;
      const py = center - ax.y * r;
      const isFront = ax.z > -0.05;

      // Negative axis dot
      const negX = center - ax.x * r * 0.72;
      const negY = center + ax.y * r * 0.72;
      ctx.fillStyle = ax.color + '55';
      ctx.beginPath();
      ctx.arc(negX, negY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Axis line
      ctx.strokeStyle = ax.color;
      ctx.globalAlpha = isFront ? 0.95 : 0.35;
      ctx.lineWidth = isFront ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Positive axis circle
      ctx.fillStyle = ax.color;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Axis label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ax.name, px, py + 0.5);
    });
  };

  // -------------------------------------------------------------
  // Single-Flight Bulletproof On-Demand Rendering
  // Guaranteed: Max 1 render per VSync frame, 0 runaway recursion!
  // -------------------------------------------------------------
  const isRenderPendingRef = useRef<boolean>(false);

  const requestRender = useCallback(() => {
    if (isRenderPendingRef.current) return;
    isRenderPendingRef.current = true;

    requestAnimationFrame(() => {
      isRenderPendingRef.current = false;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = activeCameraRef.current;
      if (!renderer || !scene || !camera) return;

      if (vertexSnapRingRef.current && vertexSnapRingRef.current.visible) {
        vertexSnapRingRef.current.quaternion.copy(camera.quaternion);
      }

      renderer.render(scene, camera);
      renderGizmo(camera);
    });
  }, []);

  // -------------------------------------------------------------
  // 1. Initialize Three.js Scene, Cameras, Controls & On-Demand Loop
  // -------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const aspect = width / height;
    const frustumSize = 34;

    // Orthographic Camera (CAD Precision)
    const orthoCam = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -300,
      600
    );

    // Perspective Camera (Realistic Blender View)
    const perspCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);

    // Initial Isometric position
    const isoDist = 30;
    orthoCam.position.set(isoDist, isoDist * Math.SQRT2, isoDist);
    orthoCam.lookAt(0, 0, 0);
    perspCam.position.set(isoDist * 1.3, isoDist * Math.SQRT2 * 1.3, isoDist * 1.3);
    perspCam.lookAt(0, 0, 0);

    orthoCameraRef.current = orthoCam;
    perspCameraRef.current = perspCam;
    activeCameraRef.current = orthoCam;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === 'dark' ? '#18181b' : '#ffffff');
    sceneRef.current = scene;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(40, 60, 40);
    scene.add(dirLight);

    // Scene Groups
    scene.add(gridGroupRef.current);
    scene.add(facesGroupRef.current);
    scene.add(geometryGroupRef.current);
    scene.add(selectionHighlightGroupRef.current);
    scene.add(hoverGroupRef.current);
    scene.add(previewGroupRef.current);

    // 3D Cursor indicator
    const cursorGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x4f46e5, depthTest: false });
    const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.visible = false;
    scene.add(cursorMesh);
    cursorMarkerRef.current = cursorMesh;

    // Glowing Amber Vertex Snap Ring
    const ringGeo = new THREE.RingGeometry(0.32, 0.48, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.visible = false;
    scene.add(ringMesh);
    vertexSnapRingRef.current = ringMesh;

    // Cyan Edge Snap Marker (Square)
    const edgeGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      depthTest: false,
    });
    const edgeMarker = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMarker.visible = false;
    scene.add(edgeMarker);
    edgeSnapMarkerRef.current = edgeMarker;

    // Cyan Midpoint Snap Marker (Octahedron/Diamond)
    const midGeo = new THREE.OctahedronGeometry(0.3, 0);
    const midMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      depthTest: false,
    });
    const midMarker = new THREE.Mesh(midGeo, midMat);
    midMarker.visible = false;
    scene.add(midMarker);
    midpointSnapMarkerRef.current = midMarker;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    rendererRef.current = renderer;

    mount.replaceChildren(renderer.domElement);

    // OrbitControls: Direct, Instantaneous 1:1 Response (enableDamping = false)!
    // RIGHT: Orbit / Rotate (Instantaneous, 0 lag!)
    // MIDDLE: Pan
    // Shift + RIGHT: Pan
    // Wheel: Zoom
    // LEFT: Drawing Tools & Selection
    const controls = new OrbitControls(orthoCam, renderer.domElement);
    controls.enableDamping = false; // Zero lag, zero sluggish inertia!
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: -1 as any, // Reserve Left Click for drawing tools & selection!
      MIDDLE: THREE.MOUSE.PAN, // Middle Click: Pan
      RIGHT: THREE.MOUSE.ROTATE, // Right Click: ROTATE CAMERA!
    };
    controlsRef.current = controls;

    // On-demand rendering when OrbitControls moves
    controls.addEventListener('change', () => {
      requestRender();
    });

    // Blender Infinite Axis Guideline
    const guideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1000, 0, 0),
      new THREE.Vector3(1000, 0, 0),
    ]);
    const guideMat = new THREE.LineDashedMaterial({
      color: 0xef4444,
      dashSize: 1,
      gapSize: 0.5,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const guideLine = new THREE.Line(guideGeo, guideMat);
    guideLine.computeLineDistances();
    guideLine.visible = false;
    scene.add(guideLine);
    axisGuideLineRef.current = guideLine;

    // 3D Transform Gizmo (Blender style Translate / Rotate / Scale)
    scene.add(pivotMeshRef.current);
    const transformControls = new TransformControls(orthoCam, renderer.domElement);
    transformControls.setMode(gizmoMode);
    transformControls.setSpace('world');
    transformControls.size = 1.25;
    transformControls.translationSnap = null;
    transformControls.rotationSnap = null;
    transformControls.scaleSnap = null;

    // Enhance gizmo pickers with generous hitboxes for CAD/Blender precision (zero missed clicks!)
    const tcGizmo = (transformControls as any)._gizmo;
    if (tcGizmo && tcGizmo.picker) {
      const matPick = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });

      // Translate pickers: Add full-length shaft cylinders and large center sphere
      if (tcGizmo.picker.translate) {
        const xShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        xShaft.position.set(0.9, 0, 0);
        xShaft.rotation.set(0, 0, -Math.PI / 2);
        xShaft.name = 'X';
        tcGizmo.picker.translate.add(xShaft);

        const yShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        yShaft.position.set(0, 0.9, 0);
        yShaft.name = 'Y';
        tcGizmo.picker.translate.add(yShaft);

        const zShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        zShaft.position.set(0, 0, 0.9);
        zShaft.rotation.set(Math.PI / 2, 0, 0);
        zShaft.name = 'Z';
        tcGizmo.picker.translate.add(zShaft);

        const centerPick = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), matPick);
        centerPick.name = 'XYZ';
        tcGizmo.picker.translate.add(centerPick);
      }

      // Rotate pickers: Add generous toruses for rotation rings
      if (tcGizmo.picker.rotate) {
        const rotPickX = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.28, 6, 24), matPick);
        rotPickX.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
        rotPickX.name = 'X';
        tcGizmo.picker.rotate.add(rotPickX);

        const rotPickY = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.28, 6, 24), matPick);
        rotPickY.rotation.set(Math.PI / 2, 0, 0);
        rotPickY.name = 'Y';
        tcGizmo.picker.rotate.add(rotPickY);

        const rotPickZ = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.28, 6, 24), matPick);
        rotPickZ.name = 'Z';
        tcGizmo.picker.rotate.add(rotPickZ);
      }

      // Scale pickers: Add full-length shaft cylinders
      if (tcGizmo.picker.scale) {
        const sxShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        sxShaft.position.set(0.9, 0, 0);
        sxShaft.rotation.set(0, 0, -Math.PI / 2);
        sxShaft.name = 'X';
        tcGizmo.picker.scale.add(sxShaft);

        const syShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        syShaft.position.set(0, 0.9, 0);
        syShaft.name = 'Y';
        tcGizmo.picker.scale.add(syShaft);

        const szShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), matPick);
        szShaft.position.set(0, 0, 0.9);
        szShaft.rotation.set(Math.PI / 2, 0, 0);
        szShaft.name = 'Z';
        tcGizmo.picker.scale.add(szShaft);

        const sCenter = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), matPick);
        sCenter.name = 'XYZ';
        tcGizmo.picker.scale.add(sCenter);
      }
    }

    transformControls.addEventListener('dragging-changed', (event: any) => {
      const isDragging = !!event.value;
      isDraggingRef.current = isDragging;

      if (controlsRef.current) {
        controlsRef.current.enabled = !isDragging;
      }

      if (isDragging) {
        dragStartPivotPos.current.copy(pivotMeshRef.current.position);
        dragStartPivotRot.current.copy(pivotMeshRef.current.rotation);
        dragStartPivotScale.current.copy(pivotMeshRef.current.scale);

        // Update infinite axis guideline
        const axis = (transformControls as any).axis as string | null;
        if (axisGuideLineRef.current && axis) {
          const p = pivotMeshRef.current.position;
          const guide = axisGuideLineRef.current;
          const mat = guide.material as THREE.LineDashedMaterial;
          if (axis.includes('X')) {
            guide.position.set(0, p.y, p.z);
            guide.rotation.set(0, 0, 0);
            mat.color.setHex(0xef4444); // Red
            guide.visible = true;
          } else if (axis.includes('Y')) {
            // Three.js Y = logical Z (height)
            guide.position.set(p.x, 0, p.z);
            guide.rotation.set(0, 0, Math.PI / 2);
            mat.color.setHex(0x3b82f6); // Blue
            guide.visible = true;
          } else if (axis.includes('Z')) {
            // Three.js Z = logical Y (depth)
            guide.position.set(p.x, p.y, 0);
            guide.rotation.set(0, Math.PI / 2, 0);
            mat.color.setHex(0x10b981); // Green
            guide.visible = true;
          } else {
            guide.visible = false;
          }
        }

        setLiveTransformHud({
          visible: true,
          mode: transformControls.getMode() as any,
          dx: 0,
          dy: 0,
          dz: 0,
          angle: 0,
          scale: 1,
        });
      } else {
        // Drag Ended / Released -> Commit the final transform!
        if (axisGuideLineRef.current) axisGuideLineRef.current.visible = false;
        setLiveTransformHud((prev) => ({ ...prev, visible: false }));

        const mode = transformControls.getMode();
        const curPos = pivotMeshRef.current.position;
        const dx = Math.round((curPos.x - dragStartPivotPos.current.x) * 100) / 100;
        const dz = Math.round((curPos.y - dragStartPivotPos.current.y) * 100) / 100; // Height
        const dy = Math.round((curPos.z - dragStartPivotPos.current.z) * 100) / 100; // Depth

        const selV = selectedVertexRef.current;
        const selL = selectedLineIdRef.current;
        const selA = selectedArcIdRef.current;
        const selC = selectedCylinderIdRef.current;
        const selS = selectedSphereIdRef.current;
        const selF = selectedFaceRef.current;
        const selFaces = selectedFacesRef.current;

        const currentGroupId =
          selectedGroupIdRef.current ||
          (selL && (linesRef.current.find((l) => l.id === selL)?.groupId || groupsRef.current.find((g) => g.memberIds.includes(selL))?.id)) ||
          (selA && (arcsRef.current.find((a) => a.id === selA)?.groupId || groupsRef.current.find((g) => g.memberIds.includes(selA))?.id)) ||
          (selC && (cylindersRef.current.find((c) => c.id === selC)?.groupId || groupsRef.current.find((g) => g.memberIds.includes(selC))?.id)) ||
          (selS && (spheresRef.current.find((s) => s.id === selS)?.groupId || groupsRef.current.find((g) => g.memberIds.includes(selS))?.id)) ||
          (selF && (selF.groupId || groupsRef.current.find((g) => g.type === 'plane' && g.memberIds.includes(selF.id))?.id)) ||
          (selFaces.length > 0 && groupsRef.current.find((g) => g.type === 'plane' && g.memberIds.some((mid) => selFaces.some((sf) => sf.id === mid)))?.id) ||
          (selectedLineIdsRef.current.length > 0 && groupsRef.current.find((g) => g.memberIds.some((mid) => selectedLineIdsRef.current.includes(mid)))?.id) ||
          null;

        if (mode === 'translate') {
          if (dx !== 0 || dy !== 0 || dz !== 0) {
            const delta: Point3D = { x: dx, y: dy, z: dz };
            if (currentGroupId && groupModeRef.current) {
              onTranslateEntityRef.current?.('group', currentGroupId, delta);
            } else if (multiCountRef.current > 1) {
              onTranslateEntityRef.current?.('multi', null, delta);
            } else if (selV) {
              onTranslateEntityRef.current?.('vertex', selV, delta);
            } else if (selL) {
              onTranslateEntityRef.current?.('line', selL, delta);
            } else if (selA) {
              onTranslateEntityRef.current?.('arc', selA, delta);
            } else if (selC) {
              onTranslateEntityRef.current?.('cylinder', selC, delta);
            } else if (selS) {
              onTranslateEntityRef.current?.('sphere', selS, delta);
            } else if (selF) {
              onTranslateEntityRef.current?.('face', selF, delta);
            }
            onCommitTransformRef.current?.();
          }
        } else if (mode === 'rotate') {
          const dRotX = pivotMeshRef.current.rotation.x - dragStartPivotRot.current.x;
          const dRotY = pivotMeshRef.current.rotation.y - dragStartPivotRot.current.y;
          const dRotZ = pivotMeshRef.current.rotation.z - dragStartPivotRot.current.z;
          if (Math.abs(dRotX) > 0.005 || Math.abs(dRotY) > 0.005 || Math.abs(dRotZ) > 0.005) {
            const pivotLogical = threeToLogical(dragStartPivotPos.current);
            const eulerRad: Point3D = { x: dRotX, y: dRotY, z: dRotZ };
            const targetType = currentGroupId && groupModeRef.current
              ? 'group'
              : multiCountRef.current > 1
              ? 'multi'
              : selV ? 'vertex' : selL ? 'line' : selA ? 'arc' : selC ? 'cylinder' : selS ? 'sphere' : 'face';
            const targetId = currentGroupId && groupModeRef.current
              ? currentGroupId
              : multiCountRef.current > 1
              ? null
              : (selV || selL || selA || selC || selS || selF);
            onRotateEntityRef.current?.(targetType as any, targetId, pivotLogical, eulerRad);
            onCommitTransformRef.current?.();
          }
          pivotMeshRef.current.rotation.set(0, 0, 0);
        } else if (mode === 'scale') {
          const sx = pivotMeshRef.current.scale.x / (dragStartPivotScale.current.x || 1);
          const sy = pivotMeshRef.current.scale.y / (dragStartPivotScale.current.y || 1);
          const sz = pivotMeshRef.current.scale.z / (dragStartPivotScale.current.z || 1);
          if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01 || Math.abs(sz - 1) > 0.01) {
            const pivotLogical = threeToLogical(dragStartPivotPos.current);
            const scaleFactor: Point3D = { x: sx, y: sy, z: sz };
            const targetType = currentGroupId && groupModeRef.current
              ? 'group'
              : multiCountRef.current > 1
              ? 'multi'
              : selV ? 'vertex' : selL ? 'line' : selA ? 'arc' : selC ? 'cylinder' : selS ? 'sphere' : 'face';
            const targetId = currentGroupId && groupModeRef.current
              ? currentGroupId
              : multiCountRef.current > 1
              ? null
              : (selV || selL || selA || selC || selS || selF);
            onScaleEntityRef.current?.(targetType as any, targetId, pivotLogical, scaleFactor);
            onCommitTransformRef.current?.();
          }
          pivotMeshRef.current.scale.set(1, 1, 1);
        }

        requestRender();
      }
    });

    transformControls.addEventListener('objectChange', () => {
      const mode = transformControls.getMode();
      if (mode === 'translate') {
        const curPos = pivotMeshRef.current.position;
        const dx = Math.round(curPos.x - dragStartPivotPos.current.x);
        const dz = Math.round(curPos.y - dragStartPivotPos.current.y); // Height
        const dy = Math.round(curPos.z - dragStartPivotPos.current.z); // Depth

        setLiveTransformHud((prev) => ({
          ...prev,
          visible: true,
          mode: 'translate',
          dx,
          dy,
          dz,
        }));
      } else if (mode === 'rotate') {
        const dRotY = pivotMeshRef.current.rotation.y - dragStartPivotRot.current.y;
        const deg = Math.round((dRotY * 180) / Math.PI);
        setLiveTransformHud((prev) => ({
          ...prev,
          visible: true,
          mode: 'rotate',
          angle: deg,
        }));
      } else if (mode === 'scale') {
        const s = pivotMeshRef.current.scale.x;
        setLiveTransformHud((prev) => ({
          ...prev,
          visible: true,
          mode: 'scale',
          scale: s,
        }));
      }
      requestRender();
    });

    const gizmoRoot = (transformControls as any).getHelper ? (transformControls as any).getHelper() : transformControls;
    scene.add(gizmoRoot);
    transformControlsRef.current = transformControls;

    (window as any).__debugGizmo = {
      getTC: () => transformControlsRef.current,
      getPivot: () => pivotMeshRef.current,
      getInfo: () => {
        const tc = transformControlsRef.current;
        const cam = activeCameraRef.current;
        const renderer = rendererRef.current;
        if (!tc || !cam || !renderer) return { error: 'not ready' };
        const rect = renderer.domElement.getBoundingClientRect();
        const p = pivotMeshRef.current.position.clone().project(cam);
        const screenCenter = {
          x: Math.round(((p.x + 1) * rect.width) / 2 + rect.left),
          y: Math.round(((-p.y + 1) * rect.height) / 2 + rect.top),
        };
        // Arrow points
        const pX = pivotMeshRef.current.position.clone().add(new THREE.Vector3(3.5, 0, 0)).project(cam);
        const pY = pivotMeshRef.current.position.clone().add(new THREE.Vector3(0, 3.5, 0)).project(cam);
        const pZ = pivotMeshRef.current.position.clone().add(new THREE.Vector3(0, 0, 3.5)).project(cam);
        return {
          mode: tc.getMode(),
          attached: !!tc.object,
          objectPosition: tc.object?.position,
          axis: (tc as any).axis,
          dragging: (tc as any).dragging,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          screenCenter,
          screenArrowX: { x: Math.round(((pX.x + 1) * rect.width) / 2 + rect.left), y: Math.round(((-pX.y + 1) * rect.height) / 2 + rect.top) },
          screenArrowY: { x: Math.round(((pY.x + 1) * rect.width) / 2 + rect.left), y: Math.round(((-pY.y + 1) * rect.height) / 2 + rect.top) },
          screenArrowZ: { x: Math.round(((pZ.x + 1) * rect.width) / 2 + rect.left), y: Math.round(((-pZ.y + 1) * rect.height) / 2 + rect.top) },
        };
      },
    };

    requestRender();

    // Resize Handler
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const asp = w / h;

      if (orthoCameraRef.current) {
        orthoCameraRef.current.left = (-frustumSize * asp) / 2;
        orthoCameraRef.current.right = (frustumSize * asp) / 2;
        orthoCameraRef.current.top = frustumSize / 2;
        orthoCameraRef.current.bottom = -frustumSize / 2;
        orthoCameraRef.current.updateProjectionMatrix();
      }
      if (perspCameraRef.current) {
        perspCameraRef.current.aspect = asp;
        perspCameraRef.current.updateProjectionMatrix();
      }
      renderer.setSize(w, h);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      resizeObserver.disconnect();
      controls.dispose();
      transformControls.dispose();
      renderer.dispose();
    };
  }, [requestRender]);

  // Synchronize Gizmo Mode (Translate / Rotate / Scale)
  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(gizmoMode);
      requestRender();
    }
  }, [gizmoMode, requestRender]);

  // Guideline helper for locked axes
  const updateAxisGuide = useCallback((axis: 'X' | 'Y' | 'Z' | null, p: THREE.Vector3) => {
    if (!axisGuideLineRef.current) return;
    const guide = axisGuideLineRef.current;
    const mat = guide.material as THREE.LineDashedMaterial;
    if (!axis) {
      guide.visible = false;
      return;
    }
    if (axis === 'X') {
      guide.position.set(0, p.y, p.z);
      guide.rotation.set(0, 0, 0);
      mat.color.setHex(0xef4444); // Red
      guide.visible = true;
    } else if (axis === 'Y') {
      // Logical Y (depth) = Three.js Z
      guide.position.set(p.x, p.y, 0);
      guide.rotation.set(0, Math.PI / 2, 0);
      mat.color.setHex(0x10b981); // Green
      guide.visible = true;
    } else if (axis === 'Z') {
      // Logical Z (height) = Three.js Y
      guide.position.set(p.x, 0, p.z);
      guide.rotation.set(0, 0, Math.PI / 2);
      mat.color.setHex(0x3b82f6); // Blue
      guide.visible = true;
    }
  }, []);

  // Blender Modal Transform Callbacks
  const startModalTransform = useCallback(
    (mode: 'translate' | 'rotate' | 'scale') => {
      const hasSel = hasSelectionRef.current;
      if (!hasSel) return;

      modalStartRef.current = {
        mousePos: { ...lastMousePosRef.current },
        startPivotPos: transformGroupRef.current.position.clone(),
        startPivotRot: transformGroupRef.current.rotation.clone(),
        startPivotScale: transformGroupRef.current.scale.clone(),
        axisLock: null,
      };

      setModalTransform({
        active: true,
        mode,
        axisLock: null,
      });

      setLiveTransformHud({
        visible: true,
        mode,
        dx: 0,
        dy: 0,
        dz: 0,
        angle: 0,
        scale: 1,
      });
      requestRender();
    },
    [requestRender]
  );

  const commitModalTransform = useCallback(() => {
    if (!modalTransformRef.current.active) return;
    const mode = modalTransformRef.current.mode;
    const curPos = transformGroupRef.current.position;
    const startPos = modalStartRef.current.startPivotPos;
    const dx = Math.round(curPos.x - startPos.x);
    const dz = Math.round(curPos.y - startPos.y); // Height in logical
    const dy = Math.round(curPos.z - startPos.z); // Depth in logical

    const selV = selectedVertexRef.current;
    const selL = selectedLineIdRef.current;
    const selA = selectedArcIdRef.current;
    const selC = selectedCylinderIdRef.current;
    const selS = selectedSphereIdRef.current;
    const selF = selectedFaceRef.current;

    const currentGroupId =
      (selL && linesRef.current.find((l) => l.id === selL)?.groupId) ||
      (selA && arcsRef.current.find((a) => a.id === selA)?.groupId) ||
      (selC && cylindersRef.current.find((c) => c.id === selC)?.groupId) ||
      (selS && spheresRef.current.find((s) => s.id === selS)?.groupId) ||
      (selF && (selF.groupId || groupsRef.current.find((g) => g.type === 'plane' && g.memberIds.includes(selF.id))?.id));

    if (mode === 'translate') {
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        const delta: Point3D = { x: dx, y: dy, z: dz };
        if (currentGroupId && groupModeRef.current) {
          onTranslateEntityRef.current?.('group', currentGroupId, delta);
        } else if (multiCountRef.current > 1) {
          onTranslateEntityRef.current?.('multi', null, delta);
        } else if (selV) {
          onTranslateEntityRef.current?.('vertex', selV, delta);
        } else if (selL) {
          onTranslateEntityRef.current?.('line', selL, delta);
        } else if (selA) {
          onTranslateEntityRef.current?.('arc', selA, delta);
        } else if (selC) {
          onTranslateEntityRef.current?.('cylinder', selC, delta);
        } else if (selS) {
          onTranslateEntityRef.current?.('sphere', selS, delta);
        } else if (selF) {
          onTranslateEntityRef.current?.('face', selF, delta);
        }
        onCommitTransformRef.current?.();
      }
    } else if (mode === 'rotate') {
      const dRotX = transformGroupRef.current.rotation.x - modalStartRef.current.startPivotRot.x;
      const dRotY = transformGroupRef.current.rotation.y - modalStartRef.current.startPivotRot.y;
      const dRotZ = transformGroupRef.current.rotation.z - modalStartRef.current.startPivotRot.z;
      if (Math.abs(dRotX) > 0.01 || Math.abs(dRotY) > 0.01 || Math.abs(dRotZ) > 0.01) {
        const pivotLogical = threeToLogical(modalStartRef.current.startPivotPos);
        const eulerRad: Point3D = { x: dRotX, y: dRotY, z: dRotZ };
        const targetType = currentGroupId && groupModeRef.current
          ? 'group'
          : multiCountRef.current > 1
          ? 'multi'
          : selV ? 'vertex' : selL ? 'line' : selA ? 'arc' : selC ? 'cylinder' : selS ? 'sphere' : 'face';
        const targetId = currentGroupId && groupModeRef.current
          ? currentGroupId
          : multiCountRef.current > 1
          ? null
          : (selV || selL || selA || selC || selS || selF);
        onRotateEntityRef.current?.(targetType as any, targetId, pivotLogical, eulerRad);
        onCommitTransformRef.current?.();
      }
      transformGroupRef.current.rotation.set(0, 0, 0);
    } else if (mode === 'scale') {
      const sx = transformGroupRef.current.scale.x / (modalStartRef.current.startPivotScale.x || 1);
      const sy = transformGroupRef.current.scale.y / (modalStartRef.current.startPivotScale.y || 1);
      const sz = transformGroupRef.current.scale.z / (modalStartRef.current.startPivotScale.z || 1);
      if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02 || Math.abs(sz - 1) > 0.02) {
        const pivotLogical = threeToLogical(modalStartRef.current.startPivotPos);
        const scaleFactor: Point3D = { x: sx, y: sy, z: sz };
        const targetType = currentGroupId && groupModeRef.current
          ? 'group'
          : multiCountRef.current > 1
          ? 'multi'
          : selV ? 'vertex' : selL ? 'line' : selA ? 'arc' : selC ? 'cylinder' : selS ? 'sphere' : 'face';
        const targetId = currentGroupId && groupModeRef.current
          ? currentGroupId
          : multiCountRef.current > 1
          ? null
          : (selV || selL || selA || selC || selS || selF);
        onScaleEntityRef.current?.(targetType as any, targetId, pivotLogical, scaleFactor);
        onCommitTransformRef.current?.();
      }
      transformGroupRef.current.scale.set(1, 1, 1);
    }

    updateAxisGuide(null, curPos);
    setLiveTransformHud((prev) => ({ ...prev, visible: false }));
    setModalTransform({ active: false, mode: 'translate', axisLock: null });
    requestRender();
  }, [requestRender, updateAxisGuide]);

  const cancelModalTransform = useCallback(() => {
    if (!modalTransformRef.current.active) return;
    transformGroupRef.current.position.copy(modalStartRef.current.startPivotPos);
    transformGroupRef.current.rotation.copy(modalStartRef.current.startPivotRot);
    transformGroupRef.current.scale.copy(modalStartRef.current.startPivotScale);
    updateAxisGuide(null, modalStartRef.current.startPivotPos);
    setLiveTransformHud((prev) => ({ ...prev, visible: false }));
    setModalTransform({ active: false, mode: 'translate', axisLock: null });
    requestRender();
  }, [requestRender, updateAxisGuide]);

  // -------------------------------------------------------------
  // 2. Keyboard Modifiers (Shift Pan, Shift+Tab Magnet, Numpad Views)
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Blender Modal Transform Keys
      if (modalTransformRef.current.active) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitModalTransform();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelModalTransform();
          return;
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          setModalTransform((p) => {
            const nextLock = p.axisLock === 'X' ? null : 'X';
            modalStartRef.current.axisLock = nextLock;
            updateAxisGuide(nextLock, transformGroupRef.current.position);
            requestRender();
            return { ...p, axisLock: nextLock };
          });
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          setModalTransform((p) => {
            const nextLock = p.axisLock === 'Y' ? null : 'Y';
            modalStartRef.current.axisLock = nextLock;
            updateAxisGuide(nextLock, transformGroupRef.current.position);
            requestRender();
            return { ...p, axisLock: nextLock };
          });
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          setModalTransform((p) => {
            const nextLock = p.axisLock === 'Z' ? null : 'Z';
            modalStartRef.current.axisLock = nextLock;
            updateAxisGuide(nextLock, transformGroupRef.current.position);
            requestRender();
            return { ...p, axisLock: nextLock };
          });
          return;
        }
      } else {
        if (hasSelectionRef.current && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          if (e.key === 'g' || e.key === 'G') {
            e.preventDefault();
            onSetGizmoMode?.('translate');
            startModalTransform('translate');
            return;
          }
          if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            onSetGizmoMode?.('rotate');
            startModalTransform('rotate');
            return;
          }
          if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            onSetGizmoMode?.('scale');
            startModalTransform('scale');
            return;
          }
        }
      }

      // Shift key held -> switch Right Drag to PAN
      if (e.key === 'Shift') {
        if (controlsRef.current) {
          controlsRef.current.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        }
      }

      // Shift + Tab: Toggle Snapping Magnet
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        setMagnetSnapEnabled((prev) => !prev);
        return;
      }

      // Blender Numpad & View Hotkeys
      if (e.code === 'Numpad1' || (e.altKey && e.key === '1')) {
        e.preventDefault();
        setCameraView(e.ctrlKey ? 'back' : 'front');
      } else if (e.code === 'Numpad3' || (e.altKey && e.key === '3')) {
        e.preventDefault();
        setCameraView(e.ctrlKey ? 'left' : 'right');
      } else if (e.code === 'Numpad7' || (e.altKey && e.key === '7')) {
        e.preventDefault();
        setCameraView(e.ctrlKey ? 'bottom' : 'top');
      } else if (e.code === 'Numpad9') {
        e.preventDefault();
        invertView();
      } else if (e.code === 'Numpad5' || (e.key === '5' && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        togglePerspective();
      } else if (e.code === 'NumpadDecimal' || e.code === 'Home' || e.key.toLowerCase() === 'f') {
        e.preventDefault();
        frameAll();
      } else if (e.key === 'Escape') {
        if (modalTransformRef.current.active) {
          cancelModalTransform();
          return;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          pivotMeshRef.current.position.copy(dragStartPivotPos.current);
          pivotMeshRef.current.rotation.copy(dragStartPivotRot.current);
          pivotMeshRef.current.scale.copy(dragStartPivotScale.current);
          if (axisGuideLineRef.current) axisGuideLineRef.current.visible = false;
          setLiveTransformHud((prev) => ({ ...prev, visible: false }));
          if (controlsRef.current) controlsRef.current.enabled = true;
          requestRender();
          return;
        }
        cylinderDraftRef.current = { step: 0, center: null, radius: 5, normal: { x: 0, y: 0, z: 1 } };
        onSetAnchor(null);
        onSelectLine(null);
        onSelectArc?.(null);
        onSelectCylinder?.(null);
        onSelectSphere?.(null);
        onSelectVertex?.(null);
        onSelectFace?.(null);
        requestRender();
      } else if (
        e.key === 'Delete' ||
        e.key === 'Backspace'
      ) {
        if (selectedSphereId) {
          e.preventDefault();
          onRemoveSphere?.(selectedSphereId);
          onSelectSphere?.(null);
          requestRender();
          return;
        }
        if (selectedCylinderId) {
          e.preventDefault();
          onRemoveCylinder?.(selectedCylinderId);
          onSelectCylinder?.(null);
          requestRender();
          return;
        }
        if (selectedArcId) {
          e.preventDefault();
          onRemoveArc?.(selectedArcId);
          onSelectArc?.(null);
          requestRender();
          return;
        }
        if (selectedLineId) {
          e.preventDefault();
          onRemoveLine(selectedLineId);
          onSelectLine(null);
          requestRender();
          return;
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        onCreateGroupFromSelection?.();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        if (controlsRef.current) {
          controlsRef.current.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    onSetAnchor,
    onSelectLine,
    onSelectArc,
    onSelectCylinder,
    onSelectVertex,
    onSelectFace,
    onAddCylinder,
    onRemoveLine,
    onRemoveArc,
    onRemoveCylinder,
    onCreateGroupFromSelection,
    selectedArcId,
    selectedCylinderId,
    selectedLineId,
    arcs,
    cylinders,
    activeLayerId,
    requestRender,
  ]);

  // -------------------------------------------------------------
  // 3. Camera View Controls
  // -------------------------------------------------------------
  const setCameraView = useCallback((preset: CameraPreset) => {
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    setCameraPreset(preset);
    controls.target.set(0, 0, 0);

    const dist = 36;
    if (preset === 'iso') {
      camera.position.set(dist, dist * Math.SQRT2, dist);
      camera.up.set(0, 1, 0);
    } else if (preset === 'top') {
      camera.position.set(0, dist, 0);
      camera.up.set(0, 0, -1);
    } else if (preset === 'bottom') {
      camera.position.set(0, -dist, 0);
      camera.up.set(0, 0, 1);
    } else if (preset === 'front') {
      camera.position.set(0, 0, dist);
      camera.up.set(0, 1, 0);
    } else if (preset === 'back') {
      camera.position.set(0, 0, -dist);
      camera.up.set(0, 1, 0);
    } else if (preset === 'right') {
      camera.position.set(dist, 0, 0);
      camera.up.set(0, 1, 0);
    } else if (preset === 'left') {
      camera.position.set(-dist, 0, 0);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(0, 0, 0);
    controls.update();
    requestRender();
  }, [requestRender]);

  const invertView = useCallback(() => {
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.negate();
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
    requestRender();
  }, [requestRender]);

  const togglePerspective = useCallback(() => {
    const orthoCam = orthoCameraRef.current;
    const perspCam = perspCameraRef.current;
    const controls = controlsRef.current;
    if (!orthoCam || !perspCam || !controls) return;

    const willBePersp = !isPerspective;
    setIsPerspective(willBePersp);
    onTogglePerspective?.();

    if (willBePersp) {
      perspCam.position.copy(orthoCam.position);
      perspCam.rotation.copy(orthoCam.rotation);
      perspCam.up.copy(orthoCam.up);
      activeCameraRef.current = perspCam;
      controls.object = perspCam;
      if (transformControlsRef.current) {
        transformControlsRef.current.camera = perspCam;
      }
    } else {
      orthoCam.position.copy(perspCam.position);
      orthoCam.rotation.copy(perspCam.rotation);
      orthoCam.up.copy(perspCam.up);
      activeCameraRef.current = orthoCam;
      controls.object = orthoCam;
      if (transformControlsRef.current) {
        transformControlsRef.current.camera = orthoCam;
      }
    }

    controls.update();
    requestRender();
  }, [isPerspective, onTogglePerspective, requestRender]);

  // Sync camera projection from external prop (e.g. project load)
  useEffect(() => {
    if (propIsPerspective !== undefined && propIsPerspective !== isPerspective) {
      const orthoCam = orthoCameraRef.current;
      const perspCam = perspCameraRef.current;
      const controls = controlsRef.current;
      if (!orthoCam || !perspCam || !controls) return;

      setIsPerspective(propIsPerspective);
      if (propIsPerspective) {
        perspCam.position.copy(orthoCam.position);
        perspCam.rotation.copy(orthoCam.rotation);
        perspCam.up.copy(orthoCam.up);
        activeCameraRef.current = perspCam;
        controls.object = perspCam;
        if (transformControlsRef.current) {
          transformControlsRef.current.camera = perspCam;
        }
      } else {
        orthoCam.position.copy(perspCam.position);
        orthoCam.rotation.copy(perspCam.rotation);
        orthoCam.up.copy(perspCam.up);
        activeCameraRef.current = orthoCam;
        controls.object = orthoCam;
        if (transformControlsRef.current) {
          transformControlsRef.current.camera = orthoCam;
        }
      }
      controls.update();
      requestRender();
    }
  }, [propIsPerspective, isPerspective, requestRender]);

  const frameAll = useCallback(() => {
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (lines.length === 0 && arcs.length === 0 && cylinders.length === 0) {
      controls.target.set(0, 0, 0);
      setCameraView('iso');
      return;
    }

    const box = new THREE.Box3();
    lines.forEach((l) => {
      box.expandByPoint(logicalToThree(l.start));
      box.expandByPoint(logicalToThree(l.end));
    });
    arcs.forEach((a) => {
      const c = logicalToThree(a.center);
      box.expandByPoint(new THREE.Vector3(c.x + a.radius, c.y, c.z + a.radius));
      box.expandByPoint(new THREE.Vector3(c.x - a.radius, c.y, c.z - a.radius));
    });
    cylinders.forEach((cyl) => {
      const c = logicalToThree(cyl.center);
      box.expandByPoint(new THREE.Vector3(c.x + cyl.radius, c.y + cyl.height, c.z + cyl.radius));
      box.expandByPoint(new THREE.Vector3(c.x - cyl.radius, c.y, c.z - cyl.radius));
    });

    const center = new THREE.Vector3();
    box.getCenter(center);
    controls.target.copy(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 10);

    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.copy(center).addScaledVector(dir, maxDim * 2.2);
    camera.lookAt(center);
    controls.update();
    requestRender();
  }, [lines, arcs, cylinders, setCameraView, requestRender]);

  // -------------------------------------------------------------
  // 4. Render 3D Grid Plane
  // -------------------------------------------------------------
  useEffect(() => {
    const gridGroup = gridGroupRef.current;
    gridGroup.clear();

    if (!gridSettings.showGrid) {
      requestRender();
      return;
    }

    const size = 32;
    const divisions = 32;

    const gridColor1 = theme === 'dark' ? 0x3f3f46 : 0xd4d4d8;
    const gridColor2 = theme === 'dark' ? 0x27272a : 0xe5e7eb;
    const grid = new THREE.GridHelper(size, divisions, gridColor1, gridColor2);

    const planeGeo = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshBasicMaterial({
      color: theme === 'dark' ? 0xffffff : 0x000000,
      transparent: true,
      opacity: 0.015,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);

    const borderGeo = new THREE.EdgesGeometry(planeGeo);
    const borderMat = new THREE.LineBasicMaterial({
      color: theme === 'dark' ? 0x3f3f46 : 0xd1d5db,
      linewidth: 1,
    });
    const borderLines = new THREE.LineSegments(borderGeo, borderMat);

    if (activeIsoplane === 'top') {
      grid.position.set(0, activeElevation, 0);
      planeMesh.rotation.x = Math.PI / 2;
      planeMesh.position.set(0, activeElevation, 0);
      borderLines.rotation.x = Math.PI / 2;
      borderLines.position.set(0, activeElevation, 0);
    } else if (activeIsoplane === 'front') {
      grid.rotation.x = Math.PI / 2;
      grid.position.set(0, 0, activeElevation);
      planeMesh.position.set(0, 0, activeElevation);
      borderLines.position.set(0, 0, activeElevation);
    } else if (activeIsoplane === 'side') {
      grid.rotation.z = Math.PI / 2;
      grid.position.set(activeElevation, 0, 0);
      planeMesh.rotation.y = Math.PI / 2;
      planeMesh.position.set(activeElevation, 0, 0);
      borderLines.rotation.y = Math.PI / 2;
      borderLines.position.set(activeElevation, 0, 0);
    }

    gridGroup.add(grid);
    gridGroup.add(planeMesh);
    gridGroup.add(borderLines);

    const axesHelper = new THREE.AxesHelper(6);
    axesHelper.position.set(0, 0.01, 0);
    gridGroup.add(axesHelper);

    requestRender();
  }, [gridSettings.showGrid, activeIsoplane, activeElevation, theme, requestRender]);

  // -------------------------------------------------------------
  // 5. Render Base & Transformable 3D Geometry (CAD & Blender Grade)
  // All selected objects are placed inside transformGroupRef so they transform live at 60 FPS!
  // -------------------------------------------------------------
  useEffect(() => {
    const geoGroup = geometryGroupRef.current;
    const faceGroup = facesGroupRef.current;
    const selGroup = selectionHighlightGroupRef.current;
    const transformGroup = transformGroupRef.current;

    // Do NOT rebuild or interrupt geometry during an active user drag!
    if (isDraggingRef.current) return;

    geoGroup.clear();
    faceGroup.clear();
    selGroup.clear();
    transformGroup.clear();

    const isDark = theme === 'dark';
    const baseLineMat = new THREE.LineBasicMaterial({
      color: isDark ? 0xf1f5f9 : 0x111827,
      linewidth: 2,
      depthTest: true,
    });

    const isVertexMode = selectionMode === 'vertex';
    const sphereRadius = isVertexMode ? 0.22 : 0.14;
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: isVertexMode
        ? (isDark ? 0xf4f4f5 : 0x18181b)
        : (isDark ? 0xa1a1aa : 0x18181b),
      depthTest: !isVertexMode,
    });

    const baseFaceMat = new THREE.MeshLambertMaterial({
      color: isDark
        ? (solidShading ? 0x27272a : 0x18181b)
        : (solidShading ? 0xd4d4d8 : 0xf4f4f5),
      transparent: !solidShading,
      opacity: solidShading ? 0.92 : 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const haloLineMat = new THREE.LineBasicMaterial({
      color: 0x4f46e5,
      linewidth: 3.5,
      depthTest: false,
    });

    const haloGlowMat = new THREE.LineBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.65,
      linewidth: 7,
      depthTest: false,
    });

    // 1. Determine active selection & group membership
    const allFaces = extractFacesFromLines(lines, arcs);
    extractedFacesRef.current = allFaces;

    const currentGroupId =
      selectedGroupId ||
      (selectedLineId && (lines.find((l) => l.id === selectedLineId)?.groupId || groups.find((g) => g.memberIds.includes(selectedLineId))?.id)) ||
      (selectedArcId && (arcs.find((a) => a.id === selectedArcId)?.groupId || groups.find((g) => g.memberIds.includes(selectedArcId))?.id)) ||
      (selectedCylinderId && (cylinders.find((c) => c.id === selectedCylinderId)?.groupId || groups.find((g) => g.memberIds.includes(selectedCylinderId))?.id)) ||
      (selectedSphereId && (spheres.find((s) => s.id === selectedSphereId)?.groupId || groups.find((g) => g.memberIds.includes(selectedSphereId))?.id)) ||
      (selectedFace && (selectedFace.groupId || groups.find((g) => g.type === 'plane' && g.memberIds.includes(selectedFace.id))?.id)) ||
      (selectedLineIds.length > 0 && groups.find((g) => g.memberIds.some((mid) => selectedLineIds.includes(mid)))?.id) ||
      (selectedArcIds.length > 0 && groups.find((g) => g.memberIds.some((mid) => selectedArcIds.includes(mid)))?.id) ||
      (selectedCylinderIds.length > 0 && groups.find((g) => g.memberIds.some((mid) => selectedCylinderIds.includes(mid)))?.id) ||
      (selectedSphereIds.length > 0 && groups.find((g) => g.memberIds.some((mid) => selectedSphereIds.includes(mid)))?.id) ||
      null;

    const targetGroup = currentGroupId ? groups.find((g) => g.id === currentGroupId) : null;

    // Collect active face vertices for wireframe & face sync
    const activeFaceVerts: Point3D[] = [];
    if (selectedFace) {
      activeFaceVerts.push(...selectedFace.vertices);
    }
    if (selectedFaces.length > 0) {
      activeFaceVerts.push(...selectedFaces.flatMap((f) => f.vertices));
    }
    if (currentGroupId && groupMode && targetGroup?.type === 'plane') {
      const groupFaces = allFaces.filter((f) => f.groupId === currentGroupId || targetGroup.memberIds.includes(f.id));
      activeFaceVerts.push(...groupFaces.flatMap((f) => f.vertices));
      targetGroup.memberIds.filter((mid) => mid.startsWith('face-')).forEach((mid) => {
        const rawKeys = mid.replace(/^face-/, '').split('|');
        rawKeys.forEach((k) => {
          const coords = k.split(',').map(Number);
          if (coords.length >= 3 && !coords.some(isNaN)) {
            activeFaceVerts.push({ x: coords[0], y: coords[1], z: coords[2] });
          }
        });
      });
    }

    const isLineSel = (l: DrawingLine) => {
      if (currentGroupId && groupMode) {
        if (l.groupId === currentGroupId || (targetGroup?.memberIds.includes(l.id) ?? false)) return true;
        if (targetGroup?.type === 'plane' && activeFaceVerts.length > 0) {
          return matchesAnyPoint(l.start, activeFaceVerts) && matchesAnyPoint(l.end, activeFaceVerts);
        }
        return false;
      }
      if (l.id === selectedLineId || selectedLineIds.includes(l.id)) return true;
      if (activeFaceVerts.length > 0 && (matchesAnyPoint(l.start, activeFaceVerts) && matchesAnyPoint(l.end, activeFaceVerts))) {
        return true;
      }
      return false;
    };

    const isArcSel = (a: DrawingArc) => {
      if (currentGroupId && groupMode) {
        if (a.groupId === currentGroupId || (targetGroup?.memberIds.includes(a.id) ?? false)) return true;
        if (targetGroup?.type === 'plane' && activeFaceVerts.length > 0) {
          return matchesAnyPoint(a.center, activeFaceVerts);
        }
        return false;
      }
      if (a.id === selectedArcId || selectedArcIds.includes(a.id)) return true;
      if (activeFaceVerts.length > 0 && matchesAnyPoint(a.center, activeFaceVerts)) return true;
      return false;
    };

    const isCylSel = (c: DrawingCylinder) =>
      (currentGroupId && groupMode
        ? c.groupId === currentGroupId || (targetGroup?.memberIds.includes(c.id) ?? false)
        : c.id === selectedCylinderId || selectedCylinderIds.includes(c.id));
    const isSphSel = (s: DrawingSphere) =>
      (currentGroupId && groupMode
        ? s.groupId === currentGroupId || (targetGroup?.memberIds.includes(s.id) ?? false)
        : s.id === selectedSphereId || selectedSphereIds.includes(s.id));
    const isFaceSel = (f: Face3D) => {
      if (currentGroupId && groupMode) {
        if (f.groupId === currentGroupId || (targetGroup?.memberIds.includes(f.id) ?? false)) return true;
        if (targetGroup?.type === 'plane' && (targetGroup.memberIds.some((mid) => mid === f.id) || (activeFaceVerts.length > 0 && f.vertices.every((v) => matchesAnyPoint(v, activeFaceVerts))))) {
          return true;
        }
        return false;
      }
      return (selectedFace && f.id === selectedFace.id) || selectedFaces.some((sf) => sf.id === f.id);
    };

    const hasSelection = !!(
      currentGroupId ||
      selectedLineId ||
      selectedArcId ||
      selectedCylinderId ||
      selectedSphereId ||
      selectedVertex ||
      selectedFace ||
      selectedLineIds.length > 0 ||
      selectedArcIds.length > 0 ||
      selectedCylinderIds.length > 0 ||
      selectedSphereIds.length > 0 ||
      selectedVertices.length > 0 ||
      selectedFaces.length > 0
    );

    // 2. Compute Selection Centroid / Pivot Point
    const pivot = new THREE.Vector3();
    let hasPivot = false;

    if (hasSelection) {
      if (currentGroupId && groupMode) {
        const box = new THREE.Box3();
        lines.filter(isLineSel).forEach((l) => {
          box.expandByPoint(logicalToThree(l.start));
          box.expandByPoint(logicalToThree(l.end));
        });
        arcs.filter(isArcSel).forEach((a) => {
          const c = logicalToThree(a.center);
          box.expandByPoint(new THREE.Vector3(c.x + a.radius, c.y, c.z + a.radius));
          box.expandByPoint(new THREE.Vector3(c.x - a.radius, c.y, c.z - a.radius));
        });
        cylinders.filter(isCylSel).forEach((c) => {
          const center = logicalToThree(c.center);
          box.expandByPoint(new THREE.Vector3(center.x + c.radius, center.y + c.height, center.z + c.radius));
          box.expandByPoint(new THREE.Vector3(center.x - c.radius, center.y, center.z - c.radius));
        });
        spheres.filter(isSphSel).forEach((s) => {
          const center = logicalToThree(s.center);
          box.expandByPoint(new THREE.Vector3(center.x + s.radius, center.y + s.radius, center.z + s.radius));
          box.expandByPoint(new THREE.Vector3(center.x - s.radius, center.y, center.z - s.radius));
        });
        allFaces.filter(isFaceSel).forEach((f) => {
          box.expandByPoint(logicalToThree(f.center));
          f.vertices?.forEach((v) => box.expandByPoint(logicalToThree(v)));
        });
        if (targetGroup?.type === 'vertex') {
          targetGroup.memberIds.forEach((mid) => {
            const parts = mid.replace(/^v-/, '').split('_').map(Number);
            box.expandByPoint(logicalToThree({ x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 }));
          });
        }
        if (!box.isEmpty()) {
          box.getCenter(pivot);
          hasPivot = true;
        }
      } else if (multiCount > 1) {
        const box = new THREE.Box3();
        selectedVertices.forEach((v) => box.expandByPoint(logicalToThree(v)));
        lines.filter(isLineSel).forEach((l) => {
          box.expandByPoint(logicalToThree(l.start));
          box.expandByPoint(logicalToThree(l.end));
        });
        arcs.filter(isArcSel).forEach((a) => {
          const c = logicalToThree(a.center);
          box.expandByPoint(new THREE.Vector3(c.x + a.radius, c.y, c.z + a.radius));
          box.expandByPoint(new THREE.Vector3(c.x - a.radius, c.y, c.z - a.radius));
        });
        cylinders.filter(isCylSel).forEach((c) => {
          const center = logicalToThree(c.center);
          box.expandByPoint(new THREE.Vector3(center.x + c.radius, center.y + c.height, center.z + c.radius));
          box.expandByPoint(new THREE.Vector3(center.x - c.radius, center.y, center.z - c.radius));
        });
        spheres.filter(isSphSel).forEach((s) => {
          const center = logicalToThree(s.center);
          box.expandByPoint(new THREE.Vector3(center.x + s.radius, center.y + s.radius, center.z + s.radius));
          box.expandByPoint(new THREE.Vector3(center.x - s.radius, center.y, center.z - s.radius));
        });
        selectedFaces.forEach((f) => {
          box.expandByPoint(logicalToThree(f.center));
          f.vertices?.forEach((v) => box.expandByPoint(logicalToThree(v)));
        });
        if (!box.isEmpty()) {
          box.getCenter(pivot);
          hasPivot = true;
        }
      } else if (selectedVertex) {
        pivot.copy(logicalToThree(selectedVertex));
        hasPivot = true;
      } else if (selectedLineId || selectedLineIds[0]) {
        const targetId = selectedLineId || selectedLineIds[0];
        const l = lines.find((line) => line.id === targetId);
        if (l) {
          pivot.copy(logicalToThree({
            x: (l.start.x + l.end.x) / 2,
            y: (l.start.y + l.end.y) / 2,
            z: ((l.start.z || 0) + (l.end.z || 0)) / 2,
          }));
          hasPivot = true;
        }
      } else if (selectedArcId || selectedArcIds[0]) {
        const targetId = selectedArcId || selectedArcIds[0];
        const a = arcs.find((arc) => arc.id === targetId);
        if (a) {
          pivot.copy(logicalToThree(a.center));
          hasPivot = true;
        }
      } else if (selectedCylinderId || selectedCylinderIds[0]) {
        const targetId = selectedCylinderId || selectedCylinderIds[0];
        const c = cylinders.find((cyl) => cyl.id === targetId);
        if (c) {
          pivot.copy(logicalToThree(c.center));
          hasPivot = true;
        }
      } else if (selectedSphereId || selectedSphereIds[0]) {
        const targetId = selectedSphereId || selectedSphereIds[0];
        const s = spheres.find((sph) => sph.id === targetId);
        if (s) {
          pivot.copy(logicalToThree(s.center));
          hasPivot = true;
        }
      } else if (selectedFace || selectedFaces[0]) {
        const targetFace = selectedFace || selectedFaces[0];
        pivot.copy(logicalToThree(targetFace.center));
        hasPivot = true;
      }
    }

    // Configure transform group & attach TransformControls
    if (hasPivot && !activeAnchor) {
      transformGroup.position.copy(pivot);
      transformGroup.rotation.set(0, 0, 0);
      transformGroup.scale.set(1, 1, 1);
      if (transformControlsRef.current) {
        transformControlsRef.current.attach(transformGroup);
      }
    } else {
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
      }
    }

    // Helper to offset points relative to pivot for objects inside transformGroup
    const rel = (pt: THREE.Vector3) => (hasPivot ? pt.clone().sub(pivot) : pt);

    // 3. Render Lines
    lines.forEach((line) => {
      const isSelected = isLineSel(line);
      const v1 = logicalToThree(line.start);
      const v2 = logicalToThree(line.end);

      if (isSelected && hasPivot) {
        const r1 = rel(v1);
        const r2 = rel(v2);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([r1, r2]);
        transformGroup.add(new THREE.Line(lineGeo, baseLineMat));
        transformGroup.add(new THREE.Line(lineGeo, haloLineMat));
        transformGroup.add(new THREE.Line(lineGeo, haloGlowMat));

        const m1 = new THREE.Mesh(sphereGeo, sphereMat);
        m1.position.copy(r1);
        transformGroup.add(m1);
        const m2 = new THREE.Mesh(sphereGeo, sphereMat);
        m2.position.copy(r2);
        transformGroup.add(m2);
      } else {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
        geoGroup.add(new THREE.Line(lineGeo, baseLineMat));

        const m1 = new THREE.Mesh(sphereGeo, sphereMat);
        m1.position.copy(v1);
        geoGroup.add(m1);
        const m2 = new THREE.Mesh(sphereGeo, sphereMat);
        m2.position.copy(v2);
        geoGroup.add(m2);
      }
    });

    // 4. Render Arcs
    arcs.forEach((arc) => {
      const isSelected = isArcSel(arc);
      const curvePoints = getArc3DPoints(arc, 48);

      if (isSelected && hasPivot) {
        const relCurve = curvePoints.map(rel);
        const curveGeo = new THREE.BufferGeometry().setFromPoints(relCurve);
        transformGroup.add(new THREE.Line(curveGeo, baseLineMat));
        transformGroup.add(new THREE.Line(curveGeo, haloLineMat));

        if (arc.startPoint && arc.endPoint) {
          const ep1 = rel(logicalToThree(arc.startPoint));
          const ep2 = rel(logicalToThree(arc.endPoint));
          const epGeo = new THREE.SphereGeometry(0.14, 8, 8);
          const epMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x818cf8 : 0x4f46e5 });
          const m1 = new THREE.Mesh(epGeo, epMat);
          m1.position.copy(ep1);
          const m2 = new THREE.Mesh(epGeo, epMat);
          m2.position.copy(ep2);
          transformGroup.add(m1);
          transformGroup.add(m2);
        } else {
          const cThree = rel(logicalToThree(arc.center));
          const cGeo = new THREE.SphereGeometry(0.14, 8, 8);
          const cMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x818cf8 : 0x6366f1 });
          const cm = new THREE.Mesh(cGeo, cMat);
          cm.position.copy(cThree);
          transformGroup.add(cm);
        }
      } else {
        const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        geoGroup.add(new THREE.Line(curveGeo, baseLineMat));

        if (arc.startPoint && arc.endPoint) {
          const ep1 = logicalToThree(arc.startPoint);
          const ep2 = logicalToThree(arc.endPoint);
          const epGeo = new THREE.SphereGeometry(0.14, 8, 8);
          const epMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x818cf8 : 0x4f46e5 });
          const m1 = new THREE.Mesh(epGeo, epMat);
          m1.position.copy(ep1);
          const m2 = new THREE.Mesh(epGeo, epMat);
          m2.position.copy(ep2);
          geoGroup.add(m1);
          geoGroup.add(m2);
        } else {
          const cThree = logicalToThree(arc.center);
          const cGeo = new THREE.SphereGeometry(0.14, 8, 8);
          const cMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x818cf8 : 0x6366f1 });
          const cm = new THREE.Mesh(cGeo, cMat);
          cm.position.copy(cThree);
          geoGroup.add(cm);
        }
      }
    });

    // 5. Render Cylinders
    cylinders.forEach((cyl) => {
      const isSelected = isCylSel(cyl);
      const centerThree = logicalToThree(cyl.center);
      const normalThree = cyl.normal ? logicalToThreeNormal(cyl.normal) : new THREE.Vector3(0, 1, 0);
      const { basePoints, topPoints, silhouetteLines, midPoint, quaternion } = getCylinderGeometryData(
        centerThree,
        cyl.radius,
        cyl.height,
        normalThree
      );

      const targetGroup = isSelected && hasPivot ? transformGroup : geoGroup;
      const targetFaceGroup = isSelected && hasPivot ? transformGroup : faceGroup;

      const rBase = isSelected && hasPivot ? basePoints.map(rel) : basePoints;
      const rTop = isSelected && hasPivot ? topPoints.map(rel) : topPoints;
      targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rBase), baseLineMat));
      targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rTop), baseLineMat));
      silhouetteLines.forEach(([p1, p2]) => {
        const rp1 = isSelected && hasPivot ? rel(p1) : p1;
        const rp2 = isSelected && hasPivot ? rel(p2) : p2;
        targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([rp1, rp2]), baseLineMat));
      });

      if (solidShading) {
        const cylGeo = new THREE.CylinderGeometry(cyl.radius, cyl.radius, Math.abs(cyl.height), 32, 1, false);
        const cylMesh = new THREE.Mesh(cylGeo, baseFaceMat);
        cylMesh.position.copy(isSelected && hasPivot ? rel(midPoint) : midPoint);
        cylMesh.quaternion.copy(quaternion);
        (cylMesh as any).userData = { cylinderData: cyl };
        targetFaceGroup.add(cylMesh);
      }

      if (isSelected && hasPivot) {
        targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rBase), haloLineMat));
        targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rTop), haloLineMat));
      }
    });

    // 6. Render Solid Spheres & Technical Rings
    spheres.forEach((sph) => {
      const isSelected = isSphSel(sph);
      const centerThree = logicalToThree(sph.center);
      const targetGroup = isSelected && hasPivot ? transformGroup : geoGroup;
      const targetFaceGroup = isSelected && hasPivot ? transformGroup : faceGroup;
      const cPos = isSelected && hasPivot ? rel(centerThree) : centerThree;

      if (solidShading) {
        const sphGeo = new THREE.SphereGeometry(sph.radius, 28, 20);
        const sphMesh = new THREE.Mesh(sphGeo, baseFaceMat);
        sphMesh.position.copy(cPos);
        (sphMesh as any).userData = { sphereData: sph };
        targetFaceGroup.add(sphMesh);
      }

      const ringSegs = 48;
      const r1Pts: THREE.Vector3[] = [];
      const r2Pts: THREE.Vector3[] = [];
      const r3Pts: THREE.Vector3[] = [];
      for (let i = 0; i <= ringSegs; i++) {
        const theta = (i / ringSegs) * Math.PI * 2;
        r1Pts.push(new THREE.Vector3(cPos.x + sph.radius * Math.cos(theta), cPos.y, cPos.z + sph.radius * Math.sin(theta)));
        r2Pts.push(new THREE.Vector3(cPos.x + sph.radius * Math.cos(theta), cPos.y + sph.radius * Math.sin(theta), cPos.z));
        r3Pts.push(new THREE.Vector3(cPos.x, cPos.y + sph.radius * Math.sin(theta), cPos.z + sph.radius * Math.cos(theta)));
      }
      targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r1Pts), baseLineMat));
      targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r2Pts), baseLineMat));
      targetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r3Pts), baseLineMat));

      if (isSelected && hasPivot) {
        const haloGeo = new THREE.SphereGeometry(sph.radius * 1.02, 24, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x4f46e5,
          wireframe: true,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(cPos);
        targetGroup.add(halo);
      }
    });

    // 7. Render Planar Faces
    const extracted = allFaces;
    extractedFacesRef.current = extracted;

    extracted.forEach((faceObj) => {
      const isSelected = isFaceSel(faceObj);
      const v = faceObj.vertices.map(logicalToThree);
      if (v.length < 3) return;

      const targetFaceGroup = isSelected && hasPivot ? transformGroup : faceGroup;
      const pts = isSelected && hasPivot ? v.map(rel) : v;

      const faceGeo = new THREE.BufferGeometry();
      if (pts.length === 3) {
        const vertices = new Float32Array([
          pts[0].x, pts[0].y, pts[0].z,
          pts[1].x, pts[1].y, pts[1].z,
          pts[2].x, pts[2].y, pts[2].z,
        ]);
        faceGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      } else {
        const normThree = faceObj.normal ? logicalToThreeNormal(faceObj.normal) : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3();
        if (Math.abs(normThree.y) < 0.9) {
          u.crossVectors(normThree, new THREE.Vector3(0, 1, 0)).normalize();
        } else {
          u.crossVectors(normThree, new THREE.Vector3(1, 0, 0)).normalize();
        }
        const w = new THREE.Vector3().crossVectors(normThree, u).normalize();

        const pts2D = pts.map((pt) => new THREE.Vector2(pt.dot(u), pt.dot(w)));
        const triangles = THREE.ShapeUtils.triangulateShape(pts2D, []);

        const posArray: number[] = [];
        for (const tri of triangles) {
          for (const idx of tri) {
            const pt = pts[idx];
            if (pt) posArray.push(pt.x, pt.y, pt.z);
          }
        }
        if (posArray.length > 0) {
          faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
        }
      }
      faceGeo.computeVertexNormals();

      const faceMesh = new THREE.Mesh(faceGeo, baseFaceMat);
      (faceMesh as any).userData = { faceData: faceObj };
      targetFaceGroup.add(faceMesh);

      if (isSelected && hasPivot) {
        const selMat = new THREE.MeshBasicMaterial({
          color: 0x6366f1,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        targetFaceGroup.add(new THREE.Mesh(faceGeo, selMat));
      }
    });

    // 8. 3D Bounding Cage for Groups (Inside transformGroup so it transforms live!)
    if (currentGroupId && groupMode && hasPivot) {
      const box = new THREE.Box3();
      lines.filter(isLineSel).forEach((l) => {
        box.expandByPoint(rel(logicalToThree(l.start)));
        box.expandByPoint(rel(logicalToThree(l.end)));
      });
      arcs.filter(isArcSel).forEach((a) => {
        const c = rel(logicalToThree(a.center));
        box.expandByPoint(new THREE.Vector3(c.x + a.radius, c.y, c.z + a.radius));
        box.expandByPoint(new THREE.Vector3(c.x - a.radius, c.y, c.z - a.radius));
      });
      cylinders.filter(isCylSel).forEach((c) => {
        const center = rel(logicalToThree(c.center));
        box.expandByPoint(new THREE.Vector3(center.x + c.radius, center.y + c.height, center.z + c.radius));
        box.expandByPoint(new THREE.Vector3(center.x - c.radius, center.y, center.z - c.radius));
      });
      spheres.filter(isSphSel).forEach((s) => {
        const center = rel(logicalToThree(s.center));
        box.expandByPoint(new THREE.Vector3(center.x + s.radius, center.y + s.radius, center.z + s.radius));
        box.expandByPoint(new THREE.Vector3(center.x - s.radius, center.y, center.z - s.radius));
      });
      allFaces.filter(isFaceSel).forEach((f) => {
        box.expandByPoint(rel(logicalToThree(f.center)));
        f.vertices?.forEach((v) => box.expandByPoint(rel(logicalToThree(v))));
      });
      if (!box.isEmpty()) {
        const boxHelper = new THREE.Box3Helper(box, new THREE.Color(0x6366f1));
        transformGroup.add(boxHelper);
      }
    }

    // 9. Selected Vertex Indicator
    if (isVertexMode && hasPivot) {
      const selGeo = new THREE.SphereGeometry(0.28, 14, 14);
      const selMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false });
      const verticesToRender = selectedVertices.length > 0 ? selectedVertices : (selectedVertex ? [selectedVertex] : []);
      verticesToRender.forEach((v) => {
        const m = new THREE.Mesh(selGeo, selMat);
        m.position.copy(rel(logicalToThree(v)));
        transformGroup.add(m);
      });
    }

    requestRender();
  }, [
    lines,
    arcs,
    cylinders,
    spheres,
    selectedLineId,
    selectedArcId,
    selectedCylinderId,
    selectedSphereId,
    selectedVertex,
    selectedFace,
    selectedLineIds,
    selectedArcIds,
    selectedCylinderIds,
    selectedSphereIds,
    selectedVertices,
    selectedFaces,
    selectionMode,
    groupMode,
    groups,
    selectedGroupId,
    solidShading,
    theme,
    activeAnchor,
    requestRender,
  ]);

  // Update scene background on theme change
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      scene.background = new THREE.Color(theme === 'dark' ? '#18181b' : '#ffffff');
      requestRender();
    }
  }, [theme, requestRender]);

  // Sync Gizmo Mode (translate / rotate / scale)
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (tc) {
      tc.setMode(gizmoMode);
      requestRender();
    }
  }, [gizmoMode, requestRender]);

  // -------------------------------------------------------------
  // 7. Blender Snapping Calculations (Optimized: 0 Object Allocations!)
  // -------------------------------------------------------------
  const getScreenSpaceSnap = useCallback(
    (clientX: number, clientY: number, ctrlHeld: boolean) => {
      const mount = mountRef.current;
      const camera = activeCameraRef.current;
      if (!mount || !camera) return null;

      const rect = mount.getBoundingClientRect();
      const mouseScreen = { x: clientX - rect.left, y: clientY - rect.top };
      const mouseX = (mouseScreen.x / mount.clientWidth) * 2 - 1;
      const mouseY = -(mouseScreen.y / mount.clientHeight) * 2 + 1;

      const isSnappingActive = ctrlHeld ? !magnetSnapEnabled : magnetSnapEnabled;

      if (!isSnappingActive) {
        _mouseVec.set(mouseX, mouseY);
        _raycaster.setFromCamera(_mouseVec, camera);

        let planeNormalX = 0, planeNormalY = 1, planeNormalZ = 0;
        if (activeIsoplane === 'front') {
          planeNormalY = 0; planeNormalZ = 1;
        } else if (activeIsoplane === 'side') {
          planeNormalY = 0; planeNormalX = 1;
        }
        _draftingPlane.normal.set(planeNormalX, planeNormalY, planeNormalZ);
        _draftingPlane.constant = -activeElevation;

        if (_raycaster.ray.intersectPlane(_draftingPlane, _intersectPt)) {
          return {
            logical: threeToLogical(_intersectPt),
            screen: mouseScreen,
            type: 'grid' as const,
          };
        }
        return null;
      }

      // 1. VERTEX SNAP
      if (snapModes.vertex) {
        let closestVertex: Point3D | null = null;
        let minVertexDist = 18;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          for (let p = 0; p < 2; p++) {
            const pt = p === 0 ? l.start : l.end;
            _v1.set(pt.x, pt.z || 0, pt.y).project(camera);
            if (_v1.z > 1) continue;
            const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
            const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
            const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
            if (dist < minVertexDist) {
              minVertexDist = dist;
              closestVertex = pt;
            }
          }
        }

        for (let i = 0; i < arcs.length; i++) {
          const a = arcs[i];
          if (a.startPoint && a.endPoint) {
            for (const pt of [a.startPoint, a.endPoint]) {
              _v1.set(pt.x, pt.z || 0, pt.y).project(camera);
              if (_v1.z <= 1) {
                const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
                const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
                const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
                if (dist < minVertexDist) {
                  minVertexDist = dist;
                  closestVertex = pt;
                }
              }
            }
          } else {
            _v1.set(a.center.x, a.center.z || 0, a.center.y).project(camera);
            if (_v1.z <= 1) {
              const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
              const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
              const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
              if (dist < minVertexDist) {
                minVertexDist = dist;
                closestVertex = a.center;
              }
            }
          }
        }

        if (closestVertex) {
          _v1.set(closestVertex.x, closestVertex.z || 0, closestVertex.y).project(camera);
          const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
          const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
          return {
            logical: { ...closestVertex },
            screen: { x: sx, y: sy },
            type: 'vertex' as const,
          };
        }
      }

      // 2. EDGE MIDPOINT SNAP
      if (snapModes.midpoint) {
        let closestMidpoint: Point3D | null = null;
        let closestLineId: string | null = null;
        let closestArcId: string | null = null;
        let minMidDist = 14;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const midX = Math.round((l.start.x + l.end.x) / 2);
          const midY = Math.round((l.start.y + l.end.y) / 2);
          const midZ = Math.round(((l.start.z || 0) + (l.end.z || 0)) / 2);

          _v1.set(midX, midZ, midY).project(camera);
          if (_v1.z > 1) continue;
          const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
          const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
          const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);

          if (dist < minMidDist) {
            minMidDist = dist;
            closestMidpoint = { x: midX, y: midY, z: midZ };
            closestLineId = l.id;
            closestArcId = null;
          }
        }

        for (let i = 0; i < arcs.length; i++) {
          const a = arcs[i];
          const pts = getArc3DPoints(a, 32);
          if (pts.length > 0) {
            const midPtThree = pts[Math.floor(pts.length / 2)];
            _v1.copy(midPtThree).project(camera);
            if (_v1.z <= 1) {
              const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
              const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
              const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
              if (dist < minMidDist) {
                minMidDist = dist;
                closestMidpoint = threeToLogical(midPtThree);
                closestLineId = null;
                closestArcId = a.id;
              }
            }
          }
        }

        if (closestMidpoint) {
          _v1.set(closestMidpoint.x, closestMidpoint.z || 0, closestMidpoint.y).project(camera);
          const sx = ((_v1.x + 1) * mount.clientWidth) / 2;
          const sy = ((-_v1.y + 1) * mount.clientHeight) / 2;
          return {
            logical: closestMidpoint,
            screen: { x: sx, y: sy },
            type: 'midpoint' as const,
            lineId: closestLineId,
            arcId: closestArcId,
          };
        }
      }

      // 3. EDGE PROJECTION SNAP
      if (snapModes.edge) {
        let closestEdgePt: Point3D | null = null;
        let closestLineId: string | null = null;
        let closestArcId: string | null = null;
        let minEdgeDist = 12;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          _v1.set(line.start.x, line.start.z || 0, line.start.y).project(camera);
          _v2.set(line.end.x, line.end.z || 0, line.end.y).project(camera);
          if (_v1.z > 1 || _v2.z > 1) continue;

          const s1x = ((_v1.x + 1) * mount.clientWidth) / 2;
          const s1y = ((-_v1.y + 1) * mount.clientHeight) / 2;
          const s2x = ((_v2.x + 1) * mount.clientWidth) / 2;
          const s2y = ((-_v2.y + 1) * mount.clientHeight) / 2;

          const dx = s2x - s1x;
          const dy = s2y - s1y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq > 0) {
            const t = Math.max(0, Math.min(1, ((mouseScreen.x - s1x) * dx + (mouseScreen.y - s1y) * dy) / lenSq));
            const px = s1x + t * dx;
            const py = s1y + t * dy;
            const dist = Math.hypot(mouseScreen.x - px, mouseScreen.y - py);
            if (dist < minEdgeDist) {
              minEdgeDist = dist;
              closestEdgePt = {
                x: Math.round((line.start.x + t * (line.end.x - line.start.x)) * 2) / 2,
                y: Math.round((line.start.y + t * (line.end.y - line.start.y)) * 2) / 2,
                z: Math.round(((line.start.z || 0) + t * ((line.end.z || 0) - (line.start.z || 0))) * 2) / 2,
              };
              closestLineId = line.id;
              closestArcId = null;
            }
          }
        }

        for (let i = 0; i < arcs.length; i++) {
          const arc = arcs[i];
          const pts = getArc3DPoints(arc, 32);
          for (let j = 0; j < pts.length - 1; j++) {
            _v1.copy(pts[j]).project(camera);
            _v2.copy(pts[j + 1]).project(camera);
            if (_v1.z > 1 || _v2.z > 1) continue;

            const s1x = ((_v1.x + 1) * mount.clientWidth) / 2;
            const s1y = ((-_v1.y + 1) * mount.clientHeight) / 2;
            const s2x = ((_v2.x + 1) * mount.clientWidth) / 2;
            const s2y = ((-_v2.y + 1) * mount.clientHeight) / 2;

            const dx = s2x - s1x;
            const dy = s2y - s1y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0) {
              const t = Math.max(0, Math.min(1, ((mouseScreen.x - s1x) * dx + (mouseScreen.y - s1y) * dy) / lenSq));
              const px = s1x + t * dx;
              const py = s1y + t * dy;
              const dist = Math.hypot(mouseScreen.x - px, mouseScreen.y - py);
              if (dist < minEdgeDist) {
                minEdgeDist = dist;
                const pt3 = pts[j].clone().lerp(pts[j + 1], t);
                closestEdgePt = threeToLogical(pt3);
                closestArcId = arc.id;
                closestLineId = null;
              }
            }
          }
        }

        if (closestEdgePt) {
          return {
            logical: closestEdgePt,
            screen: mouseScreen,
            type: 'edge' as const,
            lineId: closestLineId,
            arcId: closestArcId,
          };
        }
      }

      // 4. FACE RAYCAST SNAP
      // 4. DRAFTING PLANE INTERSECTION (Primary 3D Sketching Surface in the Air)
      let draftingPlanePt: Point3D | null = null;
      let distToDraftingPlane = Infinity;

      // If drafting circle, arc, or cylinder with an active center, project directly onto its surface plane
      if (
        (activeTool === 'circle' || activeTool === 'arc' || activeTool === 'cylinder') &&
        (activeAnchorRef.current || cylinderDraftRef.current.step > 0)
      ) {
        const centerPt = activeAnchorRef.current || cylinderDraftRef.current.center;
        if (centerPt) {
          const centerThree = logicalToThree(centerPt);
          const normThree = logicalToThreeNormal(activeNormalRef.current);
          _draftingPlane.setFromNormalAndCoplanarPoint(normThree, centerThree);
          _mouseVec.set(mouseX, mouseY);
          _raycaster.setFromCamera(_mouseVec, camera);
          if (_raycaster.ray.intersectPlane(_draftingPlane, _intersectPt)) {
            distToDraftingPlane = _raycaster.ray.origin.distanceTo(_intersectPt);
            draftingPlanePt = threeToLogical(_intersectPt);
          }
        }
      }

      if (!draftingPlanePt) {
        let planeNormalX = 0, planeNormalY = 1, planeNormalZ = 0;
        if (activeIsoplane === 'front') {
          planeNormalY = 0; planeNormalZ = 1;
        } else if (activeIsoplane === 'side') {
          planeNormalY = 0; planeNormalX = 1;
        }
        _draftingPlane.normal.set(planeNormalX, planeNormalY, planeNormalZ);
        _draftingPlane.constant = -activeElevation;

        _mouseVec.set(mouseX, mouseY);
        _raycaster.setFromCamera(_mouseVec, camera);
        if (_raycaster.ray.intersectPlane(_draftingPlane, _intersectPt)) {
          distToDraftingPlane = _raycaster.ray.origin.distanceTo(_intersectPt);
          let logical = threeToLogical(_intersectPt);
          if (snapModes.grid && gridSettings.snapToGrid) {
            logical = {
              x: Math.round(logical.x),
              y: Math.round(logical.y),
              z: activeIsoplane === 'top' ? activeElevation : Math.round(logical.z),
            };
          }
          draftingPlanePt = logical;
        }
      }

      // 5. FACE RAYCAST SNAP
      // If user is selecting or erasing, allow selecting any face.
      // If user is drafting (lines, shapes):
      // - Do NOT drop through the air onto faces that are behind/below the active elevation plane!
      // - Only snap if the face is in front of the drafting plane OR on the active elevation!
      if (snapModes.face) {
        _mouseVec.set(mouseX, mouseY);
        _raycaster.setFromCamera(_mouseVec, camera);
        const faceGroup = facesGroupRef.current;
        if (faceGroup && faceGroup.children.length > 0) {
          const hits = _raycaster.intersectObjects(faceGroup.children, false);
          if (hits.length > 0) {
            const hit = hits[0];
            const isSelectOrErase = activeTool === 'select' || activeTool === 'eraser';
            const hitLogical = threeToLogical(hit.point);
            const isFaceInFront = !draftingPlanePt || hit.distance < distToDraftingPlane - 0.05;
            const isNearElevation = Math.abs((hitLogical.z || 0) - activeElevation) < 0.5;

            if (isSelectOrErase || (isFaceInFront && (activeElevation === 0 || isNearElevation))) {
              const faceData = (hit.object as any).userData?.faceData as Face3D | undefined;
              const cylData = (hit.object as any).userData?.cylinderData as DrawingCylinder | undefined;
              const sphereData = (hit.object as any).userData?.sphereData as DrawingSphere | undefined;
              return {
                logical: hitLogical,
                screen: mouseScreen,
                type: 'face' as const,
                faceData,
                cylinderData: cylData,
                sphereData,
              };
            }
          }
        }
      }

      // 6. Return Drafting Plane Snap (In the air at activeElevation!)
      if (draftingPlanePt) {
        return {
          logical: draftingPlanePt,
          screen: mouseScreen,
          type: 'grid' as const,
        };
      }

      return null;
    },
    [lines, arcs, magnetSnapEnabled, snapModes, activeIsoplane, activeElevation, gridSettings.snapToGrid, activeTool]
  );

  // -------------------------------------------------------------
  // 8. Update Preview & Snap Overlay Markers
  // -------------------------------------------------------------
  const updatePreviewAndMarkers = useCallback(
    (snap: { logical: Point3D; screen: ScreenPoint; type: string }) => {
      const prevGroup = previewGroupRef.current;
      prevGroup.clear();

      const marker = cursorMarkerRef.current;
      const snapRing = vertexSnapRingRef.current;
      const edgeMarker = edgeSnapMarkerRef.current;
      const midMarker = midpointSnapMarkerRef.current;

      const snapPos = logicalToThree(snap.logical);

      if (marker) {
        marker.position.copy(snapPos);
        marker.visible =
          activeTool === 'line' ||
          activeTool === 'circle' ||
          activeTool === 'arc' ||
          activeTool === 'cylinder';
      }

      if (snapRing) {
        if (snap.type === 'vertex') {
          snapRing.position.copy(snapPos);
          snapRing.visible = true;
        } else {
          snapRing.visible = false;
        }
      }

      if (midMarker) {
        if (snap.type === 'midpoint') {
          midMarker.position.copy(snapPos);
          midMarker.visible = true;
        } else {
          midMarker.visible = false;
        }
      }

      if (edgeMarker) {
        if (snap.type === 'edge') {
          edgeMarker.position.copy(snapPos);
          edgeMarker.visible = true;
        } else {
          edgeMarker.visible = false;
        }
      }

      if (activeTool === 'line' && activeAnchorRef.current) {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vEnd = snapPos;
        const prevGeo = new THREE.BufferGeometry().setFromPoints([vStart, vEnd]);
        const prevMat = new THREE.LineDashedMaterial({
          color: 0x4f46e5,
          dashSize: 0.5,
          gapSize: 0.25,
        });
        const line = new THREE.Line(prevGeo, prevMat);
        line.computeLineDistances();
        prevGroup.add(line);
      } else if (activeTool === 'circle' && activeAnchorRef.current) {
        const centerThree = logicalToThree(activeAnchorRef.current);
        const radius = Math.max(1, Math.round(centerThree.distanceTo(snapPos)));
        const normThree = logicalToThreeNormal(activeNormalRef.current);
        const points = getArcPoints(centerThree, radius, normThree, 0, 360, 48);

        const circleGeo = new THREE.BufferGeometry().setFromPoints(points);
        const circleMat = new THREE.LineDashedMaterial({
          color: 0x4f46e5,
          dashSize: 0.5,
          gapSize: 0.25,
        });
        const circle = new THREE.Line(circleGeo, circleMat);
        circle.computeLineDistances();
        prevGroup.add(circle);

        const rGeo = new THREE.BufferGeometry().setFromPoints([centerThree, snapPos]);
        const rMat = new THREE.LineBasicMaterial({ color: 0x818cf8 });
        prevGroup.add(new THREE.Line(rGeo, rMat));
      } else if (activeTool === 'arc' && activeAnchorRef.current) {
        const p1Three = logicalToThree(activeAnchorRef.current);
        const p2Three = snapPos;
        const chordDist = p1Three.distanceTo(p2Three);

        if (chordDist > 0.05) {
          // Default preview radius: 2 * distance between points (per user specification)
          const defaultR = Math.max(1, Math.round(chordDist * 2));
          const arcRes = getTwoPointArcPoints(p1Three, p2Three, defaultR, activeBulgeDir, 48);

          const arcGeo = new THREE.BufferGeometry().setFromPoints(arcRes.points);
          const arcMat = new THREE.LineDashedMaterial({
            color: 0x4f46e5,
            dashSize: 0.5,
            gapSize: 0.25,
          });
          const arcLine = new THREE.Line(arcGeo, arcMat);
          arcLine.computeLineDistances();
          prevGroup.add(arcLine);

          // Straight chord line connecting the two vertices
          const dGeo = new THREE.BufferGeometry().setFromPoints([p1Three, p2Three]);
          prevGroup.add(new THREE.Line(dGeo, new THREE.LineBasicMaterial({ color: 0x818cf8 })));

          // Small apex indicator dot
          const apexGeo = new THREE.SphereGeometry(0.12, 8, 8);
          const apexMat = new THREE.MeshBasicMaterial({ color: 0x6366f1 });
          const apexMesh = new THREE.Mesh(apexGeo, apexMat);
          apexMesh.position.copy(arcRes.apex);
          prevGroup.add(apexMesh);
        }
      } else if (activeTool === 'cylinder') {
        const cDraft = cylinderDraftRef.current;
        if (cDraft.step === 1 && activeAnchorRef.current) {
          // Step 1: Base radius preview
          const centerThree = logicalToThree(activeAnchorRef.current);
          const radius = Math.max(1, Math.round(centerThree.distanceTo(snapPos)));
          const normThree = logicalToThreeNormal(activeNormalRef.current);
          const points = getArcPoints(centerThree, radius, normThree, 0, 360, 48);

          const circleGeo = new THREE.BufferGeometry().setFromPoints(points);
          const circleMat = new THREE.LineDashedMaterial({
            color: 0x4f46e5,
            dashSize: 0.5,
            gapSize: 0.25,
          });
          const circle = new THREE.Line(circleGeo, circleMat);
          circle.computeLineDistances();
          prevGroup.add(circle);

          const rGeo = new THREE.BufferGeometry().setFromPoints([centerThree, snapPos]);
          prevGroup.add(new THREE.Line(rGeo, new THREE.LineBasicMaterial({ color: 0x818cf8 })));
        } else if (cDraft.step === 2 && cDraft.center) {
          // Step 2: Height along normal preview
          const centerThree = logicalToThree(cDraft.center);
          const normThree = logicalToThreeNormal(cDraft.normal);
          const axisLine = new THREE.Line3(
            centerThree.clone().addScaledVector(normThree, -100),
            centerThree.clone().addScaledVector(normThree, 100)
          );
          const closestPointOnAxis = new THREE.Vector3();
          const camera = activeCameraRef.current;
          if (camera) {
            _mouseVec.set(
              (snap.screen.x / (mountRef.current?.clientWidth || 1)) * 2 - 1,
              -(snap.screen.y / (mountRef.current?.clientHeight || 1)) * 2 + 1
            );
            _raycaster.setFromCamera(_mouseVec, camera);
            _raycaster.ray.distanceSqToSegment(axisLine.start, axisLine.end, undefined, closestPointOnAxis);
          }
          const signedH = closestPointOnAxis.clone().sub(centerThree).dot(normThree);
          const height = Math.max(1, Math.round(Math.abs(signedH)));

          const { basePoints, topPoints, silhouetteLines, midPoint, quaternion } = getCylinderGeometryData(
            centerThree,
            cDraft.radius,
            height,
            normThree
          );

          const dashMat = new THREE.LineDashedMaterial({ color: 0x4f46e5, dashSize: 0.5, gapSize: 0.25 });
          const baseLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(basePoints), dashMat);
          baseLine.computeLineDistances();
          prevGroup.add(baseLine);

          const topLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPoints), dashMat);
          topLine.computeLineDistances();
          prevGroup.add(topLine);

          silhouetteLines.forEach(([p1, p2]) => {
            const sLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), dashMat);
            sLine.computeLineDistances();
            prevGroup.add(sLine);
          });

          // Translucent cylinder preview mesh
          const cylGeo = new THREE.CylinderGeometry(cDraft.radius, cDraft.radius, height, 32, 1, false);
          const cylMat = new THREE.MeshBasicMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
          });
          const cylMesh = new THREE.Mesh(cylGeo, cylMat);
          cylMesh.position.copy(midPoint);
          cylMesh.quaternion.copy(quaternion);
          prevGroup.add(cylMesh);
        }
      }

      requestRender();
    },
    [activeTool, activeIsoplane, requestRender]
  );

  // Switch Blender-style alignment mode on-the-fly
  const switchAlignmentMode = useCallback(
    (newMode: AlignmentMode) => {
      setAlignmentMode(newMode);
      const snap = currentSnapRef.current;
      const targetNorm = getDraftingNormal(newMode, snap?.logical, snap?.faceData);
      activeNormalRef.current = targetNorm;
      if (cylinderDraftRef.current.step > 0) {
        cylinderDraftRef.current.normal = targetNorm;
      }
      if (snap) {
        updatePreviewAndMarkers(snap);
      }
    },
    [getDraftingNormal, updatePreviewAndMarkers]
  );

  // Elevate active drafting height up / down (Keys: E and Q)
  const handleStepElevation = useCallback(
    (delta: number) => {
      const nextElev = (activeElevationRef.current ?? 0) + delta;
      activeElevationRef.current = nextElev;
      onSetElevation?.(nextElev);

      const snap = currentSnapRef.current;
      if (snap) {
        if (activeIsoplane === 'top') {
          snap.logical.z = nextElev;
        } else if (activeIsoplane === 'front') {
          snap.logical.y = nextElev;
        } else {
          snap.logical.x = nextElev;
        }
        updatePreviewAndMarkers(snap);
      }
      requestRender();
    },
    [onSetElevation, activeIsoplane, updatePreviewAndMarkers, requestRender]
  );

  // Blender Keyboard Shortcuts (E / Q Elevate, Z, Y, X, V, N, F9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'F9') {
        e.preventDefault();
        setIsOperatorOpen((prev) => !prev);
        return;
      }

      const key = e.key.toLowerCase();

      // Key E: Elevate UP by 1 (or Shift+E to extrude selected circle to cylinder)
      if (key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.shiftKey && selectedArcId) {
          const arc = arcs.find((a) => a.id === selectedArcId);
          if (arc) {
            e.preventDefault();
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
              layerId: activeLayerId,
              style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
            };
            onAddCylinder?.(newCyl);
            onSelectArc?.(null);
            onSelectCylinder?.(newCyl.id);
            requestRender();
            return;
          }
        }
        e.preventDefault();
        handleStepElevation(1);
        return;
      }

      // Key Q: Elevate DOWN by 1
      if (key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleStepElevation(-1);
        return;
      }

      if (activeTool === 'arc') {
        let newDir: ArcBulgeDirection | null = null;
        if (key === 'z') {
          newDir = e.shiftKey ? '-z' : (activeBulgeDir === '+z' ? '-z' : '+z');
        } else if (key === 'y') {
          newDir = e.shiftKey ? '-y' : (activeBulgeDir === '+y' ? '-y' : '+y');
        } else if (key === 'x') {
          newDir = e.shiftKey ? '-x' : (activeBulgeDir === '+x' ? '-x' : '+x');
        }

        if (newDir) {
          e.preventDefault();
          setActiveBulgeDir(newDir);
          if (lastCreatedEntity && lastCreatedEntity.type === 'arc') {
            handleOperatorUpdate({ bulgeDir: newDir });
          }
          requestRender();
          return;
        }

        // Radius +/- shortcuts
        if (key === '+' || key === '=') {
          if (lastCreatedEntity && lastCreatedEntity.type === 'arc') {
            e.preventDefault();
            handleOperatorUpdate({ radius: lastCreatedEntity.radius + 1 });
            return;
          }
        } else if (key === '-' || key === '_') {
          if (lastCreatedEntity && lastCreatedEntity.type === 'arc') {
            e.preventDefault();
            handleOperatorUpdate({ radius: Math.max(1, lastCreatedEntity.radius - 1) });
            return;
          }
        } else if (key === 'p' || key === 's') {
          if (lastCreatedEntity && lastCreatedEntity.type === 'arc' && lastCreatedEntity.chordDistance) {
            e.preventDefault();
            // π Semicircle preset: R = D/2
            handleOperatorUpdate({ radius: Math.max(1, Math.round(lastCreatedEntity.chordDistance / 2)) });
            return;
          }
        }
      } else if (activeTool === 'circle' || activeTool === 'cylinder') {
        if (key === 'z') {
          switchAlignmentMode('world-z');
        } else if (key === 'y') {
          switchAlignmentMode('world-y');
        } else if (key === 'x') {
          switchAlignmentMode('world-x');
        } else if (key === 'v') {
          switchAlignmentMode('view');
        } else if (key === 'n') {
          switchAlignmentMode('surface');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTool,
    activeBulgeDir,
    lastCreatedEntity,
    selectedArcId,
    arcs,
    activeLayerId,
    onAddCylinder,
    onSelectArc,
    onSelectCylinder,
    switchAlignmentMode,
    handleStepElevation,
    requestRender,
  ]);

  // Blender-style Operator Panel updates (Adjust Last Operation)
  const handleOperatorUpdate = useCallback(
    (updates: {
      alignmentMode?: AlignmentMode;
      bulgeDir?: ArcBulgeDirection;
      radius?: number;
      height?: number;
      invertNormal?: boolean;
    }) => {
      if (!lastCreatedEntity) return;

      const newRadius = updates.radius !== undefined ? Math.max(1, updates.radius) : lastCreatedEntity.radius;
      const newHeight = updates.height !== undefined ? Math.max(1, updates.height) : (lastCreatedEntity.height ?? 5);
      const newAlign = updates.alignmentMode ?? lastCreatedEntity.alignmentMode;
      const newBulgeDir = updates.bulgeDir ?? lastCreatedEntity.bulgeDir ?? activeBulgeDir;
      let newNormal = { ...lastCreatedEntity.normal };

      if (updates.alignmentMode) {
        newNormal = getDraftingNormal(updates.alignmentMode, lastCreatedEntity.center);
      }
      if (updates.invertNormal) {
        newNormal = { x: -newNormal.x, y: -newNormal.y, z: -newNormal.z };
      }

      if (lastCreatedEntity.type === 'cylinder') {
        const existing = cylinders.find((c) => c.id === lastCreatedEntity.id);
        if (existing) {
          const updated: DrawingCylinder = {
            ...existing,
            radius: newRadius,
            height: newHeight,
            normal: newNormal,
          };
          onUpdateCylinder?.(updated);
        }
      } else if (lastCreatedEntity.type === 'circle' || lastCreatedEntity.type === 'arc') {
        const existing = arcs.find((a) => a.id === lastCreatedEntity.id);
        if (existing) {
          let updated: DrawingArc;
          if (lastCreatedEntity.startPoint && lastCreatedEntity.endPoint) {
            const p1Three = logicalToThree(lastCreatedEntity.startPoint);
            const p2Three = logicalToThree(lastCreatedEntity.endPoint);
            const calcRes = getTwoPointArcPoints(p1Three, p2Three, newRadius, newBulgeDir, 48);
            newNormal = threeToLogicalNormal(calcRes.normal);
            updated = {
              ...existing,
              radius: calcRes.actualRadius,
              center: threeToLogical(calcRes.center),
              normal: newNormal,
              bulgeDir: newBulgeDir,
              endAngle: Math.round((calcRes.subtendedAngle * 180) / Math.PI),
            };
          } else {
            updated = {
              ...existing,
              radius: newRadius,
              normal: newNormal,
            };
          }
          onUpdateArc?.(updated);
        }
      }

      setLastCreatedEntity((prev) =>
        prev
          ? {
              ...prev,
              radius: newRadius,
              height: newHeight,
              normal: newNormal,
              alignmentMode: newAlign,
              bulgeDir: newBulgeDir,
            }
          : null
      );
      if (updates.bulgeDir) {
        setActiveBulgeDir(updates.bulgeDir);
      }
      requestRender();
    },
    [lastCreatedEntity, activeBulgeDir, cylinders, arcs, getDraftingNormal, onUpdateCylinder, onUpdateArc, requestRender]
  );

  // -------------------------------------------------------------
  // 9. Pointer Event Handlers (High Performance: Zero Drag Overhead!)
  // -------------------------------------------------------------
  const handlePointerMove = (e: React.PointerEvent) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // 1. Blender Modal Transform in progress (G, R, S)
    if (modalTransform.active) {
      const dxPixels = e.clientX - modalStartRef.current.mousePos.x;
      const dyPixels = e.clientY - modalStartRef.current.mousePos.y;
      const mode = modalTransform.mode;
      const lock = modalTransform.axisLock;
      const sensitivity = 0.08;

      if (mode === 'translate') {
        const p = modalStartRef.current.startPivotPos.clone();
        if (lock === 'X') {
          const dx = Math.round(dxPixels * sensitivity);
          p.x += dx;
          setLiveTransformHud({ visible: true, mode: 'translate', dx, dy: 0, dz: 0 });
        } else if (lock === 'Y') {
          // Three.js Z = logical Y (depth)
          const dy = Math.round(-dyPixels * sensitivity);
          p.z += dy;
          setLiveTransformHud({ visible: true, mode: 'translate', dx: 0, dy, dz: 0 });
        } else if (lock === 'Z') {
          // Three.js Y = logical Z (height)
          const dz = Math.round(-dyPixels * sensitivity);
          p.y += dz;
          setLiveTransformHud({ visible: true, mode: 'translate', dx: 0, dy: 0, dz });
        } else {
          const dx = Math.round(dxPixels * sensitivity);
          const dz = Math.round(-dyPixels * sensitivity);
          p.x += dx;
          p.y += dz;
          setLiveTransformHud({ visible: true, mode: 'translate', dx, dy: 0, dz });
        }
        transformGroupRef.current.position.copy(p);
        updateAxisGuide(lock, p);
      } else if (mode === 'rotate') {
        const deg = Math.round(dxPixels * 0.8);
        const rad = THREE.MathUtils.degToRad(deg);
        const r = modalStartRef.current.startPivotRot.clone();
        if (lock === 'X') r.x += rad;
        else if (lock === 'Y') r.z += rad;
        else if (lock === 'Z') r.y += rad;
        else r.y += rad;
        transformGroupRef.current.rotation.copy(r);
        setLiveTransformHud({ visible: true, mode: 'rotate', dx: 0, dy: 0, dz: 0, angle: deg });
      } else if (mode === 'scale') {
        const factor = Math.max(0.1, Number((1 + dxPixels * 0.01).toFixed(2)));
        const s = modalStartRef.current.startPivotScale.clone();
        if (lock === 'X') s.x *= factor;
        else if (lock === 'Y') s.z *= factor;
        else if (lock === 'Z') s.y *= factor;
        else s.multiplyScalar(factor);
        transformGroupRef.current.scale.copy(s);
        setLiveTransformHud({ visible: true, mode: 'scale', dx: 0, dy: 0, dz: 0, scale: factor });
      }
      requestRender();
      return;
    }

    // CRITICAL: When any button is pressed (right drag rotating or pan), bypass all snapping/raycasting!
    if (e.buttons !== 0) {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      return;
    }

    const snap = getScreenSpaceSnap(e.clientX, e.clientY, e.ctrlKey);
    if (!snap) {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      return;
    }

    currentSnapRef.current = snap;
    updatePreviewAndMarkers(snap);

    // Hover Highlight Layer
    const hlGroup = hoverGroupRef.current;
    hlGroup.clear();

    if (snap.type === 'face' && snap.sphereData) {
      const centerThree = logicalToThree(snap.sphereData.center);
      const sphGeo = new THREE.SphereGeometry(snap.sphereData.radius * 1.01, 24, 16);
      const sphHl = new THREE.Mesh(
        sphGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
          depthTest: false,
        })
      );
      sphHl.position.copy(centerThree);
      hlGroup.add(sphHl);
    } else if (snap.type === 'face' && snap.faceData && selectionMode === 'face') {
      const v = snap.faceData.vertices.map(logicalToThree);
      const faceGeo = new THREE.BufferGeometry();
      if (v.length === 3) {
        faceGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          v[0].x, v[0].y, v[0].z,
          v[1].x, v[1].y, v[1].z,
          v[2].x, v[2].y, v[2].z,
        ]), 3));
      } else if (v.length >= 4) {
        faceGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          v[0].x, v[0].y, v[0].z,
          v[1].x, v[1].y, v[1].z,
          v[2].x, v[2].y, v[2].z,
          v[0].x, v[0].y, v[0].z,
          v[2].x, v[2].y, v[2].z,
          v[3].x, v[3].y, v[3].z,
        ]), 3));
      }
      faceGeo.computeVertexNormals();
      hlGroup.add(new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })));
    } else if (snap.type === 'edge') {
      if (snap.lineId) {
        const line = lines.find((l) => l.id === snap.lineId);
        if (line) {
          const v1 = logicalToThree(line.start);
          const v2 = logicalToThree(line.end);
          const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
          hlGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x06b6d4,
            linewidth: 3,
            depthTest: false,
          })));
        }
      } else if (snap.arcId) {
        const arc = arcs.find((a) => a.id === snap.arcId);
        if (arc) {
          const pts = getArc3DPoints(arc, 48);
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          hlGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x06b6d4,
            linewidth: 3,
            depthTest: false,
          })));
        }
      }
    }

    // Direct DOM Tooltip update (0 React re-renders)
    if (tooltipRef.current) {
      let tag = `X:${snap.logical.x} Y:${snap.logical.y} Z:${snap.logical.z || 0} • [${snap.type.toUpperCase()}]`;
      if (snap.type === 'edge') {
        if (snap.arcId) {
          tag = `Arc Edge • ${tag}`;
        } else if (snap.lineId) {
          tag = `Line Edge • ${tag}`;
        }
      }
      if (activeTool === 'circle' && activeAnchorRef.current) {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vCur = logicalToThree(snap.logical);
        const r = Math.max(1, Math.round(vStart.distanceTo(vCur)));
        tag = `Circle R:${r} • ${tag}`;
      } else if (activeTool === 'arc' && activeAnchorRef.current) {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vCur = logicalToThree(snap.logical);
        const d = Math.round(vStart.distanceTo(vCur) * 10) / 10;
        const r = Math.max(1, Math.round(d * 2));
        tag = `Arc Dist:${d} R:${r} (${activeBulgeDir.toUpperCase()}) • ${tag}`;
      } else if (activeTool === 'cylinder') {
        const cDraft = cylinderDraftRef.current;
        if (cDraft.step === 1 && activeAnchorRef.current) {
          const vStart = logicalToThree(activeAnchorRef.current);
          const vCur = logicalToThree(snap.logical);
          const r = Math.max(1, Math.round(vStart.distanceTo(vCur)));
          tag = `Cylinder Base R:${r} (Click to confirm radius) • ${tag}`;
        } else if (cDraft.step === 2 && cDraft.center) {
          const centerThree = logicalToThree(cDraft.center);
          const normThree = logicalToThreeNormal(cDraft.normal);
          const axisLine = new THREE.Line3(
            centerThree.clone().addScaledVector(normThree, -100),
            centerThree.clone().addScaledVector(normThree, 100)
          );
          const closestPointOnAxis = new THREE.Vector3();
          const camera = activeCameraRef.current;
          if (camera) {
            _mouseVec.set(
              (snap.screen.x / (mountRef.current?.clientWidth || 1)) * 2 - 1,
              -(snap.screen.y / (mountRef.current?.clientHeight || 1)) * 2 + 1
            );
            _raycaster.setFromCamera(_mouseVec, camera);
            _raycaster.ray.distanceSqToSegment(axisLine.start, axisLine.end, undefined, closestPointOnAxis);
          }
          const signedH = closestPointOnAxis.clone().sub(centerThree).dot(normThree);
          const height = Math.max(1, Math.round(Math.abs(signedH)));
          tag = `Cylinder R:${cDraft.radius} Height:${height} (Click to complete) • ${tag}`;
        }
      }
      tooltipRef.current.style.display = 'block';
      tooltipRef.current.style.left = `${snap.screen.x + 14}px`;
      tooltipRef.current.style.top = `${snap.screen.y - 12}px`;
      tooltipRef.current.textContent = tag;
    }

    // Update global cursorStore (throttled)
    cursorStore.update({
      screen: snap.screen,
      logical: snap.logical,
      snapType: snap.type,
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY, button: e.button };

    // Modal Transform Click Handling: Left-Click confirms, Right-Click cancels
    if (modalTransformRef.current.active) {
      if (e.button === 0) {
        commitModalTransform();
      } else if (e.button === 2) {
        cancelModalTransform();
      }
      return;
    }

    // Right-click while dragging cancels transform! (Blender behavior)
    if (e.button === 2 && isDraggingRef.current) {
      isDraggingRef.current = false;
      pivotMeshRef.current.position.copy(dragStartPivotPos.current);
      pivotMeshRef.current.rotation.copy(dragStartPivotRot.current);
      pivotMeshRef.current.scale.copy(dragStartPivotScale.current);
      if (axisGuideLineRef.current) axisGuideLineRef.current.visible = false;
      setLiveTransformHud((prev) => ({ ...prev, visible: false }));
      if (controlsRef.current) controlsRef.current.enabled = true;
      requestRender();
      return;
    }

    // If interacting with TransformControls gizmo handles, NEVER deselect or trigger drawing tools!
    const tc = transformControlsRef.current;
    if (tc && ((tc as any).axis !== null || isDraggingRef.current)) {
      return;
    }

    // Proactive Raycast & Proximity against TransformControls gizmo pickers (prevents accidental deselect)
    if (tc && tc.object && activeCameraRef.current && rendererRef.current) {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      _raycaster.setFromCamera(pointer, activeCameraRef.current);
      const gizmo = (tc as any)._gizmo;
      if (gizmo && gizmo.picker && gizmo.picker[tc.getMode()]) {
        const hits = _raycaster.intersectObject(gizmo.picker[tc.getMode()], true);
        if (hits.length > 0) {
          (tc as any).axis = hits[0].object.name;
          return;
        }
      }
      // Check 2D screen distance to gizmo center (within 36px)
      const p = tc.object.position.clone().project(activeCameraRef.current);
      const screenX = ((p.x + 1) * rect.width) / 2 + rect.left;
      const screenY = ((-p.y + 1) * rect.height) / 2 + rect.top;
      if (Math.hypot(e.clientX - screenX, e.clientY - screenY) < 36) {
        (tc as any).axis = tc.getMode() === 'rotate' ? 'E' : 'XYZ';
        return;
      }
    }

    // Right-click and middle-click are reserved for rotation and pan!
    if (e.button !== 0) return;

    const snap = currentSnapRef.current;
    if (!snap) return;

    if (activeTool === 'line') {
      if (!activeAnchorRef.current) {
        onSetAnchor(snap.logical);
      } else {
        const isSame =
          snap.logical.x === activeAnchorRef.current.x &&
          snap.logical.y === activeAnchorRef.current.y &&
          (snap.logical.z || 0) === (activeAnchorRef.current.z || 0);

        if (!isSame) {
          const newLine: DrawingLine = {
            id: `line-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            start: { ...activeAnchorRef.current },
            end: { ...snap.logical },
            layerId: activeLayerId,
            style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
          };
          onAddLine(newLine);
          onSetAnchor(snap.logical);
        }
      }
    } else if (activeTool === 'circle') {
      if (!activeAnchorRef.current) {
        const targetNormal = getDraftingNormal(alignmentMode, snap.logical, snap.faceData);
        activeNormalRef.current = targetNormal;
        onSetAnchor(snap.logical);
      } else {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vCur = logicalToThree(snap.logical);
        const radius = Math.max(1, Math.round(vStart.distanceTo(vCur)));

        const newArc: DrawingArc = {
          id: `arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          center: { ...activeAnchorRef.current },
          radius,
          normal: { ...activeNormalRef.current },
          startAngle: 0,
          endAngle: 360,
          plane: activeIsoplane,
          layerId: activeLayerId,
          style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
        };
        onAddArc?.(newArc);
        setLastCreatedEntity({
          type: 'circle',
          id: newArc.id,
          radius: newArc.radius,
          normal: { ...activeNormalRef.current },
          alignmentMode,
          center: newArc.center,
          startAngle: 0,
          endAngle: 360,
        });
        setIsOperatorOpen(true);
        onSetAnchor(null);
      }
    } else if (activeTool === 'arc') {
      if (!activeAnchorRef.current) {
        onSetAnchor(snap.logical);
      } else {
        const p1Three = logicalToThree(activeAnchorRef.current);
        const p2Three = logicalToThree(snap.logical);
        const chordDist = p1Three.distanceTo(p2Three);

        if (chordDist < 0.05) {
          return;
        }

        // Default radius: 2 * distance between points (per user specification)
        const defaultRadius = Math.max(1, Math.round(chordDist * 2));
        const calcRes = getTwoPointArcPoints(p1Three, p2Three, defaultRadius, activeBulgeDir, 48);

        const newArc: DrawingArc = {
          id: `arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          center: threeToLogical(calcRes.center),
          radius: calcRes.actualRadius,
          normal: threeToLogicalNormal(calcRes.normal),
          startPoint: { ...activeAnchorRef.current },
          endPoint: { ...snap.logical },
          bulgeDir: activeBulgeDir,
          startAngle: 0,
          endAngle: Math.round((calcRes.subtendedAngle * 180) / Math.PI),
          plane: activeIsoplane,
          layerId: activeLayerId,
          style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
        };
        onAddArc?.(newArc);
        setLastCreatedEntity({
          type: 'arc',
          id: newArc.id,
          radius: newArc.radius,
          normal: { ...threeToLogicalNormal(calcRes.normal) },
          alignmentMode,
          center: newArc.center,
          startPoint: newArc.startPoint,
          endPoint: newArc.endPoint,
          bulgeDir: activeBulgeDir,
          chordDistance: Math.round(chordDist * 10) / 10,
        });
        setIsOperatorOpen(true);
        onSetAnchor(null);
      }
    } else if (activeTool === 'cylinder') {
      const cDraft = cylinderDraftRef.current;
      if (cDraft.step === 0) {
        const targetNormal = getDraftingNormal(alignmentMode, snap.logical, snap.faceData);
        activeNormalRef.current = targetNormal;
        cDraft.step = 1;
        cDraft.center = snap.logical;
        cDraft.normal = targetNormal;
        onSetAnchor(snap.logical);
      } else if (cDraft.step === 1) {
        const vStart = logicalToThree(cDraft.center!);
        const vCur = logicalToThree(snap.logical);
        cDraft.radius = Math.max(1, Math.round(vStart.distanceTo(vCur)));
        cDraft.step = 2;
      } else if (cDraft.step === 2) {
        const centerThree = logicalToThree(cDraft.center!);
        const normThree = logicalToThreeNormal(cDraft.normal);
        const axisLine = new THREE.Line3(
          centerThree.clone().addScaledVector(normThree, -100),
          centerThree.clone().addScaledVector(normThree, 100)
        );
        const closestPointOnAxis = new THREE.Vector3();
        const camera = activeCameraRef.current;
        if (camera) {
          _mouseVec.set(
            (snap.screen.x / (mountRef.current?.clientWidth || 1)) * 2 - 1,
            -(snap.screen.y / (mountRef.current?.clientHeight || 1)) * 2 + 1
          );
          _raycaster.setFromCamera(_mouseVec, camera);
          _raycaster.ray.distanceSqToSegment(axisLine.start, axisLine.end, undefined, closestPointOnAxis);
        }
        const signedH = closestPointOnAxis.clone().sub(centerThree).dot(normThree);
        const height = Math.max(1, Math.round(Math.abs(signedH)));

        const newCyl: DrawingCylinder = {
          id: `cylinder-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          center: { ...cDraft.center! },
          radius: cDraft.radius,
          height,
          normal: { ...cDraft.normal },
          layerId: activeLayerId,
          style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
        };
        onAddCylinder?.(newCyl);
        setLastCreatedEntity({
          type: 'cylinder',
          id: newCyl.id,
          radius: newCyl.radius,
          height: newCyl.height,
          normal: newCyl.normal,
          alignmentMode,
          center: newCyl.center,
        });
        setIsOperatorOpen(true);
        cDraft.step = 0;
        cDraft.center = null;
        onSetAnchor(null);
      }
    } else if (activeTool === 'select' || activeTool === 'eraser') {
      const isShift = e.shiftKey;
      if (selectionMode === 'vertex') {
        if (snap.type === 'vertex') {
          if (activeTool === 'select') {
            if (onToggleSelectVertex) {
              onToggleSelectVertex(snap.logical, isShift);
            } else {
              onSelectVertex?.(snap.logical);
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectSphere?.(null);
              onSelectFace?.(null);
            }
          }
        } else {
          if (!isShift) {
            onClearSelection?.();
            onSelectVertex?.(null);
          }
        }
      } else if (selectionMode === 'face') {
        if (snap.type === 'face') {
          if (snap.sphereData) {
            if (activeTool === 'select') {
              if (onToggleSelectMesh) {
                onToggleSelectMesh('sphere', snap.sphereData.id, isShift);
              } else {
                onSelectSphere?.(snap.sphereData.id);
                onSelectFace?.(null);
                onSelectLine(null);
                onSelectArc?.(null);
                onSelectCylinder?.(null);
                onSelectVertex?.(null);
              }
            } else if (activeTool === 'eraser') {
              onRemoveSphere?.(snap.sphereData.id);
            }
          } else if (snap.faceData) {
            if (activeTool === 'select') {
              if (onToggleSelectFace) {
                onToggleSelectFace(snap.faceData, isShift);
              } else {
                onSelectFace?.(snap.faceData);
                onSelectSphere?.(null);
                onSelectLine(null);
                onSelectArc?.(null);
                onSelectCylinder?.(null);
                onSelectVertex?.(null);
              }
            }
          } else {
            if (!isShift) {
              onClearSelection?.();
              onSelectFace?.(null);
              onSelectSphere?.(null);
            }
          }
        } else {
          if (!isShift) {
            onClearSelection?.();
            onSelectFace?.(null);
            onSelectSphere?.(null);
          }
        }
      } else {
        // selectionMode === 'edge' (or default edge selection)
        let hitLineId = (snap.type === 'edge' ? snap.lineId : null) || null;
        let hitArcId = (snap.type === 'edge' ? snap.arcId : null) || null;
        let hitCylinderId: string | null = null;
        let hitSphereId: string | null = snap.sphereData ? snap.sphereData.id : null;

        // Fallback: If not snapped directly to an edge, perform a screen-space distance search
        // against all lines and arcs with a generous 16px radius around click!
        if (!hitLineId && !hitArcId) {
          const mount = mountRef.current;
          const camera = activeCameraRef.current;
          if (mount && camera) {
            const rect = mount.getBoundingClientRect();
            const clickScreenX = e.clientX - rect.left;
            const clickScreenY = e.clientY - rect.top;
            let closestDist = 16; // 16px threshold for click selection

            // Check lines
            for (const line of lines) {
              _v1.set(line.start.x, line.start.z || 0, line.start.y).project(camera);
              _v2.set(line.end.x, line.end.z || 0, line.end.y).project(camera);
              if (_v1.z > 1 || _v2.z > 1) continue;

              const s1x = ((_v1.x + 1) * mount.clientWidth) / 2;
              const s1y = ((-_v1.y + 1) * mount.clientHeight) / 2;
              const s2x = ((_v2.x + 1) * mount.clientWidth) / 2;
              const s2y = ((-_v2.y + 1) * mount.clientHeight) / 2;

              const dx = s2x - s1x;
              const dy = s2y - s1y;
              const lenSq = dx * dx + dy * dy;
              if (lenSq > 0) {
                const t = Math.max(0, Math.min(1, ((clickScreenX - s1x) * dx + (clickScreenY - s1y) * dy) / lenSq));
                const px = s1x + t * dx;
                const py = s1y + t * dy;
                const d = Math.hypot(clickScreenX - px, clickScreenY - py);
                if (d < closestDist) {
                  closestDist = d;
                  hitLineId = line.id;
                  hitArcId = null;
                }
              }
            }

            // Check arcs
            for (const arc of arcs) {
              const pts = getArc3DPoints(arc, 36);
              for (let j = 0; j < pts.length - 1; j++) {
                _v1.copy(pts[j]).project(camera);
                _v2.copy(pts[j + 1]).project(camera);
                if (_v1.z > 1 || _v2.z > 1) continue;

                const s1x = ((_v1.x + 1) * mount.clientWidth) / 2;
                const s1y = ((-_v1.y + 1) * mount.clientHeight) / 2;
                const s2x = ((_v2.x + 1) * mount.clientWidth) / 2;
                const s2y = ((-_v2.y + 1) * mount.clientHeight) / 2;

                const dx = s2x - s1x;
                const dy = s2y - s1y;
                const lenSq = dx * dx + dy * dy;
                if (lenSq > 0) {
                  const t = Math.max(0, Math.min(1, ((clickScreenX - s1x) * dx + (clickScreenY - s1y) * dy) / lenSq));
                  const px = s1x + t * dx;
                  const py = s1y + t * dy;
                  const d = Math.hypot(clickScreenX - px, clickScreenY - py);
                  if (d < closestDist) {
                    closestDist = d;
                    hitArcId = arc.id;
                    hitLineId = null;
                  }
                }
              }
            }
          }
        }

        if (!hitLineId && !hitArcId) {
          cylinders.forEach((cyl) => {
            const cThree = logicalToThree(cyl.center);
            const clickThree = logicalToThree(snap.logical);
            const nThree = cyl.normal ? logicalToThreeNormal(cyl.normal) : new THREE.Vector3(0, 1, 0);
            const diff = clickThree.clone().sub(cThree);
            const hProj = diff.dot(nThree);
            if (hProj >= -0.5 && hProj <= cyl.height + 0.5) {
              const radDist = diff.clone().addScaledVector(nThree, -hProj).length();
              if (Math.abs(radDist - cyl.radius) < 1.5 || radDist <= cyl.radius) {
                hitCylinderId = cyl.id;
              }
            }
          });
        }

        if (!hitLineId && !hitArcId && !hitCylinderId && !hitSphereId) {
          spheres.forEach((sph) => {
            const cThree = logicalToThree(sph.center);
            const clickThree = logicalToThree(snap.logical);
            if (clickThree.distanceTo(cThree) <= sph.radius + 0.5) {
              hitSphereId = sph.id;
            }
          });
        }

        // Face click selection fallback: clicking on a face of a cube/mesh selects the cube/mesh!
        if (!hitLineId && !hitArcId && !hitCylinderId && !hitSphereId) {
          if (snap.type === 'face') {
            if (snap.sphereData) {
              hitSphereId = snap.sphereData.id;
            } else if (snap.cylinderData) {
              hitCylinderId = snap.cylinderData.id;
            } else if (snap.faceData) {
              const fv = snap.faceData.vertices;
              for (const line of lines) {
                const sMatch = fv.some((v) => v.x === line.start.x && v.y === line.start.y && (v.z || 0) === (line.start.z || 0));
                const eMatch = fv.some((v) => v.x === line.end.x && v.y === line.end.y && (v.z || 0) === (line.end.z || 0));
                if (sMatch && eMatch) {
                  hitLineId = line.id;
                  break;
                }
              }
            }
          }
        }

        if (activeTool === 'select') {
          if (hitLineId) {
            if (onToggleSelectEdge) onToggleSelectEdge('line', hitLineId, isShift);
            else {
              onSelectLine(hitLineId);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectSphere?.(null);
              onSelectVertex?.(null);
              onSelectFace?.(null);
            }
          } else if (hitArcId) {
            if (onToggleSelectEdge) onToggleSelectEdge('arc', hitArcId, isShift);
            else {
              onSelectArc?.(hitArcId);
              onSelectLine(null);
              onSelectCylinder?.(null);
              onSelectSphere?.(null);
              onSelectVertex?.(null);
              onSelectFace?.(null);
            }
          } else if (hitCylinderId) {
            if (onToggleSelectMesh) onToggleSelectMesh('cylinder', hitCylinderId, isShift);
            else {
              onSelectCylinder?.(hitCylinderId);
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectSphere?.(null);
              onSelectVertex?.(null);
              onSelectFace?.(null);
            }
          } else if (hitSphereId) {
            if (onToggleSelectMesh) onToggleSelectMesh('sphere', hitSphereId, isShift);
            else {
              onSelectSphere?.(hitSphereId);
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectVertex?.(null);
              onSelectFace?.(null);
            }
          } else {
            if (!isShift) {
              onClearSelection?.();
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectSphere?.(null);
              onSelectVertex?.(null);
              onSelectFace?.(null);
            }
          }
        } else if (activeTool === 'eraser') {
          if (hitLineId) onRemoveLine(hitLineId);
          if (hitArcId) onRemoveArc?.(hitArcId);
          if (hitCylinderId) onRemoveCylinder?.(hitCylinderId);
          if (hitSphereId) onRemoveSphere?.(hitSphereId);
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // If user clicked Right Mouse Button without dragging (< 4px), cancel active tool or deselect!
    if (e.button === 2 && pointerDownPosRef.current && pointerDownPosRef.current.button === 2) {
      const dist = Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y);
      if (dist < 4) {
        cylinderDraftRef.current = { step: 0, center: null, radius: 5, normal: { x: 0, y: 0, z: 1 } };
        if (activeAnchorRef.current) {
          onSetAnchor(null);
        } else {
          onClearSelection?.();
          onSelectLine(null);
          onSelectArc?.(null);
          onSelectCylinder?.(null);
          onSelectSphere?.(null);
          onSelectVertex?.(null);
          onSelectFace?.(null);
        }
        requestRender();
      }
    }
    pointerDownPosRef.current = null;
  };

  const handlePointerLeave = () => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    if (cursorMarkerRef.current) cursorMarkerRef.current.visible = false;
    if (vertexSnapRingRef.current) vertexSnapRingRef.current.visible = false;
    if (edgeSnapMarkerRef.current) edgeSnapMarkerRef.current.visible = false;
    if (midpointSnapMarkerRef.current) midpointSnapMarkerRef.current.visible = false;
    hoverGroupRef.current.clear();
    pointerDownPosRef.current = null;
    requestRender();
  };

  // Prevent default context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // "Sketch on Face" Handler
  const handleSketchOnFace = (face: Face3D) => {
    onSetIsoplane?.(face.plane);
    onSetElevation?.(face.elevation);
  };

  // -------------------------------------------------------------
  // 10. Interactive 3D Orientation Gizmo Click
  // -------------------------------------------------------------
  const handleGizmoCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = gizmoCanvasRef.current;
    const camera = activeCameraRef.current;
    if (!canvas || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const center = canvas.width / 2;
    const r = 28;

    _rotMatrix.extractRotation(camera.matrixWorldInverse);
    _gizmoVx.set(1, 0, 0).applyMatrix4(_rotMatrix);
    _gizmoVy.set(0, 0, 1).applyMatrix4(_rotMatrix);
    _gizmoVz.set(0, 1, 0).applyMatrix4(_rotMatrix);

    const axes = [
      { name: 'x', x: _gizmoVx.x, y: _gizmoVx.y },
      { name: 'y', x: _gizmoVy.x, y: _gizmoVy.y },
      { name: 'z', x: _gizmoVz.x, y: _gizmoVz.y },
    ];

    for (const ax of axes) {
      const px = center + ax.x * r;
      const py = center - ax.y * r;
      if (Math.hypot(clickX - px, clickY - py) < 12) {
        if (ax.name === 'x') setCameraView('right');
        else if (ax.name === 'z') setCameraView('top');
        else setCameraView('front');
        return;
      }

      const negX = center - ax.x * r * 0.72;
      const negY = center + ax.y * r * 0.72;
      if (Math.hypot(clickX - negX, clickY - negY) < 8) {
        if (ax.name === 'x') setCameraView('left');
        else if (ax.name === 'z') setCameraView('bottom');
        else setCameraView('back');
        return;
      }
    }
  };

  const viewBadgeText = `${cameraPreset === 'free' ? 'User' : cameraPreset.toUpperCase()} ${
    isPerspective ? 'Perspective' : 'Orthographic'
  }`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        backgroundColor: theme === 'dark' ? '#1e2026' : '#eef1f5',
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />

      {/* Minimal Blender-Style Viewport Badge (Top-Left) */}
      {/* ============================================================ */}
      {/* 1. Blender-Style Top Viewport Header Bar                     */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* 1. Monochromatic Top Floating Viewport Control Bar           */}
      {/* ============================================================ */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 30,
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
      >
        {/* Pill 1: Vertex / Edge / Face Selection Mode */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: 3,
            gap: 2,
            height: 32,
          }}
        >
          <button
            onClick={() => onSetSelectionMode?.('vertex')}
            title="Vertex Select (Key: 1)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: selectionMode === 'vertex' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: selectionMode === 'vertex' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: selectionMode === 'vertex' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>•</span>
            <span>Vertex</span>
          </button>
          <button
            onClick={() => onSetSelectionMode?.('edge')}
            title="Edge Select (Key: 2)"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: selectionMode === 'edge' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: selectionMode === 'edge' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: selectionMode === 'edge' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <span>Edge</span>
          </button>
          <button
            onClick={() => onSetSelectionMode?.('face')}
            title="Face Select (Key: 3)"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: selectionMode === 'face' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: selectionMode === 'face' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: selectionMode === 'face' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <span>Face</span>
          </button>
        </div>

        {/* Pill 1b: Transform Mode (Move G / Rotate R / Scale S) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: 3,
            gap: 2,
            height: 32,
          }}
        >
          <button
            onClick={() => onSetGizmoMode?.('translate')}
            title="Move / Translate (Key: G)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: gizmoMode === 'translate' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: gizmoMode === 'translate' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: gizmoMode === 'translate' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <Move size={12} strokeWidth={2.2} />
            <span>Move</span>
          </button>
          <button
            onClick={() => onSetGizmoMode?.('rotate')}
            title="Rotate (Key: R)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: gizmoMode === 'rotate' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: gizmoMode === 'rotate' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: gizmoMode === 'rotate' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <RotateCw size={12} strokeWidth={2.2} />
            <span>Rotate</span>
          </button>
          <button
            onClick={() => onSetGizmoMode?.('scale')}
            title="Scale (Key: S)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: gizmoMode === 'scale' ? (isDark ? '#f4f4f5' : '#18181b') : 'transparent',
              color: gizmoMode === 'scale' ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#a1a1aa' : '#4b5563'),
              fontSize: 11,
              fontWeight: gizmoMode === 'scale' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            <Scaling size={12} strokeWidth={2.2} />
            <span>Scale</span>
          </button>
        </div>

        {/* Pill 2: Elevation Z Stepper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: '0 4px',
            height: 32,
            gap: 3,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? '#f4f4f5' : '#18181b',
              fontFamily: 'monospace',
              padding: '0 6px',
            }}
            title="Elevation Z (Q / E to change)"
          >
            Z: {activeElevation >= 0 ? `+${activeElevation}` : activeElevation}
          </span>
          <button
            onClick={() => handleStepElevation(1)}
            title="Raise Elevation (+1) [Key: E]"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
              backgroundColor: isDark ? '#18181b' : '#f9fafb',
              color: isDark ? '#f4f4f5' : '#18181b',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            onClick={() => handleStepElevation(-1)}
            title="Lower Elevation (-1) [Key: Q]"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
              backgroundColor: isDark ? '#18181b' : '#f9fafb',
              color: isDark ? '#f4f4f5' : '#18181b',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            -
          </button>
        </div>

        {/* Pill 3: Snapping Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: '0 4px',
            height: 32,
            gap: 3,
          }}
        >
          <button
            onClick={() => setMagnetSnapEnabled((p) => !p)}
            title={`Snap: ${magnetSnapEnabled ? 'ON' : 'OFF'} (Shift+Tab)`}
            style={{
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: 'transparent',
              color: magnetSnapEnabled ? (isDark ? '#f4f4f5' : '#18181b') : (isDark ? '#71717a' : '#9ca3af'),
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Snap: <span style={{ fontWeight: 700 }}>{magnetSnapEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <div style={{ width: 1, height: 14, backgroundColor: isDark ? '#3f3f46' : '#e5e7eb' }} />
          <button
            onClick={() => setSnapModes((p) => ({ ...p, vertex: !p.vertex }))}
            title="Snap to Vertex"
            style={{
              padding: '0 6px',
              height: 22,
              borderRadius: 4,
              border: 'none',
              backgroundColor: snapModes.vertex ? (isDark ? '#3f3f46' : '#f3f4f6') : 'transparent',
              color: snapModes.vertex ? (isDark ? '#f4f4f5' : '#18181b') : (isDark ? '#71717a' : '#9ca3af'),
              fontSize: 11,
              fontWeight: snapModes.vertex ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            V
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, midpoint: !p.midpoint }))}
            title="Snap to Midpoint"
            style={{
              padding: '0 6px',
              height: 22,
              borderRadius: 4,
              border: 'none',
              backgroundColor: snapModes.midpoint ? (isDark ? '#3f3f46' : '#f3f4f6') : 'transparent',
              color: snapModes.midpoint ? (isDark ? '#f4f4f5' : '#18181b') : (isDark ? '#71717a' : '#9ca3af'),
              fontSize: 11,
              fontWeight: snapModes.midpoint ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Mid
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, edge: !p.edge }))}
            title="Snap to Edge"
            style={{
              padding: '0 6px',
              height: 22,
              borderRadius: 4,
              border: 'none',
              backgroundColor: snapModes.edge ? (isDark ? '#3f3f46' : '#f3f4f6') : 'transparent',
              color: snapModes.edge ? (isDark ? '#f4f4f5' : '#18181b') : (isDark ? '#71717a' : '#9ca3af'),
              fontSize: 11,
              fontWeight: snapModes.edge ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Edge
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, face: !p.face }))}
            title="Snap to Face"
            style={{
              padding: '0 6px',
              height: 22,
              borderRadius: 4,
              border: 'none',
              backgroundColor: snapModes.face ? (isDark ? '#3f3f46' : '#f3f4f6') : 'transparent',
              color: snapModes.face ? (isDark ? '#f4f4f5' : '#18181b') : (isDark ? '#71717a' : '#9ca3af'),
              fontSize: 11,
              fontWeight: snapModes.face ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Face
          </button>
        </div>

        {/* Pill 4: Shading & Projection */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: 3,
            gap: 3,
            height: 32,
          }}
        >
          <button
            onClick={() => setSolidShading(!solidShading)}
            title={`Viewport Shading: ${solidShading ? 'Solid' : 'Wireframe'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: solidShading ? (isDark ? '#3f3f46' : '#f3f4f6') : 'transparent',
              color: isDark ? '#f4f4f5' : '#181a20',
              fontSize: 11,
              fontWeight: solidShading ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            <Box size={13} strokeWidth={2.2} />
            <span>Solid</span>
          </button>
          <button
            onClick={togglePerspective}
            title="Toggle Perspective / Orthographic (Numpad 5)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 8px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              backgroundColor: 'transparent',
              color: isDark ? '#f4f4f5' : '#181a20',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Box size={13} strokeWidth={1.7} />
            <span>{isPerspective ? 'Persp' : 'Ortho'}</span>
          </button>
        </div>

        {/* Pill 5: Maximize / Fullscreen Viewport */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            borderRadius: 6,
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: 3,
            height: 32,
          }}
        >
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                mountRef.current?.parentElement?.requestFullscreen?.();
              } else {
                document.exitFullscreen?.();
              }
            }}
            title="Toggle Fullscreen Viewport"
            style={{
              width: 26,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              backgroundColor: 'transparent',
              color: isDark ? '#f4f4f5' : '#181a20',
              cursor: 'pointer',
            }}
          >
            <Maximize2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Floating Action Badge: "Sketch on Face" */}
      {selectedFace && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 14,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: isDark ? '#27272a' : '#ffffff',
            border: isDark ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '6px 10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#f4f4f5' : '#181a20' }}>
              Face Selected ({selectedFace.plane.toUpperCase()} &bull; Elev: {selectedFace.elevation})
            </span>
            <span style={{ fontSize: 9, color: isDark ? '#a1a1aa' : '#6b7280' }}>
              Center: ({selectedFace.center.x}, {selectedFace.center.y}, {selectedFace.center.z})
            </span>
          </div>

          <button
            onClick={() => handleSketchOnFace(selectedFace)}
            title="Reposition drafting plane directly onto this face"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? '#18181b' : '#ffffff',
              backgroundColor: isDark ? '#f4f4f5' : '#18181b',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={12} />
            <span>Sketch on Face</span>
          </button>
        </div>
      )}

      {/* Live Transform HUD (CAD/Blender Grade Readout) */}
      {liveTransformHud.visible && (
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            border: isDark ? '1px solid #4f46e5' : '1px solid #6366f1',
            borderRadius: 6,
            padding: '6px 14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: 40,
            backdropFilter: 'blur(8px)',
            color: isDark ? '#f4f4f5' : '#18181b',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                textTransform: 'uppercase',
                color: '#6366f1',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '0.05em',
              }}
            >
              {liveTransformHud.mode}
            </span>
          </div>
          {liveTransformHud.mode === 'translate' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#ef4444' }}>ΔX: {liveTransformHud.dx > 0 ? `+${liveTransformHud.dx}` : liveTransformHud.dx}</span>
              <span style={{ color: '#10b981' }}>ΔY: {liveTransformHud.dy > 0 ? `+${liveTransformHud.dy}` : liveTransformHud.dy}</span>
              <span style={{ color: '#3b82f6' }}>ΔZ: {liveTransformHud.dz > 0 ? `+${liveTransformHud.dz}` : liveTransformHud.dz}</span>
            </div>
          )}
          {liveTransformHud.mode === 'rotate' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Angle:</span>
              <span style={{ color: '#6366f1' }}>{liveTransformHud.angle ?? 0}°</span>
            </div>
          )}
          {liveTransformHud.mode === 'scale' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Scale:</span>
              <span style={{ color: '#6366f1' }}>{Number((liveTransformHud.scale ?? 1).toFixed(2))}x</span>
            </div>
          )}
          <span style={{ fontSize: 10, color: isDark ? '#71717a' : '#9ca3af', fontWeight: 400 }}>
            [Esc / Right-Click: Cancel]
          </span>
        </div>
      )}

      {/* Floating 3D Cursor Coordinate Tooltip (Direct DOM) */}
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          display: 'none',
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          color: '#ffffff',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 500,
          pointerEvents: 'none',
          zIndex: 40,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}
      />

      {/* Blender-Style Alignment Mode Floating Bar */}
      {(activeTool === 'circle' || activeTool === 'arc' || activeTool === 'cylinder') && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 8,
            padding: '4px 8px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
            zIndex: 30,
            color: '#f8fafc',
          }}
        >
          {activeTool === 'arc' ? (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Arc Plane:
              </span>
              {[
                { dir: '+z' as const, key: 'Z', label: '+Z (Up)' },
                { dir: '-z' as const, key: 'Shift+Z', label: '-Z (Down)' },
                { dir: '+y' as const, key: 'Y', label: '+Y (North)' },
                { dir: '-y' as const, key: 'Shift+Y', label: '-Y (South)' },
                { dir: '+x' as const, key: 'X', label: '+X (East)' },
                { dir: '-x' as const, key: 'Shift+X', label: '-X (West)' },
              ].map((item) => {
                const isActive = activeBulgeDir === item.dir;
                return (
                  <button
                    key={item.dir}
                    onClick={() => {
                      setActiveBulgeDir(item.dir);
                      if (lastCreatedEntity && lastCreatedEntity.type === 'arc') {
                        handleOperatorUpdate({ bulgeDir: item.dir });
                      }
                    }}
                    title={`Bulge orientation ${item.label} (Hotkey: ${item.key})`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#ffffff' : '#cbd5e1',
                      backgroundColor: isActive ? '#4f46e5' : 'rgba(255, 255, 255, 0.08)',
                      border: isActive ? '1px solid #818cf8' : '1px solid transparent',
                      borderRadius: 5,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                      textTransform: 'uppercase',
                    }}
                  >
                    <kbd
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 4px',
                        borderRadius: 3,
                        backgroundColor: isActive ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)',
                        color: isActive ? '#e0e7ff' : '#94a3b8',
                      }}
                    >
                      {item.dir}
                    </kbd>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Align:
              </span>
              {[
                { mode: 'world-z' as const, key: 'Z', label: 'World Z (Top)' },
                { mode: 'world-y' as const, key: 'Y', label: 'World Y (Front)' },
                { mode: 'world-x' as const, key: 'X', label: 'World X (Side)' },
                { mode: 'view' as const, key: 'V', label: 'View (Camera)' },
                { mode: 'surface' as const, key: 'N', label: 'Surface Normal' },
              ].map((item) => {
                const isActive = alignmentMode === item.mode;
                return (
                  <button
                    key={item.mode}
                    onClick={() => switchAlignmentMode(item.mode)}
                    title={`Align to ${item.label} (Hotkey: ${item.key})`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#ffffff' : '#cbd5e1',
                      backgroundColor: isActive ? '#4f46e5' : 'rgba(255, 255, 255, 0.08)',
                      border: isActive ? '1px solid #818cf8' : '1px solid transparent',
                      borderRadius: 5,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <kbd
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 4px',
                        borderRadius: 3,
                        backgroundColor: isActive ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)',
                        color: isActive ? '#e0e7ff' : '#94a3b8',
                      }}
                    >
                      {item.key}
                    </kbd>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Blender-Style "Adjust Last Operation" Operator Panel (Bottom-Left) */}
      {lastCreatedEntity && (
        <div
          style={{
            position: 'absolute',
            bottom: 66,
            left: 14,
            zIndex: 35,
            minWidth: 260,
            maxWidth: 320,
            backgroundColor: 'rgba(24, 24, 27, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            color: '#f4f4f5',
            fontSize: 11,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            onClick={() => setIsOperatorOpen(!isOperatorOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              backgroundColor: 'rgba(39, 39, 42, 0.9)',
              borderBottom: isOperatorOpen ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
              cursor: 'pointer',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isOperatorOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span>
                {lastCreatedEntity.type === 'cylinder'
                  ? 'Add Cylinder'
                  : lastCreatedEntity.type === 'arc'
                  ? 'Add 2-Vertex Arc'
                  : 'Add Circle'}
              </span>
            </div>
            <span style={{ fontSize: 9, color: '#a1a1aa', fontWeight: 500 }}>F9 to toggle</span>
          </div>

          {/* Collapsible Body */}
          {isOperatorOpen && (
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lastCreatedEntity.type === 'arc' ? (
                /* Arc Bulge Plane Selector (+Z, -Z, +Y, -Y, +X, -X) */
                <div>
                  <label style={{ fontSize: 10, color: '#a1a1aa', display: 'block', marginBottom: 4 }}>
                    Arc Plane / Bulge:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {(['+z', '-z', '+y', '-y', '+x', '-x'] as const).map((dir) => {
                      const isSel = (lastCreatedEntity.bulgeDir || activeBulgeDir) === dir;
                      return (
                        <button
                          key={dir}
                          onClick={() => handleOperatorUpdate({ bulgeDir: dir })}
                          style={{
                            padding: '4px 6px',
                            fontSize: 10,
                            fontWeight: isSel ? 700 : 500,
                            backgroundColor: isSel ? '#4f46e5' : 'rgba(255, 255, 255, 0.08)',
                            color: isSel ? '#ffffff' : '#d4d4d8',
                            border: isSel ? '1px solid #818cf8' : '1px solid transparent',
                            borderRadius: 4,
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                          }}
                        >
                          {dir}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Alignment Selector for Circles and Cylinders */
                <div>
                  <label style={{ fontSize: 10, color: '#a1a1aa', display: 'block', marginBottom: 4 }}>
                    Align:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {(
                      [
                        { id: 'world-z', label: 'World Z' },
                        { id: 'world-y', label: 'World Y' },
                        { id: 'world-x', label: 'World X' },
                        { id: 'view', label: 'View' },
                        { id: 'surface', label: 'Surface' },
                      ] as const
                    ).map((m) => {
                      const isSel = lastCreatedEntity.alignmentMode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleOperatorUpdate({ alignmentMode: m.id })}
                          style={{
                            padding: '3px 4px',
                            fontSize: 10,
                            fontWeight: isSel ? 700 : 500,
                            backgroundColor: isSel ? '#4f46e5' : 'rgba(255, 255, 255, 0.08)',
                            color: isSel ? '#ffffff' : '#d4d4d8',
                            border: isSel ? '1px solid #818cf8' : '1px solid transparent',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Radius Control & Presets */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 10, color: '#a1a1aa' }}>Radius:</label>
                  {lastCreatedEntity.type === 'arc' && lastCreatedEntity.chordDistance && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        onClick={() => handleOperatorUpdate({ radius: Math.max(1, Math.round(lastCreatedEntity.chordDistance! / 2)) })}
                        title="Semicircle (180° / π radians): Radius = Chord / 2"
                        style={{
                          padding: '1px 5px',
                          fontSize: 9,
                          fontWeight: 600,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          color: '#c7d2fe',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        π (D/2)
                      </button>
                      <button
                        onClick={() => handleOperatorUpdate({ radius: Math.max(1, Math.round(lastCreatedEntity.chordDistance!)) })}
                        title="Radius = Chord Distance"
                        style={{
                          padding: '1px 5px',
                          fontSize: 9,
                          fontWeight: 600,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          color: '#c7d2fe',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        1× Dist
                      </button>
                      <button
                        onClick={() => handleOperatorUpdate({ radius: Math.max(1, Math.round(lastCreatedEntity.chordDistance! * 2)) })}
                        title="Radius = 2 * Chord Distance (Gentle curve)"
                        style={{
                          padding: '1px 5px',
                          fontSize: 9,
                          fontWeight: 600,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          color: '#c7d2fe',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        2× Dist
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <button
                    onClick={() => handleOperatorUpdate({ radius: Math.max(1, lastCreatedEntity.radius - 1) })}
                    style={{
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: 4,
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={lastCreatedEntity.radius}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) handleOperatorUpdate({ radius: v });
                    }}
                    style={{
                      width: 52,
                      textAlign: 'center',
                      backgroundColor: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 4,
                      color: '#ffffff',
                      fontSize: 11,
                      padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={() => handleOperatorUpdate({ radius: lastCreatedEntity.radius + 1 })}
                    style={{
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: 4,
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Arc Chord & Readout */}
              {lastCreatedEntity.type === 'arc' && lastCreatedEntity.chordDistance && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 4,
                    fontSize: 9,
                    color: '#94a3b8',
                  }}
                >
                  <span>Chord Dist: {lastCreatedEntity.chordDistance}</span>
                  <span>Min R (π): {Math.round(lastCreatedEntity.chordDistance / 2)}</span>
                </div>
              )}

              {/* Height Control (Cylinder only) */}
              {lastCreatedEntity.type === 'cylinder' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 10, color: '#a1a1aa' }}>Height:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => handleOperatorUpdate({ height: Math.max(1, (lastCreatedEntity.height ?? 5) - 1) })}
                      style={{
                        width: 22,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: 4,
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={lastCreatedEntity.height ?? 5}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) handleOperatorUpdate({ height: v });
                      }}
                      style={{
                        width: 48,
                        textAlign: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 4,
                        color: '#ffffff',
                        fontSize: 11,
                        padding: '2px 0',
                      }}
                    />
                    <button
                      onClick={() => handleOperatorUpdate({ height: (lastCreatedEntity.height ?? 5) + 1 })}
                      style={{
                        width: 22,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: 4,
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Normal Vector Readout & Invert */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 4,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{ fontSize: 9, color: '#a1a1aa' }}>
                  Normal: ({Number(lastCreatedEntity.normal.x.toFixed(2))},{' '}
                  {Number(lastCreatedEntity.normal.y.toFixed(2))},{' '}
                  {Number((lastCreatedEntity.normal.z ?? 0).toFixed(2))})
                </div>
                <button
                  onClick={() => handleOperatorUpdate({ invertNormal: true })}
                  title="Flip orientation normal 180°"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 6px',
                    fontSize: 9,
                    fontWeight: 600,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 3,
                    color: '#e4e4e7',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={10} />
                  <span>Flip</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
