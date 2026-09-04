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
  activeLessonId?: string;
}

export type ToolType = 'select' | 'line' | 'eraser' | 'pan' | 'zoom';
export type AppMode = 'practice' | 'lessons' | 'challenges';

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
