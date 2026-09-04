import React from 'react';
import { DrawingLine, Lesson } from '../types/drawing';
import { evaluateDrawing } from '../geometry/evaluator';
import { CheckCircle2, Circle, Lightbulb } from 'lucide-react';

interface InstructionsPanelProps {
  lesson: Lesson | null;
  lines: DrawingLine[];
  unitSize: number;
}

export const InstructionsPanel: React.FC<InstructionsPanelProps> = ({
  lesson,
  lines,
  unitSize,
}) => {
  if (!lesson) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#9ca3af',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Instructions
        </div>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Freeform Practice Mode active. Draw isometric lines freely or switch modes in the top bar.
        </p>
      </div>
    );
  }

  const evaluation = evaluateDrawing(lines, lesson, unitSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Instructions header */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#9ca3af',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Instructions
        </div>
        <p style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.45, margin: 0 }}>
          {lesson.instructions}
        </p>
      </div>

      {/* Objectives checklist */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#9ca3af',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Objectives
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              padding: '1px 5px',
              borderRadius: 3,
              backgroundColor: evaluation.allCompleted ? '#dcfce7' : '#f3f4f6',
              color: evaluation.allCompleted ? '#166534' : '#374151',
              fontWeight: 600,
            }}
          >
            {evaluation.score}%
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lesson.objectives.map((obj) => {
            const isDone = evaluation.completedObjectives[obj.id] || false;
            return (
              <div
                key={obj.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  fontSize: 11,
                  color: isDone ? '#111827' : '#6b7280',
                }}
              >
                <div style={{ marginTop: 1, flexShrink: 0 }}>
                  {isDone ? (
                    <CheckCircle2 size={13} color="#111827" />
                  ) : (
                    <Circle size={13} color="#9ca3af" />
                  )}
                </div>
                <span style={{ textDecoration: isDone ? 'none' : 'none', fontWeight: isDone ? 500 : 400 }}>
                  {obj.description}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hints */}
      {lesson.hints && lesson.hints.length > 0 && (
        <div
          style={{
            padding: '8px 10px',
            backgroundColor: '#f9fafb',
            borderRadius: 4,
            border: '1px solid #f3f4f6',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 600,
              color: '#4b5563',
            }}
          >
            <Lightbulb size={11} />
            <span>Drafting Tip</span>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
            {lesson.hints[0]}
          </span>
        </div>
      )}
    </div>
  );
};
