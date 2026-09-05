import { DrawingLine, Lesson } from '../types/drawing';

// Target lines for the Stepped Incline Block shown in the reference blueprint
export const STEPPED_INCLINE_TARGET_LINES: DrawingLine[] = [
  // 1. Base Box (Z = 0 to Z = 2)
  { id: 'b1', start: { x: -2, y: -3, z: 0 }, end: { x: 2, y: -3, z: 0 }, layerId: 'target' },
  { id: 'b2', start: { x: 2, y: -3, z: 0 }, end: { x: 2, y: 3, z: 0 }, layerId: 'target' },
  { id: 'b3', start: { x: 2, y: 3, z: 0 }, end: { x: -2, y: 3, z: 0 }, layerId: 'target' },
  { id: 'b4', start: { x: -2, y: 3, z: 0 }, end: { x: -2, y: -3, z: 0 }, layerId: 'target' },

  // Base vertical corner risers
  { id: 'b5', start: { x: -2, y: -3, z: 0 }, end: { x: -2, y: -3, z: 2 }, layerId: 'target' },
  { id: 'b6', start: { x: 2, y: -3, z: 0 }, end: { x: 2, y: -3, z: 2 }, layerId: 'target' },
  { id: 'b7', start: { x: 2, y: 3, z: 0 }, end: { x: 2, y: 3, z: 2 }, layerId: 'target' },
  { id: 'b8', start: { x: -2, y: 3, z: 0 }, end: { x: -2, y: 3, z: 2 }, layerId: 'target' },

  // Base front top edge
  { id: 'b9', start: { x: -2, y: 3, z: 2 }, end: { x: 2, y: 3, z: 2 }, layerId: 'target' },

  // 2. Vertical Tower (Z = 2 to Z = 8, Y from -3 to 0)
  { id: 't1', start: { x: -2, y: -3, z: 2 }, end: { x: -2, y: -3, z: 8 }, layerId: 'target' },
  { id: 't2', start: { x: 2, y: -3, z: 2 }, end: { x: 2, y: -3, z: 8 }, layerId: 'target' },
  { id: 't3', start: { x: -2, y: 0, z: 2 }, end: { x: -2, y: 0, z: 8 }, layerId: 'target' },
  { id: 't4', start: { x: 2, y: 0, z: 2 }, end: { x: 2, y: 0, z: 8 }, layerId: 'target' },

  // Tower top face
  { id: 't5', start: { x: -2, y: -3, z: 8 }, end: { x: 2, y: -3, z: 8 }, layerId: 'target' },
  { id: 't6', start: { x: 2, y: -3, z: 8 }, end: { x: 2, y: 0, z: 8 }, layerId: 'target' },
  { id: 't7', start: { x: 2, y: 0, z: 8 }, end: { x: -2, y: 0, z: 8 }, layerId: 'target' },
  { id: 't8', start: { x: -2, y: 0, z: 8 }, end: { x: -2, y: -3, z: 8 }, layerId: 'target' },

  // 3. Step Platform (Z = 5, Y from 0 to 1)
  { id: 's1', start: { x: -2, y: 0, z: 5 }, end: { x: -2, y: 1, z: 5 }, layerId: 'target' },
  { id: 's2', start: { x: 2, y: 0, z: 5 }, end: { x: 2, y: 1, z: 5 }, layerId: 'target' },
  { id: 's3', start: { x: -2, y: 1, z: 5 }, end: { x: 2, y: 1, z: 5 }, layerId: 'target' },

  // 4. Incline / Ramp Face (from Y = 1, Z = 5 down to Y = 3, Z = 2)
  { id: 'r1', start: { x: -2, y: 1, z: 5 }, end: { x: -2, y: 3, z: 2 }, layerId: 'target' },
  { id: 'r2', start: { x: 2, y: 1, z: 5 }, end: { x: 2, y: 3, z: 2 }, layerId: 'target' },
];

export const CURRICULUM: Lesson[] = [
  {
    id: 'lesson-1',
    title: 'Isometric Basics & Axes',
    mode: 'lessons',
    instructions:
      'Practice drawing along the three primary isometric axes (+30°, -30°, and Vertical). Click on any grid intersection, extend your cursor, and observe the live directional snapping indicators.',
    objectives: [
      { id: 'obj-1', description: 'Draw a vertical line (90°)', completed: false },
      { id: 'obj-2', description: 'Draw a horizontal line (0°)', completed: false },
      { id: 'obj-3', description: 'Draw an isometric edge (+30° or -30°)', completed: false },
    ],
    hints: [
      'Select the Line tool with hotkey "L".',
      'The grid snaps automatically to nearest 1×1 intersections.',
      'Press Escape at any time to cancel an active line.',
    ],
  },
  {
    id: 'lesson-2',
    title: 'Isometric Prism Construction',
    mode: 'lessons',
    instructions:
      'Construct a 3D isometric rectangular prism. In technical drawing, all parallel spatial edges remain strictly parallel on the 2D drafting sheet.',
    objectives: [
      { id: 'obj-prism-1', description: 'Construct the base face using 4 edges', completed: false },
      { id: 'obj-prism-2', description: 'Extend vertical risers from base vertices', completed: false },
      { id: 'obj-prism-3', description: 'Connect the top planar face', completed: false },
    ],
    hints: [
      'Use continuous drawing: clicking to complete an edge starts the next edge automatically.',
      'Notice the bottom orthographic viewports updating in real time.',
    ],
  },
  {
    id: 'challenge-1',
    title: 'Stepped Incline Block Challenge',
    mode: 'challenges',
    instructions:
      'Recreate the technical stepped incline component shown in the engineering blueprint. Follow the isometric grid measurements and complete the object and its three orthographic views.',
    targetLines: STEPPED_INCLINE_TARGET_LINES,
    objectives: [
      { id: 'ch1-obj1', description: 'Draw the isometric object', completed: false },
      { id: 'ch1-obj2', description: 'Complete the top view', completed: false },
      { id: 'ch1-obj3', description: 'Complete the front view', completed: false },
      { id: 'ch1-obj4', description: 'Complete the side view', completed: false },
    ],
    hints: [
      'Start with the base perimeter to establish the footprint.',
      'Construct the vertical tower, then add the stepped platform.',
      'Finally connect the inclined wedge face from the step down to the base.',
    ],
  },
];
