import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import { DrawingLine, DrawingArc, DrawingCylinder, Point3D } from '../types/drawing';
import { extractFacesFromLines } from '../geometry/faces';
import { getArcPoints, getCylinderGeometryData, logicalToThreeNormal } from '../geometry/circle3d';

export type OrthoCameraViewType = 'top' | 'front' | 'side';

interface ThreeOrthoViewportProps {
  title: string;
  viewType: OrthoCameraViewType;
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  cylinders?: DrawingCylinder[];
  selectedLineId?: string | null;
  onSelectLine?: (lineId: string | null) => void;
  hideOccluded?: boolean;
}

// Convert DrawViz logical (X, Y: depth, Z: height) to Three.js world space:
// X_three = X_logical, Y_three = Z_logical (Height), Z_three = Y_logical (Depth)
function logicalToThree(pt: Point3D): THREE.Vector3 {
  return new THREE.Vector3(pt.x, pt.z || 0, pt.y);
}

export const ThreeOrthoViewport: React.FC<ThreeOrthoViewportProps> = memo(({
  title,
  viewType,
  lines,
  arcs = [],
  cylinders = [],
  selectedLineId,
  onSelectLine,
  hideOccluded = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const geoGroupRef = useRef<THREE.Group>(new THREE.Group());
  const facesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const gridGroupRef = useRef<THREE.Group>(new THREE.Group());
  const highlightGroupRef = useRef<THREE.Group>(new THREE.Group());

  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);

  // Demand-driven rendering: renders only when dirty
  const isDirtyRef = useRef<boolean>(false);
  const requestRender = useCallback(() => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      requestAnimationFrame(() => {
        isDirtyRef.current = false;
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      });
    }
  }, []);

  // 1. Initialize Three.js Scene and Orthographic Camera
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 240;
    const height = mount.clientHeight || 180;
    const aspect = width / height;
    const frustumSize = 18;

    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -100,
      200
    );

    const dist = 50;
    if (viewType === 'top') {
      camera.position.set(0, dist, 0);
      camera.up.set(0, 0, -1);
    } else if (viewType === 'front') {
      camera.position.set(0, 0, dist);
      camera.up.set(0, 1, 0);
    } else {
      camera.position.set(dist, 0, 0);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    sceneRef.current = scene;

    scene.add(gridGroupRef.current);
    scene.add(facesGroupRef.current);
    scene.add(geoGroupRef.current);
    scene.add(highlightGroupRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    rendererRef.current = renderer;

    mount.replaceChildren(renderer.domElement);
    requestRender();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 240;
      const h = mount.clientHeight || 180;
      const asp = w / h;
      camera.left = (-frustumSize * asp * (1 / zoom)) / 2;
      camera.right = (frustumSize * asp * (1 / zoom)) / 2;
      camera.top = (frustumSize * (1 / zoom)) / 2;
      camera.bottom = (-frustumSize * (1 / zoom)) / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [viewType, requestRender]);

  // Update camera projection on zoom
  useEffect(() => {
    const camera = cameraRef.current;
    const mount = mountRef.current;
    if (!camera || !mount) return;

    const width = mount.clientWidth || 240;
    const height = mount.clientHeight || 180;
    const aspect = width / height;
    const frustumSize = 18;

    camera.left = (-frustumSize * aspect) / (2 * zoom);
    camera.right = (frustumSize * aspect) / (2 * zoom);
    camera.top = frustumSize / (2 * zoom);
    camera.bottom = -frustumSize / (2 * zoom);
    camera.updateProjectionMatrix();
    requestRender();
  }, [zoom, requestRender]);

  // 2. Render 2D Reference Grid in camera plane
  useEffect(() => {
    const gridGroup = gridGroupRef.current;
    gridGroup.clear();

    const grid = new THREE.GridHelper(24, 24, 0xe2e8f0, 0xf1f5f9);
    if (viewType === 'top') {
      grid.position.set(0, -0.05, 0);
    } else if (viewType === 'front') {
      grid.rotation.x = Math.PI / 2;
      grid.position.set(0, 0, -0.05);
    } else {
      grid.rotation.z = Math.PI / 2;
      grid.position.set(-0.05, 0, 0);
    }
    gridGroup.add(grid);
    requestRender();
  }, [viewType, requestRender]);

  // 3. Render 3D Model Geometry (Base Lines, Arcs, and Occluding Solid Faces)
  // Rebuilt ONLY when geometry changes, NOT on hover!
  useEffect(() => {
    const geoGroup = geoGroupRef.current;
    const facesGroup = facesGroupRef.current;
    geoGroup.clear();
    facesGroup.clear();

    // 1. Occluding Solid Planar Faces using memoized face extractor
    if (hideOccluded && lines.length >= 3) {
      const faces = extractFacesFromLines(lines);
      const faceMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      faces.forEach((f) => {
        const v = f.vertices.map(logicalToThree);
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
        facesGroup.add(new THREE.Mesh(faceGeo, faceMat));
      });
    }

    // 2. Static Line Base Meshes
    const defaultLineMat = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      linewidth: 1.5,
      depthTest: true,
    });

    const sphereGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x64748b });

    lines.forEach((line) => {
      const v1 = logicalToThree(line.start);
      const v2 = logicalToThree(line.end);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
      const lineMesh = new THREE.Line(lineGeo, defaultLineMat);
      geoGroup.add(lineMesh);

      // Endpoints
      const s1 = new THREE.Mesh(sphereGeo, sphereMat);
      s1.position.copy(v1);
      const s2 = new THREE.Mesh(sphereGeo, sphereMat);
      s2.position.copy(v2);
      geoGroup.add(s1);
      geoGroup.add(s2);
    });

    // 3. Arcs
    arcs.forEach((arc) => {
      const cThree = logicalToThree(arc.center);
      let normalThree: THREE.Vector3;
      if (arc.normal) {
        normalThree = logicalToThreeNormal(arc.normal);
      } else if (arc.plane === 'top') {
        normalThree = new THREE.Vector3(0, 1, 0);
      } else if (arc.plane === 'front') {
        normalThree = new THREE.Vector3(0, 0, 1);
      } else {
        normalThree = new THREE.Vector3(1, 0, 0);
      }
      const sDeg = arc.startAngle ?? 0;
      const eDeg = arc.endAngle ?? 360;
      const pts = getArcPoints(cThree, arc.radius, normalThree, sDeg, eDeg, 36);

      const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const arcMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 1.5 });
      geoGroup.add(new THREE.Line(arcGeo, arcMat));
    });

    // 4. Cylinders
    cylinders.forEach((cyl) => {
      const cThree = logicalToThree(cyl.center);
      const normalThree = cyl.normal ? logicalToThreeNormal(cyl.normal) : new THREE.Vector3(0, 1, 0);
      const { basePoints, topPoints, silhouetteLines } = getCylinderGeometryData(
        cThree,
        cyl.radius,
        cyl.height,
        normalThree
      );

      const cylLineMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 1.5 });
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(basePoints), cylLineMat));
      geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPoints), cylLineMat));
      silhouetteLines.forEach(([p1, p2]) => {
        geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), cylLineMat));
      });
    });

    requestRender();
  }, [lines, arcs, cylinders, hideOccluded, requestRender]);

  // 4. Update Highlight Layer (Hover & Selection) - Instant lightweight update!
  useEffect(() => {
    const hlGroup = highlightGroupRef.current;
    hlGroup.clear();

    const targetId = selectedLineId || hoveredLineId;
    if (!targetId) {
      requestRender();
      return;
    }

    const matchedLine = lines.find((l) => l.id === targetId);
    if (matchedLine) {
      const isSelected = matchedLine.id === selectedLineId;
      const v1 = logicalToThree(matchedLine.start);
      const v2 = logicalToThree(matchedLine.end);
      const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);

      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x4f46e5 : 0xf59e0b,
        linewidth: isSelected ? 3 : 2,
        depthTest: false,
      });
      hlGroup.add(new THREE.Line(geo, lineMat));

      if (isSelected) {
        const haloMat = new THREE.LineBasicMaterial({
          color: 0x818cf8,
          transparent: true,
          opacity: 0.6,
          linewidth: 5,
          depthTest: false,
        });
        hlGroup.add(new THREE.Line(geo, haloMat));
      }
    }

    requestRender();
  }, [selectedLineId, hoveredLineId, lines, requestRender]);

  // Pointer Interactions: Selection
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const mount = mountRef.current;
    const camera = cameraRef.current;
    if (!mount || !camera) return;

    const rect = mount.getBoundingClientRect();
    const clickScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    let closestLineId: string | null = null;
    let minScreenDist = 14;

    lines.forEach((line) => {
      const v1 = logicalToThree(line.start).project(camera);
      const v2 = logicalToThree(line.end).project(camera);

      const s1 = {
        x: ((v1.x + 1) * mount.clientWidth) / 2,
        y: ((-v1.y + 1) * mount.clientHeight) / 2,
      };
      const s2 = {
        x: ((v2.x + 1) * mount.clientWidth) / 2,
        y: ((-v2.y + 1) * mount.clientHeight) / 2,
      };

      const dx = s2.x - s1.x;
      const dy = s2.y - s1.y;
      const lenSq = dx * dx + dy * dy;
      let dist = 999;

      if (lenSq === 0) {
        dist = Math.hypot(clickScreen.x - s1.x, clickScreen.y - s1.y);
      } else {
        const t = Math.max(0, Math.min(1, ((clickScreen.x - s1.x) * dx + (clickScreen.y - s1.y) * dy) / lenSq));
        const px = s1.x + t * dx;
        const py = s1.y + t * dy;
        dist = Math.hypot(clickScreen.x - px, clickScreen.y - py);
      }

      if (dist < minScreenDist) {
        minScreenDist = dist;
        closestLineId = line.id;
      }
    });

    onSelectLine?.(closestLineId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    if (!mount || !camera) return;

    const rect = mount.getBoundingClientRect();
    const mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    let foundHoverId: string | null = null;
    let minScreenDist = 10;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const v1 = logicalToThree(line.start).project(camera);
      const v2 = logicalToThree(line.end).project(camera);

      const s1x = ((v1.x + 1) * mount.clientWidth) / 2;
      const s1y = ((-v1.y + 1) * mount.clientHeight) / 2;
      const s2x = ((v2.x + 1) * mount.clientWidth) / 2;
      const s2y = ((-v2.y + 1) * mount.clientHeight) / 2;

      const dx = s2x - s1x;
      const dy = s2y - s1y;
      const lenSq = dx * dx + dy * dy;
      let dist = 999;
      if (lenSq === 0) {
        dist = Math.hypot(mouseScreen.x - s1x, mouseScreen.y - s1y);
      } else {
        const t = Math.max(0, Math.min(1, ((mouseScreen.x - s1x) * dx + (mouseScreen.y - s1y) * dy) / lenSq));
        dist = Math.hypot(mouseScreen.x - (s1x + t * dx), mouseScreen.y - (s1y + t * dy));
      }

      if (dist < minScreenDist) {
        minScreenDist = dist;
        foundHoverId = line.id;
      }
    }

    if (foundHoverId !== hoveredLineId) {
      setHoveredLineId(foundHoverId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.4, Math.min(4.0, prev * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
      onWheel={handleWheel}
    >
      {/* CAD Viewport Title Bar */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(4px)',
          border: '1px solid #e5e7eb',
          borderRadius: 4,
          padding: '2px 8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1f2937', letterSpacing: '0.04em' }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
          {viewType === 'top' ? 'X / Y [Planta]' : viewType === 'front' ? 'X / Z [Frontal]' : 'Y / Z [Lateral]'}
        </span>
      </div>

      {/* Render Canvas Mount */}
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', cursor: 'pointer' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredLineId(null)}
      />
    </div>
  );
});
