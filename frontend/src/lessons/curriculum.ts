import { DrawingLine, Lesson } from '../types/drawing';

// Target lines for the Stepped Incline Block shown in the reference screenshot
export const STEPPED_INCLINE_TARGET_LINES: DrawingLine[] = [
  // Base lower front box
  { id: 't1', start: { x: -6, y: 4, z: 0 }, end: { x: -2, y: 6, z: 0 }, layerId: 'target' },
  { id: 't2', start: { x: -2, y: 6, z: 0 }, end: { x: 2, y: 4, z: 0 }, layerId: 'target' },
  { id: 't3', start: { x: -6, y: 4, z: 0 }, end: { x: -6, y: 4, z: 2 }, layerId: 'target' },
  { id: 't4', start: { x: -2, y: 6, z: 0 }, end: { x: -2, y: 6, z: 2 }, layerId: 'target' },
  { id: 't5', start: { x: 2, y: 4, z: 0 }, end: { x: 2, y: 4, z: 2 }, layerId: 'target' },
  { id: 't6', start: { x: -6, y: 4, z: 2 }, end: { x: -2, y: 6, z: 2 }, layerId: 'target' },
  { id: 't7', start: { x: -2, y: 6, z: 2 }, end: { x: 2, y: 4, z: 2 }, layerId: 'target' },

  // Vertical tower back
  { id: 't8', start: { x: -4, y: 0, z: 2 }, end: { x: -4, y: 0, z: 8 }, layerId: 'target' },
  { id: 't9', start: { x: -4, y: 0, z: 8 }, end: { x: 0, y: -2, z: 8 }, layerId: 'target' },
  { id: 't10', start: { x: 0, y: -2, z: 8 }, end: { x: 4, y: 0, z: 8 }, layerId: 'target' },
  { id: 't11', start: { x: 0, y: 2, z: 8 }, end: { x: 4, y: 0, z: 8 }, layerId: 'target' },
  { id: 't12', start: { x: -4, y: 0, z: 8 }, end: { x: 0, y: 2, z: 8 }, layerId: 'target' },
  { id: 't13', start: { x: 0, y: 2, z: 8 }, end: { x: 0, y: 2, z: 5 }, layerId: 'target' },
  { id: 't14', start: { x: 0, y: 2, z: 5 }, end: { x: 4, y: 4, z: 5 }, layerId: 'target' },

  // Angled Incline / Wedge
  { id: 't15', start: { x: 0, y: 2, z: 5 }, end: { x: 4, y: 8, z: 0 }, layerId: 'target' },
  { id: 't16', start: { x: 4, y: 4, z: 5 }, end: { x: 8, y: 10, z: 0 }, layerId: 'target' },
  { id: 't17', start: { x: 4, y: 8, z: 0 }, end: { x: 8, y: 10, z: 0 }, layerId: 'target' },
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
