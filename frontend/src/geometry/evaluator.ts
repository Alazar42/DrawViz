import { DrawingLine, Lesson, Point3D } from '../types/drawing';
import { calculateLogicalLength, getLineDirection } from './isometric';

export interface EvaluationResult {
  completedObjectives: Record<string, boolean>;
  allCompleted: boolean;
  score: number;
  feedback: string[];
}

function pointsMatch(p1: Point3D, p2: Point3D, tolerance: number = 0.5): boolean {
  return (
    Math.abs(p1.x - p2.x) <= tolerance &&
    Math.abs(p1.y - p2.y) <= tolerance &&
    Math.abs((p1.z || 0) - (p2.z || 0)) <= tolerance
  );
}

function linesMatch(l1: DrawingLine, l2: DrawingLine, tolerance: number = 0.5): boolean {
  const direct =
    pointsMatch(l1.start, l2.start, tolerance) && pointsMatch(l1.end, l2.end, tolerance);
  const reversed =
    pointsMatch(l1.start, l2.end, tolerance) && pointsMatch(l1.end, l2.start, tolerance);
  return direct || reversed;
}

/**
 * Evaluates current user drawing lines against active lesson or challenge objectives
 */
export function evaluateDrawing(
  lines: DrawingLine[],
  lesson: Lesson | null,
  unitSize: number = 28
): EvaluationResult {
  if (!lesson || lesson.objectives.length === 0) {
    return {
      completedObjectives: {},
      allCompleted: true,
      score: 100,
      feedback: ['Practice mode active.'],
    };
  }

  const completedObjectives: Record<string, boolean> = {};
  const feedback: string[] = [];

  // If lesson defines explicit targetLines:
  if (lesson.targetLines && lesson.targetLines.length > 0) {
    let matchedCount = 0;
    const targets = lesson.targetLines;

    for (const target of targets) {
      const found = lines.some((userLine) => linesMatch(userLine, target));
      if (found) matchedCount++;
    }

    const matchRatio = matchedCount / targets.length;

    // Check specific objectives
    for (const obj of lesson.objectives) {
      const lower = obj.description.toLowerCase();
      if (lower.includes('isometric object') || lower.includes('recreate') || lower.includes('draw')) {
        const done = matchRatio >= 0.85;
        completedObjectives[obj.id] = done;
        if (done) {
          feedback.push(`✓ Target geometry completed (${matchedCount}/${targets.length} edges)`);
        } else {
          feedback.push(`Missing edges: drawn ${matchedCount} of ${targets.length} required lines`);
        }
      } else if (lower.includes('top view') || lower.includes('top')) {
        completedObjectives[obj.id] = matchRatio >= 0.6;
      } else if (lower.includes('front view') || lower.includes('front')) {
        completedObjectives[obj.id] = matchRatio >= 0.7;
      } else if (lower.includes('side view') || lower.includes('side')) {
        completedObjectives[obj.id] = matchRatio >= 0.8;
      } else {
        completedObjectives[obj.id] = matchRatio >= 0.9;
      }
    }
  } else {
    // Dynamic rule evaluations based on objective text
    for (const obj of lesson.objectives) {
      const desc = obj.description.toLowerCase();

      if (desc.includes('horizontal') && desc.includes('length')) {
        // e.g. "Draw a horizontal line 4 units long"
        const found = lines.some((l) => {
          const len = calculateLogicalLength(l.start, l.end, unitSize);
          const dir = getLineDirection(l.start, l.end, unitSize);
          return dir.directionLabel === 'Horizontal' && Math.abs(len - 4) < 0.3;
        });
        completedObjectives[obj.id] = found;
        if (found) feedback.push('✓ Horizontal line constructed with length 4');
      } else if (desc.includes('vertical')) {
        const found = lines.some((l) => {
          const dir = getLineDirection(l.start, l.end, unitSize);
          return dir.directionLabel === 'Vertical';
        });
        completedObjectives[obj.id] = found;
        if (found) feedback.push('✓ Vertical line constructed');
      } else if (desc.includes('isometric') && desc.includes('box') || desc.includes('rectangle')) {
        completedObjectives[obj.id] = lines.length >= 4;
      } else {
        // Generic fallback
        completedObjectives[obj.id] = lines.length >= 3;
      }
    }
  }

  const allCompleted = lesson.objectives.every((obj) => completedObjectives[obj.id]);
  const totalCompleted = Object.values(completedObjectives).filter(Boolean).length;
  const score = Math.round((totalCompleted / lesson.objectives.length) * 100);

  return {
    completedObjectives,
    allCompleted,
    score,
    feedback,
  };
}
