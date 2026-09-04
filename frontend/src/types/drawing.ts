export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type LineType = 'solid' | 'dashed' | 'centerline' | 'hidden';

export interface LineStyle {
  stroke?: string;
  strokeWidth?: number;
  lineType?: LineType;
}

export interface DrawingLine {
  id: string;
  start: Point3D;
  end: Point3D;
  layerId: string;
  style?: LineStyle;
}

export type IsoplanePlane = 'top' | 'front' | 'side';

export interface DrawingArc {
  id: string;
  center: Point3D;
  radius: number; // in logical grid units
  plane: IsoplanePlane;
  startAngle?: number; // degrees, default 0
  endAngle?: number;   // degrees, default 360
  layerId: string;
  style?: LineStyle;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface GridSettings {
  unitSize: number;
  snapToGrid: boolean;
  snapToIsometric: boolean;
  snapToEndpoints: boolean;
  showGrid: boolean;
  gridType: 'isometric' | 'orthographic';
}

export interface ProjectMetadata {
  name: string;
  author: string;
  created: string;
  modified: string;
  mode: AppMode;
}

export interface DrawVizProject {
  version: string;
  metadata: ProjectMetadata;
  gridSettings: GridSettings;
  layers: Layer[];
  lines: DrawingLine[];
  arcs?: DrawingArc[];
  activeLessonId?: string;
}

export type ToolType = 'select' | 'line' | 'circle' | 'eraser' | 'pan' | 'zoom';
export type AppMode = 'practice' | 'lessons' | 'challenges';
export type SelectionMode = 'vertex' | 'edge' | 'face';

export interface Face3D {
  id: string;
  normal: Point3D;
  center: Point3D;
  vertices: Point3D[];
  plane: IsoplanePlane;
  elevation: number;
}

export interface LessonObjective {
  id: string;
  description: string;
  completed: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  mode: AppMode;
  instructions: string;
  objectives: LessonObjective[];
  targetLines?: DrawingLine[];
  hints?: string[];
}
