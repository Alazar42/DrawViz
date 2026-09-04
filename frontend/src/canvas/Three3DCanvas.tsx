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
import { CursorState } from '../state/drawingState';
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
    type: 'vertex' | 'line' | 'arc' | 'cylinder' | 'sphere' | 'face' | 'group',
    idOrData: any,
    delta: Point3D
  ) => void;
  onCommitTransform?: () => void;
  groupMode?: boolean;
  groups?: EntityGroup[];
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
  onCommitTransform,
  groupMode = true,
  groups = [],
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

  // 3D Transform Gizmo Pivot Mesh & Controls
  const pivotMeshRef = useRef<THREE.Mesh>(
    new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }))
  );
  const transformControlsRef = useRef<TransformControls | null>(null);

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

  const onTranslateEntityRef = useRef(onTranslateEntity);
  onTranslateEntityRef.current = onTranslateEntity;
  const onCommitTransformRef = useRef(onCommitTransform);
  onCommitTransformRef.current = onCommitTransform;

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

    // 3D Transform Gizmo (Blender style X, Y, Z translation)
    scene.add(pivotMeshRef.current);
    const transformControls = new TransformControls(orthoCam, renderer.domElement);
    transformControls.setMode('translate');
    transformControls.setSpace('world');
    transformControls.size = 0.85;
    transformControls.translationSnap = 1;

    transformControls.addEventListener('dragging-changed', (event: any) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !event.value;
      }
      if (!event.value) {
        onCommitTransformRef.current?.();
      }
    });

    const dragStartPos = new THREE.Vector3();
    transformControls.addEventListener('mouseDown', () => {
      dragStartPos.copy(pivotMeshRef.current.position);
    });

    transformControls.addEventListener('objectChange', () => {
      const curPos = pivotMeshRef.current.position;
      const dx = Math.round(curPos.x - dragStartPos.x);
      const dz = Math.round(curPos.y - dragStartPos.y); // Height
      const dy = Math.round(curPos.z - dragStartPos.z); // Depth

      if (dx !== 0 || dy !== 0 || dz !== 0) {
        const delta: Point3D = { x: dx, y: dy, z: dz };
        const selV = selectedVertexRef.current;
        const selL = selectedLineIdRef.current;
        const selA = selectedArcIdRef.current;
        const selC = selectedCylinderIdRef.current;
        const selS = selectedSphereIdRef.current;
        const selF = selectedFaceRef.current;

        if (selV) {
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

        dragStartPos.set(
          dragStartPos.x + dx,
          dragStartPos.y + dz,
          dragStartPos.z + dy
        );
        requestRender();
      }
    });

    const gizmoRoot = (transformControls as any).getHelper ? (transformControls as any).getHelper() : transformControls;
    scene.add(gizmoRoot);
    transformControlsRef.current = transformControls;

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

  // -------------------------------------------------------------
  // 2. Keyboard Modifiers (Shift Pan, Shift+Tab Magnet, Numpad Views)
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
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
  }, [isPerspective, requestRender]);

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
  // 5. Render Base 3D Geometry (Lines, Arcs, Solid Faces, Vertex Handles)
  // Isolated from hover/drag!
  // -------------------------------------------------------------
  useEffect(() => {
    const geoGroup = geometryGroupRef.current;
    const faceGroup = facesGroupRef.current;
    geoGroup.clear();
    faceGroup.clear();

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

    lines.forEach((line) => {
      const v1 = logicalToThree(line.start);
      const v2 = logicalToThree(line.end);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
      const lineMesh = new THREE.Line(lineGeo, baseLineMat);
      geoGroup.add(lineMesh);

      const m1 = new THREE.Mesh(sphereGeo, sphereMat);
      m1.position.copy(v1);
      geoGroup.add(m1);

      const m2 = new THREE.Mesh(sphereGeo, sphereMat);
      m2.position.copy(v2);
      geoGroup.add(m2);
    });

    arcs.forEach((arc) => {
      const curvePoints = getArc3DPoints(arc, 48);
      const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const curveMat = new THREE.LineBasicMaterial({ color: isDark ? 0xf1f5f9 : 0x111827, linewidth: 2 });
      geoGroup.add(new THREE.Line(curveGeo, curveMat));

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
        const centerThree = logicalToThree(arc.center);
        const centerGeo = new THREE.SphereGeometry(0.14, 8, 8);
        const centerMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x818cf8 : 0x6366f1 });
        const cMesh = new THREE.Mesh(centerGeo, centerMat);
        cMesh.position.copy(centerThree);
        geoGroup.add(cMesh);
      }
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

    cylinders.forEach((cyl) => {
      const centerThree = logicalToThree(cyl.center);
      const normalThree = cyl.normal ? logicalToThreeNormal(cyl.normal) : new THREE.Vector3(0, 1, 0);
      const { basePoints, topPoints, silhouetteLines, midPoint, quaternion } = getCylinderGeometryData(
        centerThree,
        cyl.radius,
        cyl.height,
        normalThree
      );

      // Base circle
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(basePoints), baseLineMat));
      // Top circle
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPoints), baseLineMat));
      // 4 Silhouette lines
      silhouetteLines.forEach(([p1, p2]) => {
        geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), baseLineMat));
      });

      // Solid cylinder shading
      if (solidShading) {
        const cylGeo = new THREE.CylinderGeometry(cyl.radius, cyl.radius, Math.abs(cyl.height), 32, 1, false);
        const cylMesh = new THREE.Mesh(cylGeo, baseFaceMat);
        cylMesh.position.copy(midPoint);
        cylMesh.quaternion.copy(quaternion);
        (cylMesh as any).userData = { cylinderData: cyl };
        faceGroup.add(cylMesh);
      }
    });

    // 3D Solid Spheres with shaded faces & technical contour rings
    spheres.forEach((sph) => {
      const centerThree = logicalToThree(sph.center);

      // Solid shaded sphere surface
      if (solidShading) {
        const sphGeo = new THREE.SphereGeometry(sph.radius, 28, 20);
        const sphMesh = new THREE.Mesh(sphGeo, baseFaceMat);
        sphMesh.position.copy(centerThree);
        (sphMesh as any).userData = { sphereData: sph };
        faceGroup.add(sphMesh);
      }

      // 3 Technical Drawing Orthogonal Wireframe Rings
      const ringSegs = 48;
      // Ring 1: Equator (XZ plane in Three.js -> XY in logical)
      const r1Pts: THREE.Vector3[] = [];
      for (let i = 0; i <= ringSegs; i++) {
        const theta = (i / ringSegs) * Math.PI * 2;
        r1Pts.push(
          new THREE.Vector3(
            centerThree.x + sph.radius * Math.cos(theta),
            centerThree.y,
            centerThree.z + sph.radius * Math.sin(theta)
          )
        );
      }
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r1Pts), baseLineMat));

      // Ring 2: Vertical Ring (XY plane in Three.js -> XZ in logical)
      const r2Pts: THREE.Vector3[] = [];
      for (let i = 0; i <= ringSegs; i++) {
        const theta = (i / ringSegs) * Math.PI * 2;
        r2Pts.push(
          new THREE.Vector3(
            centerThree.x + sph.radius * Math.cos(theta),
            centerThree.y + sph.radius * Math.sin(theta),
            centerThree.z
          )
        );
      }
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r2Pts), baseLineMat));

      // Ring 3: Vertical Ring (YZ plane in Three.js -> YZ in logical)
      const r3Pts: THREE.Vector3[] = [];
      for (let i = 0; i <= ringSegs; i++) {
        const theta = (i / ringSegs) * Math.PI * 2;
        r3Pts.push(
          new THREE.Vector3(
            centerThree.x,
            centerThree.y + sph.radius * Math.sin(theta),
            centerThree.z + sph.radius * Math.cos(theta)
          )
        );
      }
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r3Pts), baseLineMat));
    });

    const extracted = extractFacesFromLines(lines, arcs);
    extractedFacesRef.current = extracted;

    extracted.forEach((faceObj) => {
      const v = faceObj.vertices.map(logicalToThree);
      if (v.length < 3) return;

      const faceGeo = new THREE.BufferGeometry();
      if (v.length === 3) {
        const vertices = new Float32Array([
          v[0].x, v[0].y, v[0].z,
          v[1].x, v[1].y, v[1].z,
          v[2].x, v[2].y, v[2].z,
        ]);
        faceGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      } else {
        // Robust 2D projection and triangulation for arbitrary N-gons
        const normThree = faceObj.normal ? logicalToThreeNormal(faceObj.normal) : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3();
        if (Math.abs(normThree.y) < 0.9) {
          u.crossVectors(normThree, new THREE.Vector3(0, 1, 0)).normalize();
        } else {
          u.crossVectors(normThree, new THREE.Vector3(1, 0, 0)).normalize();
        }
        const w = new THREE.Vector3().crossVectors(normThree, u).normalize();

        const pts2D: THREE.Vector2[] = v.map((pt) => new THREE.Vector2(pt.dot(u), pt.dot(w)));
        const triangles = THREE.ShapeUtils.triangulateShape(pts2D, []);

        const posArray: number[] = [];
        for (const tri of triangles) {
          for (const idx of tri) {
            const pt = v[idx];
            if (pt) {
              posArray.push(pt.x, pt.y, pt.z);
            }
          }
        }
        if (posArray.length > 0) {
          faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
        }
      }
      faceGeo.computeVertexNormals();

      const faceMesh = new THREE.Mesh(faceGeo, baseFaceMat);
      (faceMesh as any).userData = { faceData: faceObj };
      faceGroup.add(faceMesh);
    });

    requestRender();
  }, [lines, arcs, cylinders, spheres, selectionMode, solidShading, theme, requestRender]);

  // Update scene background on theme change
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      scene.background = new THREE.Color(theme === 'dark' ? '#18181b' : '#ffffff');
      requestRender();
    }
  }, [theme, requestRender]);

  // -------------------------------------------------------------
  // 6. Selection Highlights Layer
  // -------------------------------------------------------------
  useEffect(() => {
    const selGroup = selectionHighlightGroupRef.current;
    selGroup.clear();

    if (selectedLineId) {
      const line = lines.find((l) => l.id === selectedLineId);
      if (line) {
        const v1 = logicalToThree(line.start);
        const v2 = logicalToThree(line.end);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);

        const lineMat = new THREE.LineBasicMaterial({
          color: 0x4f46e5,
          linewidth: 3.5,
          depthTest: false,
        });
        selGroup.add(new THREE.Line(lineGeo, lineMat));

        const haloMat = new THREE.LineBasicMaterial({
          color: 0x818cf8,
          transparent: true,
          opacity: 0.65,
          linewidth: 7,
          depthTest: false,
        });
        selGroup.add(new THREE.Line(lineGeo, haloMat));
      }
    }

    if (selectedArcId) {
      const arc = arcs.find((a) => a.id === selectedArcId);
      if (arc) {
        const pts = getArc3DPoints(arc, 48);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0x4f46e5, linewidth: 3.5, depthTest: false });
        selGroup.add(new THREE.Line(geo, mat));

        const haloMat = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.65, linewidth: 7, depthTest: false });
        selGroup.add(new THREE.Line(geo, haloMat));
      }
    }

    if (selectedCylinderId) {
      const cyl = cylinders.find((c) => c.id === selectedCylinderId);
      if (cyl) {
        const centerThree = logicalToThree(cyl.center);
        const normalThree = cyl.normal ? logicalToThreeNormal(cyl.normal) : new THREE.Vector3(0, 1, 0);
        const { basePoints, topPoints, silhouetteLines } = getCylinderGeometryData(
          centerThree,
          cyl.radius,
          cyl.height,
          normalThree
        );
        const mat = new THREE.LineBasicMaterial({ color: 0x4f46e5, linewidth: 3.5, depthTest: false });
        selGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(basePoints), mat));
        selGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPoints), mat));
        silhouetteLines.forEach(([p1, p2]) => {
          selGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat));
        });
      }
    }

    if (selectedSphereId) {
      const sph = spheres.find((s) => s.id === selectedSphereId);
      if (sph) {
        const centerThree = logicalToThree(sph.center);
        const haloGeo = new THREE.SphereGeometry(sph.radius * 1.02, 24, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x4f46e5,
          wireframe: true,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(centerThree);
        selGroup.add(halo);
      }
    }

    if (selectedVertex) {
      const v = logicalToThree(selectedVertex);
      const selGeo = new THREE.SphereGeometry(0.28, 14, 14);
      const selMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false });
      const m = new THREE.Mesh(selGeo, selMat);
      m.position.copy(v);
      selGroup.add(m);
    }

    if (selectedFace) {
      const v = selectedFace.vertices.map(logicalToThree);
      const faceGeo = new THREE.BufferGeometry();
      if (v.length === 3) {
        const vertices = new Float32Array([
          v[0].x, v[0].y, v[0].z,
          v[1].x, v[1].y, v[1].z,
          v[2].x, v[2].y, v[2].z,
        ]);
        faceGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      } else if (v.length >= 4) {
        const vertices = new Float32Array([
          v[0].x, v[0].y, v[0].z,
          v[1].x, v[1].y, v[1].z,
          v[2].x, v[2].y, v[2].z,

          v[0].x, v[0].y, v[0].z,
          v[2].x, v[2].y, v[2].z,
          v[3].x, v[3].y, v[3].z,
        ]);
        faceGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      }
      faceGeo.computeVertexNormals();

      const faceMat = new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      selGroup.add(new THREE.Mesh(faceGeo, faceMat));
    }

    requestRender();
  }, [selectedLineId, selectedArcId, selectedCylinderId, selectedSphereId, selectedVertex, selectedFace, lines, arcs, cylinders, spheres, requestRender]);

  // -------------------------------------------------------------
  // 7. Update TransformControls Pivot & Attachment (Blender Gizmo)
  // -------------------------------------------------------------
  useEffect(() => {
    const tc = transformControlsRef.current;
    const pivot = pivotMeshRef.current;
    if (!tc || !pivot) return;

    if (activeAnchor) {
      tc.detach();
      return;
    }

    if (selectedVertex) {
      pivot.position.copy(logicalToThree(selectedVertex));
      tc.attach(pivot);
    } else if (selectedLineId) {
      const line = lines.find((l) => l.id === selectedLineId);
      if (line) {
        const midLogical: Point3D = {
          x: Math.round((line.start.x + line.end.x) / 2),
          y: Math.round((line.start.y + line.end.y) / 2),
          z: Math.round(((line.start.z || 0) + (line.end.z || 0)) / 2),
        };
        pivot.position.copy(logicalToThree(midLogical));
        tc.attach(pivot);
      } else {
        tc.detach();
      }
    } else if (selectedArcId) {
      const arc = arcs.find((a) => a.id === selectedArcId);
      if (arc) {
        pivot.position.copy(logicalToThree(arc.center));
        tc.attach(pivot);
      } else {
        tc.detach();
      }
    } else if (selectedCylinderId) {
      const cyl = cylinders.find((c) => c.id === selectedCylinderId);
      if (cyl) {
        pivot.position.copy(logicalToThree(cyl.center));
        tc.attach(pivot);
      } else {
        tc.detach();
      }
    } else if (selectedSphereId) {
      const sph = spheres.find((s) => s.id === selectedSphereId);
      if (sph) {
        pivot.position.copy(logicalToThree(sph.center));
        tc.attach(pivot);
      } else {
        tc.detach();
      }
    } else if (selectedFace) {
      pivot.position.copy(logicalToThree(selectedFace.center));
      tc.attach(pivot);
    } else {
      tc.detach();
    }
    requestRender();
  }, [
    selectedVertex,
    selectedLineId,
    selectedArcId,
    selectedCylinderId,
    selectedSphereId,
    selectedFace,
    activeAnchor,
    lines,
    arcs,
    cylinders,
    spheres,
    requestRender,
  ]);

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
      if (selectionMode === 'vertex') {
        if (snap.type === 'vertex') {
          onSelectVertex?.(snap.logical);
          onSelectLine(null);
          onSelectArc?.(null);
          onSelectCylinder?.(null);
          onSelectSphere?.(null);
          onSelectFace?.(null);
        } else {
          onSelectVertex?.(null);
        }
      } else if (selectionMode === 'face') {
        if (snap.type === 'face') {
          if (snap.sphereData) {
            if (activeTool === 'select') {
              onSelectSphere?.(snap.sphereData.id);
              onSelectFace?.(null);
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectVertex?.(null);
            } else if (activeTool === 'eraser') {
              onRemoveSphere?.(snap.sphereData.id);
            }
          } else if (snap.faceData) {
            if (activeTool === 'select') {
              onSelectFace?.(snap.faceData);
              onSelectSphere?.(null);
              onSelectLine(null);
              onSelectArc?.(null);
              onSelectCylinder?.(null);
              onSelectVertex?.(null);
            }
          } else {
            onSelectFace?.(null);
            onSelectSphere?.(null);
          }
        } else {
          onSelectFace?.(null);
          onSelectSphere?.(null);
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

        if (activeTool === 'select') {
          onSelectLine(hitLineId);
          onSelectArc?.(hitArcId);
          onSelectCylinder?.(hitCylinderId);
          onSelectSphere?.(hitSphereId);
          onSelectVertex?.(null);
          onSelectFace?.(null);
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
