import React from 'react';
import { Layer } from '../types/drawing';
import { Eye, EyeOff, Plus, Trash2, Lock, Unlock } from 'lucide-react';

interface LayersPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onToggleVisibility,
  onAddLayer,
  onDeleteLayer,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#9ca3af',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Layers
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {layers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderRadius: 4,
                border: isActive ? '1px solid #d1d5db' : '1px solid #f3f4f6',
                backgroundColor: isActive ? '#f3f4f6' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: layer.visible ? '#374151' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    color: '#1f2937',
                  }}
                >
                  {layer.name}
                </span>
              </div>

              {layers.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLayer(layer.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Delete Layer"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Layer action controls (+ Add) */}
      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <button
          onClick={onAddLayer}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '4px 8px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            fontSize: 11,
            color: '#374151',
            cursor: 'pointer',
          }}
          title="Add New Layer"
        >
          <Plus size={13} />
          <span>Add Layer</span>
        </button>
      </div>
    </div>
  );
};
