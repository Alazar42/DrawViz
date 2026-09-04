import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DrawingLine,
  DrawingArc,
  Point3D,
  ScreenPoint,
  ToolType,
  GridSettings,
  SelectionMode,
  Face3D,
} from '../types/drawing';
import { IsoplaneType } from '../geometry/isometric';
import { CursorState } from '../state/drawingState';
import { cursorStore } from '../state/cursorStore';
import { extractFacesFromLines } from '../geometry/faces';
import {
  Eye,
  Camera,
  Layers,
  RotateCcw,
  Sparkles,
  MousePointer,
  Square,
  Minus,
  Dot,
  Magnet,
  Maximize2,
  Box,
} from 'lucide-react';

interface Three3DCanvasProps {
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  activeLayerId: string;
  selectedLineId: string | null;
  selectedArcId?: string | null;
  selectedVertex?: Point3D | null;
  selectedFace?: Face3D | null;
  selectionMode?: SelectionMode;
  activeTool: ToolType;
  gridSettings: GridSettings;
  activeAnchor: Point3D | null;
  activeElevation?: number;
  activeIsoplane?: IsoplaneType;
  onSelectLine: (id: string | null) => void;
  onSelectArc?: (id: string | null) => void;
  onSelectVertex?: (pt: Point3D | null) => void;
  onSelectFace?: (face: Face3D | null) => void;
  onSetSelectionMode?: (mode: SelectionMode) => void;
  onAddLine: (line: DrawingLine) => void;
  onAddArc?: (arc: DrawingArc) => void;
  onRemoveLine: (id: string) => void;
  onRemoveArc?: (id: string) => void;
  onSetAnchor: (anchor: Point3D | null) => void;
  onCursorUpdate?: (state: CursorState) => void;
  onSetElevation?: (elevation: number) => void;
  onSetIsoplane?: (isoplane: IsoplaneType) => void;
}

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
  activeLayerId,
  selectedLineId,
  selectedArcId = null,
  selectedVertex = null,
  selectedFace = null,
  selectionMode = 'edge',
  activeTool,
  gridSettings,
  activeAnchor,
  activeElevation = 0,
  activeIsoplane = 'top',
  onSelectLine,
  onSelectArc,
  onSelectVertex,
  onSelectFace,
  onSetSelectionMode,
  onAddLine,
  onAddArc,
  onRemoveLine,
  onRemoveArc,
  onSetAnchor,
  onCursorUpdate,
  onSetElevation,
  onSetIsoplane,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

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

  // Gizmo State
  const [gizmoRot, setGizmoRot] = useState<{ x: number; y: number; z: number }[]>([
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 1, z: 0 },
  ]);

  // Tooltip element reference (direct DOM for 0 React re-renders)
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Active Anchor & Snap Refs
  const activeAnchorRef = useRef<Point3D | null>(activeAnchor);
  activeAnchorRef.current = activeAnchor;

  const currentSnapRef = useRef<{
    logical: Point3D;
    screen: ScreenPoint;
    type: 'vertex' | 'midpoint' | 'edge' | 'face' | 'grid';
    lineId?: string | null;
    faceData?: Face3D | null;
  } | null>(null);

  // Render Throttle / On-Demand Loop
  const needsRenderRef = useRef<boolean>(false);
  const dampingCounterRef = useRef<number>(0);

  const requestRender = useCallback(() => {
    if (!needsRenderRef.current) {
      needsRenderRef.current = true;
      requestAnimationFrame(renderFrame);
    }
  }, []);

  const renderFrame = () => {
    needsRenderRef.current = false;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;

    if (!renderer || !scene || !camera) return;

    if (controls) {
      controls.update();
    }

    // Orient vertex snap ring towards camera
    if (vertexSnapRingRef.current && vertexSnapRingRef.current.visible) {
      vertexSnapRingRef.current.quaternion.copy(camera.quaternion);
    }

    renderer.render(scene, camera);

    // Update orientation gizmo rotation matrix
    updateGizmoOrientation();

    // If damping is active, keep rendering until settled
    if (dampingCounterRef.current > 0) {
      dampingCounterRef.current--;
      needsRenderRef.current = true;
      requestAnimationFrame(renderFrame);
    }
  };

  // Update Gizmo orientation based on active camera matrix
  const updateGizmoOrientation = () => {
    const camera = activeCameraRef.current;
    if (!camera) return;

    // View matrix rotation
    const m = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);
    const vX = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    const vY = new THREE.Vector3(0, 0, 1).applyMatrix4(m); // depth
    const vZ = new THREE.Vector3(0, 1, 0).applyMatrix4(m); // up (DrawViz Z)

    setGizmoRot([
      { x: vX.x, y: vX.y, z: vX.z },
      { x: vY.x, y: vY.y, z: vY.z },
      { x: vZ.x, y: vZ.y, z: vZ.z },
    ]);
  };

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
    scene.background = new THREE.Color('#f8fafc');
    sceneRef.current = scene;

    // Lighting for solid faces
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

    // Blender-style Glowing Amber Vertex Snap Ring
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

    // Blender-style Cyan Edge Snap Marker (Square)
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

    // Blender-style Cyan Midpoint Snap Marker (Octahedron/Diamond)
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

    // OrbitControls: Blender Standard Configuration!
    // MMB: Rotate / Orbit
    // Shift + MMB: Pan
    // Wheel: Zoom
    // Left click: Drawing and Selecting
    const controls = new OrbitControls(orthoCam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: -1 as any, // Reserve Left Click for drawing tools & selection!
      MIDDLE: THREE.MOUSE.ROTATE, // Blender MMB Orbit!
      RIGHT: -1 as any, // Reserve Right Click for tool cancel / drop anchor!
    };
    controlsRef.current = controls;

    // OrbitControls trigger demand-driven rendering
    controls.addEventListener('change', () => {
      dampingCounterRef.current = 20;
      requestRender();
    });

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
      renderer.dispose();
    };
  }, [requestRender]);

  // -------------------------------------------------------------
  // 2. Blender Shortcuts & Shift/Ctrl Modifier Listeners
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Shift key held -> switch MMB to PAN (Blender standard)
      if (e.key === 'Shift') {
        if (controlsRef.current) {
          controlsRef.current.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
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
        // Cancel active tool anchor or selection
        onSetAnchor(null);
        onSelectLine(null);
        onSelectArc?.(null);
        onSelectVertex?.(null);
        onSelectFace?.(null);
        requestRender();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        if (controlsRef.current) {
          controlsRef.current.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onSetAnchor, onSelectLine, onSelectArc, onSelectVertex, onSelectFace, requestRender]);

  // -------------------------------------------------------------
  // 3. Camera View Controls (Blender Presets & Smooth Centering)
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
    dampingCounterRef.current = 10;
    requestRender();
  }, [requestRender]);

  // Invert current view (180° orbit flip, Numpad 9)
  const invertView = useCallback(() => {
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.negate();
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
    dampingCounterRef.current = 10;
    requestRender();
  }, [requestRender]);

  // Toggle Orthographic / Perspective projection (Numpad 5)
  const togglePerspective = useCallback(() => {
    const orthoCam = orthoCameraRef.current;
    const perspCam = perspCameraRef.current;
    const controls = controlsRef.current;
    if (!orthoCam || !perspCam || !controls) return;

    const willBePersp = !isPerspective;
    setIsPerspective(willBePersp);

    if (willBePersp) {
      // Switch to Perspective
      perspCam.position.copy(orthoCam.position);
      perspCam.rotation.copy(orthoCam.rotation);
      perspCam.up.copy(orthoCam.up);
      activeCameraRef.current = perspCam;
      controls.object = perspCam;
    } else {
      // Switch to Orthographic
      orthoCam.position.copy(perspCam.position);
      orthoCam.rotation.copy(perspCam.rotation);
      orthoCam.up.copy(perspCam.up);
      activeCameraRef.current = orthoCam;
      controls.object = orthoCam;
    }

    controls.update();
    dampingCounterRef.current = 10;
    requestRender();
  }, [isPerspective, requestRender]);

  // Frame All / Focus Selection (Numpad . / Home / F)
  const frameAll = useCallback(() => {
    const camera = activeCameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (lines.length === 0 && arcs.length === 0) {
      controls.target.set(0, 0, 0);
      setCameraView('iso');
      return;
    }

    // Compute bounding box
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
    dampingCounterRef.current = 15;
    requestRender();
  }, [lines, arcs, setCameraView, requestRender]);

  // -------------------------------------------------------------
  // 4. Render 3D Grid Plane (Positioned at active elevation & plane)
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

    const grid = new THREE.GridHelper(size, divisions, 0x94a3b8, 0xe2e8f0);

    const planeGeo = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);

    const borderGeo = new THREE.EdgesGeometry(planeGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x818cf8, linewidth: 1.5 });
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
  }, [gridSettings.showGrid, activeIsoplane, activeElevation, requestRender]);

  // -------------------------------------------------------------
  // 5. Render Base 3D Geometry (Lines, Arcs, Solid Faces, Vertex Handles)
  // Completely isolated from hover events for maximum 60fps performance!
  // -------------------------------------------------------------
  useEffect(() => {
    const geoGroup = geometryGroupRef.current;
    const faceGroup = facesGroupRef.current;
    geoGroup.clear();
    faceGroup.clear();

    // 1. Draw 3D Base Lines
    const baseLineMat = new THREE.LineBasicMaterial({
      color: 0x111827,
      linewidth: 2,
      depthTest: true,
    });

    const isVertexMode = selectionMode === 'vertex';
    const sphereRadius = isVertexMode ? 0.22 : 0.14;
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: isVertexMode ? 0x6366f1 : 0x4b5563,
      depthTest: !isVertexMode,
    });

    lines.forEach((line) => {
      const v1 = logicalToThree(line.start);
      const v2 = logicalToThree(line.end);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
      const lineMesh = new THREE.Line(lineGeo, baseLineMat);
      geoGroup.add(lineMesh);

      // Vertex Endpoints
      const m1 = new THREE.Mesh(sphereGeo, sphereMat);
      m1.position.copy(v1);
      geoGroup.add(m1);

      const m2 = new THREE.Mesh(sphereGeo, sphereMat);
      m2.position.copy(v2);
      geoGroup.add(m2);
    });

    // 2. Draw 3D Arcs & Isocircles
    arcs.forEach((arc) => {
      const centerThree = logicalToThree(arc.center);
      const r = arc.radius;

      const curvePoints: THREE.Vector3[] = [];
      const segments = 48;
      const startRad = ((arc.startAngle ?? 0) * Math.PI) / 180;
      const endRad = ((arc.endAngle ?? 360) * Math.PI) / 180;

      for (let i = 0; i <= segments; i++) {
        const theta = startRad + (i / segments) * (endRad - startRad);
        if (arc.plane === 'top') {
          curvePoints.push(
            new THREE.Vector3(
              centerThree.x + r * Math.cos(theta),
              centerThree.y,
              centerThree.z + r * Math.sin(theta)
            )
          );
        } else if (arc.plane === 'front') {
          curvePoints.push(
            new THREE.Vector3(
              centerThree.x + r * Math.cos(theta),
              centerThree.y + r * Math.sin(theta),
              centerThree.z
            )
          );
        } else {
          curvePoints.push(
            new THREE.Vector3(
              centerThree.x,
              centerThree.y + r * Math.sin(theta),
              centerThree.z + r * Math.cos(theta)
            )
          );
        }
      }

      const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const curveMat = new THREE.LineBasicMaterial({ color: 0x111827, linewidth: 2 });
      geoGroup.add(new THREE.Line(curveGeo, curveMat));

      const centerGeo = new THREE.SphereGeometry(0.14, 8, 8);
      const centerMat = new THREE.MeshBasicMaterial({ color: 0x6366f1 });
      const cMesh = new THREE.Mesh(centerGeo, centerMat);
      cMesh.position.copy(centerThree);
      geoGroup.add(cMesh);
    });

    // 3. Extract & Render Coplanar Solid Faces using Memoized Face Extractor
    const extracted = extractFacesFromLines(lines);
    extractedFacesRef.current = extracted;

    const baseFaceMat = new THREE.MeshLambertMaterial({
      color: solidShading ? 0xffffff : 0xf8fafc,
      transparent: !solidShading,
      opacity: solidShading ? 1.0 : 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    extracted.forEach((faceObj) => {
      const v = faceObj.vertices.map(logicalToThree);
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

      const faceMesh = new THREE.Mesh(faceGeo, baseFaceMat);
      (faceMesh as any).userData = { faceData: faceObj };
      faceGroup.add(faceMesh);
    });

    requestRender();
  }, [lines, arcs, selectionMode, solidShading, requestRender]);

  // -------------------------------------------------------------
  // 6. Selection Highlights Layer (Selected Vertex, Edge, Face)
  // -------------------------------------------------------------
  useEffect(() => {
    const selGroup = selectionHighlightGroupRef.current;
    selGroup.clear();

    // 1. Highlight Selected Line
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

    // 2. Highlight Selected Arc
    if (selectedArcId) {
      const arc = arcs.find((a) => a.id === selectedArcId);
      if (arc) {
        const centerThree = logicalToThree(arc.center);
        const r = arc.radius;
        const pts: THREE.Vector3[] = [];
        const segs = 48;
        const startRad = ((arc.startAngle ?? 0) * Math.PI) / 180;
        const endRad = ((arc.endAngle ?? 360) * Math.PI) / 180;
        for (let i = 0; i <= segs; i++) {
          const theta = startRad + (i / segs) * (endRad - startRad);
          if (arc.plane === 'top') {
            pts.push(new THREE.Vector3(centerThree.x + r * Math.cos(theta), centerThree.y, centerThree.z + r * Math.sin(theta)));
          } else if (arc.plane === 'front') {
            pts.push(new THREE.Vector3(centerThree.x + r * Math.cos(theta), centerThree.y + r * Math.sin(theta), centerThree.z));
          } else {
            pts.push(new THREE.Vector3(centerThree.x, centerThree.y + r * Math.sin(theta), centerThree.z + r * Math.cos(theta)));
          }
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0x4f46e5, linewidth: 3.5, depthTest: false });
        selGroup.add(new THREE.Line(geo, mat));
      }
    }

    // 3. Highlight Selected Vertex
    if (selectedVertex) {
      const v = logicalToThree(selectedVertex);
      const selGeo = new THREE.SphereGeometry(0.28, 14, 14);
      const selMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false });
      const m = new THREE.Mesh(selGeo, selMat);
      m.position.copy(v);
      selGroup.add(m);
    }

    // 4. Highlight Selected Face
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
  }, [selectedLineId, selectedArcId, selectedVertex, selectedFace, lines, arcs, requestRender]);

  // -------------------------------------------------------------
  // 7. Blender-Style Snapping Engine (Vertex, Midpoint, Edge, Face, Grid)
  // Dynamic Ctrl Inversion & Magnet Switch
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

      // Blender dynamic inversion: holding Ctrl inverts magnet status
      const isSnappingActive = ctrlHeld ? !magnetSnapEnabled : magnetSnapEnabled;

      if (!isSnappingActive) {
        // Raw drafting plane intersection without magnetic snapping
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

        let planeNormal = new THREE.Vector3(0, 1, 0);
        let planeConstant = -activeElevation;
        if (activeIsoplane === 'front') {
          planeNormal = new THREE.Vector3(0, 0, 1);
        } else if (activeIsoplane === 'side') {
          planeNormal = new THREE.Vector3(1, 0, 0);
        }
        const draftingPlane = new THREE.Plane(planeNormal, planeConstant);
        const intersectPt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(draftingPlane, intersectPt)) {
          return {
            logical: threeToLogical(intersectPt),
            screen: mouseScreen,
            type: 'grid' as const,
          };
        }
        return null;
      }

      // 1. VERTEX MAGNETIC SNAP (Tolerance: 18 screen pixels)
      if (snapModes.vertex) {
        let closestVertex: Point3D | null = null;
        let minVertexDist = 18;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          for (const pt of [l.start, l.end]) {
            const v3 = logicalToThree(pt).project(camera);
            if (v3.z > 1) continue;
            const sx = ((v3.x + 1) * mount.clientWidth) / 2;
            const sy = ((-v3.y + 1) * mount.clientHeight) / 2;
            const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
            if (dist < minVertexDist) {
              minVertexDist = dist;
              closestVertex = pt;
            }
          }
        }

        arcs.forEach((a) => {
          const v3 = logicalToThree(a.center).project(camera);
          if (v3.z <= 1) {
            const sx = ((v3.x + 1) * mount.clientWidth) / 2;
            const sy = ((-v3.y + 1) * mount.clientHeight) / 2;
            const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);
            if (dist < minVertexDist) {
              minVertexDist = dist;
              closestVertex = a.center;
            }
          }
        });

        if (closestVertex) {
          const ptThree = logicalToThree(closestVertex).project(camera);
          const sx = ((ptThree.x + 1) * mount.clientWidth) / 2;
          const sy = ((-ptThree.y + 1) * mount.clientHeight) / 2;
          return {
            logical: { ...closestVertex },
            screen: { x: sx, y: sy },
            type: 'vertex' as const,
          };
        }
      }

      // 2. EDGE MIDPOINT SNAP (Tolerance: 14 screen pixels)
      if (snapModes.midpoint) {
        let closestMidpoint: Point3D | null = null;
        let closestLineId: string | null = null;
        let minMidDist = 14;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const midPt: Point3D = {
            x: Math.round((l.start.x + l.end.x) / 2),
            y: Math.round((l.start.y + l.end.y) / 2),
            z: Math.round(((l.start.z || 0) + (l.end.z || 0)) / 2),
          };

          const v3 = logicalToThree(midPt).project(camera);
          if (v3.z > 1) continue;
          const sx = ((v3.x + 1) * mount.clientWidth) / 2;
          const sy = ((-v3.y + 1) * mount.clientHeight) / 2;
          const dist = Math.hypot(mouseScreen.x - sx, mouseScreen.y - sy);

          if (dist < minMidDist) {
            minMidDist = dist;
            closestMidpoint = midPt;
            closestLineId = l.id;
          }
        }

        if (closestMidpoint) {
          const ptThree = logicalToThree(closestMidpoint).project(camera);
          const sx = ((ptThree.x + 1) * mount.clientWidth) / 2;
          const sy = ((-ptThree.y + 1) * mount.clientHeight) / 2;
          return {
            logical: closestMidpoint,
            screen: { x: sx, y: sy },
            type: 'midpoint' as const,
            lineId: closestLineId,
          };
        }
      }

      // 3. EDGE PROJECTION SNAP (Tolerance: 10 screen pixels)
      if (snapModes.edge) {
        let closestEdgePt: Point3D | null = null;
        let closestLineId: string | null = null;
        let minEdgeDist = 10;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const v1 = logicalToThree(line.start).project(camera);
          const v2 = logicalToThree(line.end).project(camera);
          if (v1.z > 1 || v2.z > 1) continue;

          const s1 = { x: ((v1.x + 1) * mount.clientWidth) / 2, y: ((-v1.y + 1) * mount.clientHeight) / 2 };
          const s2 = { x: ((v2.x + 1) * mount.clientWidth) / 2, y: ((-v2.y + 1) * mount.clientHeight) / 2 };

          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq > 0) {
            const t = Math.max(0, Math.min(1, ((mouseScreen.x - s1.x) * dx + (mouseScreen.y - s1.y) * dy) / lenSq));
            const px = s1.x + t * dx;
            const py = s1.y + t * dy;
            const dist = Math.hypot(mouseScreen.x - px, mouseScreen.y - py);
            if (dist < minEdgeDist) {
              minEdgeDist = dist;
              closestEdgePt = {
                x: Math.round((line.start.x + t * (line.end.x - line.start.x)) * 2) / 2,
                y: Math.round((line.start.y + t * (line.end.y - line.start.y)) * 2) / 2,
                z: Math.round(((line.start.z || 0) + t * ((line.end.z || 0) - (line.start.z || 0))) * 2) / 2,
              };
              closestLineId = line.id;
            }
          }
        }

        if (closestEdgePt) {
          return {
            logical: closestEdgePt,
            screen: mouseScreen,
            type: 'edge' as const,
            lineId: closestLineId,
          };
        }
      }

      // 4. FACE RAYCAST SNAP (in Face mode or when snapping to faces)
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      if (snapModes.face) {
        const faceGroup = facesGroupRef.current;
        if (faceGroup && faceGroup.children.length > 0) {
          const hits = raycaster.intersectObjects(faceGroup.children, false);
          if (hits.length > 0) {
            const hit = hits[0];
            const faceData = (hit.object as any).userData?.faceData as Face3D | undefined;
            return {
              logical: threeToLogical(hit.point),
              screen: mouseScreen,
              type: 'face' as const,
              faceData,
            };
          }
        }
      }

      // 5. DRAFTING PLANE INTERSECTION (Grid Snapping)
      let planeNormal = new THREE.Vector3(0, 1, 0);
      let planeConstant = -activeElevation;
      if (activeIsoplane === 'front') {
        planeNormal = new THREE.Vector3(0, 0, 1);
        planeConstant = -activeElevation;
      } else if (activeIsoplane === 'side') {
        planeNormal = new THREE.Vector3(1, 0, 0);
        planeConstant = -activeElevation;
      }

      const draftingPlane = new THREE.Plane(planeNormal, planeConstant);
      const intersectPt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(draftingPlane, intersectPt)) {
        let logical = threeToLogical(intersectPt);
        if (snapModes.grid && gridSettings.snapToGrid) {
          logical = {
            x: Math.round(logical.x),
            y: Math.round(logical.y),
            z: activeIsoplane === 'top' ? activeElevation : Math.round(logical.z),
          };
        }
        return {
          logical,
          screen: mouseScreen,
          type: 'grid' as const,
        };
      }

      return null;
    },
    [lines, arcs, magnetSnapEnabled, snapModes, activeIsoplane, activeElevation, gridSettings.snapToGrid]
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

      // Cursor point marker
      if (marker) {
        marker.position.copy(snapPos);
        marker.visible = activeTool === 'line' || activeTool === 'circle';
      }

      // Vertex snap indicator (Amber Ring)
      if (snapRing) {
        if (snap.type === 'vertex') {
          snapRing.position.copy(snapPos);
          snapRing.visible = true;
        } else {
          snapRing.visible = false;
        }
      }

      // Midpoint snap indicator (Cyan Octahedron)
      if (midMarker) {
        if (snap.type === 'midpoint') {
          midMarker.position.copy(snapPos);
          midMarker.visible = true;
        } else {
          midMarker.visible = false;
        }
      }

      // Edge snap indicator (Cyan Square)
      if (edgeMarker) {
        if (snap.type === 'edge') {
          edgeMarker.position.copy(snapPos);
          edgeMarker.visible = true;
        } else {
          edgeMarker.visible = false;
        }
      }

      // Interactive Line Preview
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

        const points: THREE.Vector3[] = [];
        const segs = 48;
        for (let i = 0; i <= segs; i++) {
          const theta = (i / segs) * Math.PI * 2;
          if (activeIsoplane === 'top') {
            points.push(
              new THREE.Vector3(
                centerThree.x + radius * Math.cos(theta),
                centerThree.y,
                centerThree.z + radius * Math.sin(theta)
              )
            );
          } else if (activeIsoplane === 'front') {
            points.push(
              new THREE.Vector3(
                centerThree.x + radius * Math.cos(theta),
                centerThree.y + radius * Math.sin(theta),
                centerThree.z
              )
            );
          } else {
            points.push(
              new THREE.Vector3(
                centerThree.x,
                centerThree.y + radius * Math.sin(theta),
                centerThree.z + radius * Math.cos(theta)
              )
            );
          }
        }

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
      }

      requestRender();
    },
    [activeTool, activeIsoplane, requestRender]
  );

  // -------------------------------------------------------------
  // 9. Pointer Event Handlers (Drawing, Selecting, Hovering)
  // -------------------------------------------------------------
  const handlePointerMove = (e: React.PointerEvent) => {
    const snap = getScreenSpaceSnap(e.clientX, e.clientY, e.ctrlKey);
    if (!snap) {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      return;
    }

    currentSnapRef.current = snap;
    updatePreviewAndMarkers(snap);

    // Update Hover Highlight Layer directly without tearing down scene!
    const hlGroup = hoverGroupRef.current;
    hlGroup.clear();

    if (snap.type === 'face' && snap.faceData && selectionMode === 'face') {
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
    } else if (snap.type === 'edge' && snap.lineId) {
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
    }

    // Direct DOM Tooltip update (0 React overhead)
    if (tooltipRef.current) {
      let tag = `X:${snap.logical.x} Y:${snap.logical.y} Z:${snap.logical.z || 0} • [${snap.type.toUpperCase()}]`;
      if (activeTool === 'circle' && activeAnchorRef.current) {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vCur = logicalToThree(snap.logical);
        const r = Math.max(1, Math.round(vStart.distanceTo(vCur)));
        tag = `Circle R:${r} • ${tag}`;
      }
      tooltipRef.current.style.display = 'block';
      tooltipRef.current.style.left = `${snap.screen.x + 14}px`;
      tooltipRef.current.style.top = `${snap.screen.y - 12}px`;
      tooltipRef.current.textContent = tag;
    }

    // Update global cursorStore (throttled, decoupled from root App)
    cursorStore.update({
      screen: snap.screen,
      logical: snap.logical,
      snapType: snap.type,
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Left click only for drawing & selecting
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
        onSetAnchor(snap.logical);
      } else {
        const vStart = logicalToThree(activeAnchorRef.current);
        const vCur = logicalToThree(snap.logical);
        const radius = Math.max(1, Math.round(vStart.distanceTo(vCur)));

        const newArc: DrawingArc = {
          id: `arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          center: { ...activeAnchorRef.current },
          radius,
          plane: activeIsoplane,
          layerId: activeLayerId,
          style: { stroke: '#111827', strokeWidth: 1.75, lineType: 'solid' },
        };
        onAddArc?.(newArc);
        onSetAnchor(null);
      }
    } else if (activeTool === 'select' || activeTool === 'eraser') {
      if (selectionMode === 'vertex' || snap.type === 'vertex') {
        if (snap.type === 'vertex') {
          onSelectVertex?.(snap.logical);
          onSelectLine(null);
          onSelectArc?.(null);
          onSelectFace?.(null);
        } else {
          onSelectVertex?.(null);
        }
      } else if (selectionMode === 'face' || snap.type === 'face') {
        if (snap.type === 'face' && snap.faceData) {
          onSelectFace?.(snap.faceData);
          onSelectLine(null);
          onSelectArc?.(null);
          onSelectVertex?.(null);
        } else {
          onSelectFace?.(null);
        }
      } else {
        // Edge mode
        let hitLineId = snap.lineId || null;
        let hitArcId: string | null = null;

        if (!hitLineId) {
          arcs.forEach((arc) => {
            const cThree = logicalToThree(arc.center);
            const clickThree = logicalToThree(snap.logical);
            const dist = Math.abs(clickThree.distanceTo(cThree) - arc.radius);
            if (dist < 1.2) hitArcId = arc.id;
          });
        }

        if (activeTool === 'select') {
          onSelectLine(hitLineId);
          onSelectArc?.(hitArcId);
          onSelectVertex?.(null);
          onSelectFace?.(null);
        } else if (activeTool === 'eraser') {
          if (hitLineId) onRemoveLine(hitLineId);
          if (hitArcId) onRemoveArc?.(hitArcId);
        }
      }
    }
  };

  const handlePointerLeave = () => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    if (cursorMarkerRef.current) cursorMarkerRef.current.visible = false;
    if (vertexSnapRingRef.current) vertexSnapRingRef.current.visible = false;
    if (edgeSnapMarkerRef.current) edgeSnapMarkerRef.current.visible = false;
    if (midpointSnapMarkerRef.current) midpointSnapMarkerRef.current.visible = false;
    hoverGroupRef.current.clear();
    requestRender();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Blender standard: Right-click cancels drawing / drops active line anchor
    if (activeAnchorRef.current) {
      onSetAnchor(null);
    } else {
      onSelectLine(null);
      onSelectArc?.(null);
      onSelectVertex?.(null);
      onSelectFace?.(null);
    }
    requestRender();
  };

  // "Sketch on Face" Handler
  const handleSketchOnFace = (face: Face3D) => {
    onSetIsoplane?.(face.plane);
    onSetElevation?.(face.elevation);
  };

  // -------------------------------------------------------------
  // 10. Interactive 3D Orientation Gizmo Interaction
  // -------------------------------------------------------------
  const handleGizmoAxisClick = (axis: 'x' | 'y' | 'z', sign: number) => {
    if (axis === 'x') {
      setCameraView(sign > 0 ? 'right' : 'left');
    } else if (axis === 'z') {
      setCameraView(sign > 0 ? 'top' : 'bottom');
    } else if (axis === 'y') {
      setCameraView(sign > 0 ? 'front' : 'back');
    }
  };

  // Text for Blender-style Viewport Badge in top-left
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
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />

      {/* Blender-Style Viewport Badge (Top-Left) */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          zIndex: 25,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            textShadow: '0 1px 2px rgba(255,255,255,0.8)',
          }}
        >
          {viewBadgeText}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          Elevation: Z = {activeElevation >= 0 ? `+${activeElevation}` : activeElevation} &bull; Plane: {activeIsoplane.toUpperCase()}
        </span>
      </div>

      {/* Blender-Style Top Controls Toolbar (Mode 1/2/3, Magnet Snap, Shading) */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '3px 6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
          zIndex: 30,
        }}
      >
        {/* 1. Selection Mode (1, 2, 3) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => onSetSelectionMode?.('vertex')}
            title="Vertex Select (Key: 1)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '4px 7px',
              fontSize: 11,
              fontWeight: selectionMode === 'vertex' ? 700 : 500,
              color: selectionMode === 'vertex' ? '#ffffff' : '#4b5563',
              backgroundColor: selectionMode === 'vertex' ? '#4f46e5' : 'transparent',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            <Dot size={15} strokeWidth={3} />
            <span>Vertex</span>
          </button>

          <button
            onClick={() => onSetSelectionMode?.('edge')}
            title="Edge Select (Key: 2)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '4px 7px',
              fontSize: 11,
              fontWeight: selectionMode === 'edge' ? 700 : 500,
              color: selectionMode === 'edge' ? '#ffffff' : '#4b5563',
              backgroundColor: selectionMode === 'edge' ? '#4f46e5' : 'transparent',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            <Minus size={13} strokeWidth={2.5} />
            <span>Edge</span>
          </button>

          <button
            onClick={() => onSetSelectionMode?.('face')}
            title="Face Select (Key: 3)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '4px 7px',
              fontSize: 11,
              fontWeight: selectionMode === 'face' ? 700 : 500,
              color: selectionMode === 'face' ? '#ffffff' : '#4b5563',
              backgroundColor: selectionMode === 'face' ? '#4f46e5' : 'transparent',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            <Square size={12} strokeWidth={2} />
            <span>Face</span>
          </button>
        </div>

        <div style={{ width: 1, height: 16, backgroundColor: '#e5e7eb' }} />

        {/* 2. Blender Magnet Snapping Switch */}
        <button
          onClick={() => setMagnetSnapEnabled((prev) => !prev)}
          title={`Magnet Snapping: ${magnetSnapEnabled ? 'ON' : 'OFF'} (Shift + Tab | Hold Ctrl to Invert)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: magnetSnapEnabled ? '#4f46e5' : '#6b7280',
            backgroundColor: magnetSnapEnabled ? '#eef2ff' : 'transparent',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
          }}
        >
          <Magnet size={13} strokeWidth={2.2} />
          <span>Snap {magnetSnapEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Snap Targets Toggle Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, vertex: !p.vertex }))}
            title="Snap to Vertex"
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              fontWeight: snapModes.vertex ? 700 : 400,
              color: snapModes.vertex ? '#b45309' : '#9ca3af',
              backgroundColor: snapModes.vertex ? '#fef3c7' : 'transparent',
            }}
          >
            V
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, midpoint: !p.midpoint }))}
            title="Snap to Edge Midpoint"
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              fontWeight: snapModes.midpoint ? 700 : 400,
              color: snapModes.midpoint ? '#0e7490' : '#9ca3af',
              backgroundColor: snapModes.midpoint ? '#cffafe' : 'transparent',
            }}
          >
            Mid
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, edge: !p.edge }))}
            title="Snap to Edge Line"
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              fontWeight: snapModes.edge ? 700 : 400,
              color: snapModes.edge ? '#0e7490' : '#9ca3af',
              backgroundColor: snapModes.edge ? '#cffafe' : 'transparent',
            }}
          >
            Edge
          </button>
          <button
            onClick={() => setSnapModes((p) => ({ ...p, face: !p.face }))}
            title="Snap to Face Surface"
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              fontWeight: snapModes.face ? 700 : 400,
              color: snapModes.face ? '#6d28d9' : '#9ca3af',
              backgroundColor: snapModes.face ? '#ede9fe' : 'transparent',
            }}
          >
            Face
          </button>
        </div>

        <div style={{ width: 1, height: 16, backgroundColor: '#e5e7eb' }} />

        {/* 3. Shading Mode */}
        <button
          onClick={() => setSolidShading(!solidShading)}
          title="Toggle Solid CAD Shading vs Wireframe"
          style={{
            padding: '4px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: solidShading ? '#4f46e5' : '#6b7280',
            backgroundColor: solidShading ? '#eef2ff' : 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Layers size={13} />
          <span>{solidShading ? 'Solid' : 'Wire'}</span>
        </button>

        {/* 4. Perspective / Ortho Toggle (Numpad 5) */}
        <button
          onClick={togglePerspective}
          title="Toggle Perspective / Orthographic Projection (Numpad 5)"
          style={{
            padding: '4px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: isPerspective ? '#4f46e5' : '#4b5563',
            backgroundColor: isPerspective ? '#eef2ff' : 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Box size={13} />
          <span>{isPerspective ? 'Persp' : 'Ortho'}</span>
        </button>

        {/* 5. Frame All (Numpad .) */}
        <button
          onClick={frameAll}
          title="Frame All Geometry (Numpad . | F | Home)"
          style={{
            padding: '4px 6px',
            fontSize: 11,
            color: '#6b7280',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* Floating Action Badge: "Sketch on Face" */}
      {selectedFace && (
        <div
          style={{
            position: 'absolute',
            top: 92,
            left: 14,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #c7d2fe',
            borderRadius: 8,
            padding: '6px 10px',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.12)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>
              Face Selected ({selectedFace.plane.toUpperCase()} &bull; Elev: {selectedFace.elevation})
            </span>
            <span style={{ fontSize: 9, color: '#6b7280' }}>
              Center: ({selectedFace.center.x}, {selectedFace.center.y}, {selectedFace.center.z})
            </span>
          </div>

          <button
            onClick={() => handleSketchOnFace(selectedFace)}
            title="Reposition the 3D drafting plane & elevation directly onto this face"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(79, 70, 229, 0.3)',
            }}
          >
            <Sparkles size={13} />
            Sketch on Face
          </button>
        </div>
      )}

      {/* Interactive Blender-Style 3D Navigation Gizmo (Top-Right) */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 96,
          height: 96,
          zIndex: 35,
        }}
      >
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          style={{ width: '100%', height: '100%', cursor: 'pointer' }}
        >
          {/* Gizmo background circle */}
          <circle cx="48" cy="48" r="42" fill="rgba(255, 255, 255, 0.72)" stroke="#e2e8f0" strokeWidth="1" />

          {/* Render 3D Projected Axes (X: Red, Y: Green, Z: Blue) */}
          {(() => {
            const center = 48;
            const r = 32;
            const axes = [
              { name: 'X', color: '#ef4444', dir: gizmoRot[0], axis: 'x' as const },
              { name: 'Y', color: '#22c55e', dir: gizmoRot[1], axis: 'y' as const },
              { name: 'Z', color: '#3b82f6', dir: gizmoRot[2], axis: 'z' as const },
            ];

            // Sort by depth (z)
            const sorted = [...axes].sort((a, b) => a.dir.z - b.dir.z);

            return sorted.map((ax) => {
              const px = center + ax.dir.x * r;
              const py = center - ax.dir.y * r;
              const isFront = ax.dir.z > -0.05;

              return (
                <g key={ax.name}>
                  {/* Axis Line */}
                  <line
                    x1={center}
                    y1={center}
                    x2={px}
                    y2={py}
                    stroke={ax.color}
                    strokeWidth={isFront ? 2.5 : 1.5}
                    strokeOpacity={isFront ? 0.95 : 0.35}
                  />

                  {/* Negative Dot */}
                  <circle
                    cx={center - ax.dir.x * r * 0.75}
                    cy={center + ax.dir.y * r * 0.75}
                    r={3}
                    fill={ax.color}
                    fillOpacity={0.4}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGizmoAxisClick(ax.axis, -1);
                    }}
                  />

                  {/* Positive Axis Pill */}
                  <circle
                    cx={px}
                    cy={py}
                    r={9}
                    fill={ax.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    style={{ cursor: 'pointer', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGizmoAxisClick(ax.axis, 1);
                    }}
                  />
                  <text
                    x={px}
                    y={py + 3.5}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="800"
                    fill="#ffffff"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {ax.name}
                  </text>
                </g>
              );
            });
          })()}
        </svg>
      </div>

      {/* Floating 3D Cursor Coordinate Tooltip (Direct DOM Updated) */}
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

      {/* Blender Navigation Guide Watermark (Bottom-Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 14,
          zIndex: 10,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          color: '#94a3b8',
          fontSize: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(4px)',
          padding: '4px 8px',
          borderRadius: 4,
          border: '1px solid #e5e7eb',
        }}
      >
        <span>&bull; MMB Drag: <strong>Orbit View</strong> &bull; Shift + MMB: <strong>Pan</strong></span>
        <span>&bull; Wheel: <strong>Zoom</strong> &bull; Right-Click / Esc: <strong>Cancel</strong></span>
        <span>&bull; Numpad 1/3/7: <strong>Views</strong> &bull; Numpad 5: <strong>Ortho/Persp</strong> &bull; F: <strong>Frame</strong></span>
        <span>&bull; Shift+Tab: <strong>Magnet Snap</strong> &bull; Hold Ctrl: <strong>Invert Snap</strong></span>
      </div>
    </div>
  );
});
