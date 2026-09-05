import React from 'react';

export const OrientationGizmo: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        backdropFilter: 'blur(6px)',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: '6px 8px',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
    >
      <svg width="86" height="80" viewBox="0 0 86 80">
        {/* 1. TOP FACE (Diamond on top) */}
        <polygon
          points="43,12 18,26 43,40 68,26"
          fill="rgba(255, 255, 255, 0.85)"
          stroke="#4b5563"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <text
          x="43"
          y="28"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="#111827"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="0.06em"
        >
          PLANTA
        </text>

        {/* 2. FRONT FACE (Left side along X axis) */}
        <polygon
          points="18,26 43,40 43,68 18,54"
          fill="rgba(243, 244, 246, 0.78)"
          stroke="#4b5563"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <text
          x="30.5"
          y="50"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#1f2937"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="0.05em"
          transform="rotate(-18 30.5 50)"
        >
          FRONTAL
        </text>

        {/* 3. SIDE FACE (Right side along Y axis) */}
        <polygon
          points="43,40 68,26 68,54 43,68"
          fill="rgba(229, 231, 235, 0.78)"
          stroke="#4b5563"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <text
          x="55.5"
          y="50"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#1f2937"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="0.05em"
          transform="rotate(18 55.5 50)"
        >
          LATERAL
        </text>

        {/* Center vertex point */}
        <circle cx="43" cy="40" r="1.5" fill="#111827" />
      </svg>

      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#6b7280',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Orientation Gizmo
      </span>
    </div>
  );
};
