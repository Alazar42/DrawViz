import React from 'react';

export const AxisIndicator: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <svg width="84" height="84" viewBox="-42 -42 84 84">
        {/* Origin dot */}
        <circle cx="0" cy="0" r="1.5" fill="#374151" />

        {/* Z Axis: Straight Up (0, -32) */}
        <line x1="0" y1="0" x2="0" y2="-28" stroke="#374151" strokeWidth="1.2" />
        <text
          x="0"
          y="-33"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#1f2937"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          Z
        </text>

        {/* X Axis: Down-Left (-24.2, 14) -> 210 degrees */}
        <line x1="0" y1="0" x2="-24.2" y2="14" stroke="#374151" strokeWidth="1.2" />
        <text
          x="-30"
          y="18"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#1f2937"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          X
        </text>

        {/* Y Axis: Down-Right (24.2, 14) -> 330 degrees */}
        <line x1="0" y1="0" x2="24.2" y2="14" stroke="#374151" strokeWidth="1.2" />
        <text
          x="30"
          y="18"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#1f2937"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          Y
        </text>
      </svg>
    </div>
  );
};
