import React, { useState } from 'react';
import {
  DrawingLine,
  DrawingArc,
  DrawingCylinder,
  DrawingSphere,
  EntityGroup,
  GroupType,
  Layer,
  ToolType,
  Point3D,
  Face3D,
  ArcBulgeDirection,
  AppTheme,
} from '../types/drawing';
import { calculateLogicalLength, getLineDirection } from '../geometry/isometric';
import { logicalToThree, threeToLogical, threeToLogicalNormal, getTwoPointArcPoints } from '../geometry/circle3d';
import {
  Trash2,
  Sparkles,
  Box,
  ArrowUpCircle,
  Layers,
  Unlink,
  Link2,
  Circle,
  Plus,
  Minus,
  Sliders,
  FolderTree,
  Edit2,
  Check,
  X,
  Target,
} from 'lucide-react';

interface PropertyPanelProps {
  selectedLine: DrawingLine | null;
  selectedArc?: DrawingArc | null;
  selectedCylinder?: DrawingCylinder | null;
  selectedSphere?: DrawingSphere | null;
  selectedVertex?: Point3D | null;
  selectedFace?: Face3D | null;
  selectedLineIds?: string[];
  selectedArcIds?: string[];
  selectedCylinderIds?: string[];
  selectedSphereIds?: string[];
  selectedVertices?: Point3D[];
  selectedFaces?: Face3D[];
  selectionCategory?: 'vertex' | 'edge' | 'plane' | 'mesh' | null;
  totalLines: number;
  totalArcs?: number;
  totalCylinders?: number;
  totalSpheres?: number;
  layers?: Layer[];
  unitSize: number;
  zoom: number;
  activeTool: ToolType;
  theme?: AppTheme;
  groups?: EntityGroup[];
  selectedGroupId?: string | null;
  groupMode?: boolean;
  onToggleGroupMode?: (enabled: boolean) => void;
  onCreateGroup?: (name: string, type: GroupType, memberIds: string[]) => string;
  onCreateGroupFromSelection?: (name?: string) => string | null;
  onSelectGroup?: (groupId: string) => void;
  onDeleteGroupAndMembers?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onClearSelection?: () => void;
  onUngroup?: (groupId: string) => void;
  onDeleteLine: (id: string) => void;
  onDeleteArc?: (id: string) => void;
  onDeleteCylinder?: (id: string) => void;
  onDeleteSphere?: (id: string) => void;
  onExtrudeArc?: (arc: DrawingArc) => void;
  onUpdateArc?: (arc: DrawingArc) => void;
  onUpdateSphere?: (sphere: DrawingSphere) => void;
  onUpdateLineStyle: (id: string, style: Partial<DrawingLine['style']>) => void;
  onSketchOnFace?: (face: Face3D) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedLine,
  selectedArc = null,
  selectedCylinder = null,
  selectedSphere = null,
  selectedVertex = null,
  selectedFace = null,
  selectedLineIds = [],
  selectedArcIds = [],
  selectedCylinderIds = [],
  selectedSphereIds = [],
  selectedVertices = [],
  selectedFaces = [],
  selectionCategory = null,
  totalLines,
  totalArcs = 0,
  totalCylinders = 0,
  totalSpheres = 0,
  layers = [],
  unitSize,
  zoom,
  activeTool,
  theme = 'light',
  groups = [],
  selectedGroupId = null,
  groupMode = true,
  onToggleGroupMode,
  onCreateGroup,
  onCreateGroupFromSelection,
  onSelectGroup,
  onDeleteGroupAndMembers,
  onRenameGroup,
  onClearSelection,
  onUngroup,
  onDeleteLine,
  onDeleteArc,
  onDeleteCylinder,
  onDeleteSphere,
  onExtrudeArc,
  onUpdateArc,
  onUpdateSphere,
  onUpdateLineStyle,
  onSketchOnFace,
}) => {
  const isDark = theme === 'dark';
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'groups'>('properties');
  const [groupFilter, setGroupFilter] = useState<'all' | 'mesh' | 'plane' | 'edge' | 'vertex'>('all');
  const [customGroupName, setCustomGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const multiCount =
    (selectedLineIds?.length || 0) +
    (selectedArcIds?.length || 0) +
    (selectedCylinderIds?.length || 0) +
    (selectedSphereIds?.length || 0) +
    (selectedVertices?.length || 0) +
    (selectedFaces?.length || 0);

  const renderGroupWidget = (
    currentGroupId?: string,
    defaultType: GroupType = 'edge',
    memberIds: string[] = [],
    defaultName: string = 'Group'
  ) => {
    const existingGroup = currentGroupId ? groups.find((g) => g.id === currentGroupId) : null;

    if (existingGroup) {
      return (
        <div
          style={{
            marginTop: 6,
            padding: '7px 9px',
            backgroundColor: isDark ? '#1a1d24' : '#f1f5f9',
            borderRadius: 5,
            border: isDark ? '1px solid #2e3542' : '1px solid #cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Layers size={12} style={{ color: isDark ? '#a5b4fc' : '#4f46e5' }} />
              <span style={{ fontWeight: 600, fontSize: 10, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {existingGroup.name}
              </span>
            </div>
            <span
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                color: isDark ? '#c7d2fe' : '#4338ca',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {existingGroup.type}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: isDark ? '#94a3b8' : '#64748b' }}>
            <span>Group Size</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{existingGroup.memberIds.length} members</span>
          </div>

          <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
            <button
              onClick={() => onToggleGroupMode?.(!groupMode)}
              style={{
                flex: 1,
                padding: '4px 6px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: groupMode ? '#4f46e5' : isDark ? '#334155' : '#94a3b8',
                color: '#ffffff',
                fontSize: 9,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Toggle moving all members together vs moving only this single element"
            >
              {groupMode ? 'Group Move: ON' : 'Single Move'}
            </button>
            <button
              onClick={() => onUngroup?.(existingGroup.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 6px',
                borderRadius: 4,
                border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                backgroundColor: 'transparent',
                color: isDark ? '#cbd5e1' : '#475569',
                fontSize: 9,
                fontWeight: 500,
                cursor: 'pointer',
              }}
              title="Dissolve group"
            >
              <Unlink size={10} />
              <span>Ungroup</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => onCreateGroup?.(defaultName, defaultType, memberIds)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '5px 8px',
            backgroundColor: isDark ? '#1f242d' : '#f8fafc',
            border: isDark ? '1px dashed #3e4856' : '1px dashed #94a3b8',
            borderRadius: 4,
            color: isDark ? '#93c5fd' : '#2563eb',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title={`Group this ${defaultType} with others of the same type`}
        >
          <Link2 size={11} />
          <span>Group as {defaultType.charAt(0).toUpperCase() + defaultType.slice(1)}</span>
        </button>
      </div>
    );
  };

  const handleUpdateArcBulge = (newBulge: ArcBulgeDirection) => {
    if (!selectedArc || !selectedArc.startPoint || !selectedArc.endPoint || !onUpdateArc) return;
    const p1 = logicalToThree(selectedArc.startPoint);
    const p2 = logicalToThree(selectedArc.endPoint);
    const res = getTwoPointArcPoints(p1, p2, selectedArc.radius, newBulge, 48);
    const updated: DrawingArc = {
      ...selectedArc,
      radius: res.actualRadius,
      center: threeToLogical(res.center),
      normal: threeToLogicalNormal(res.normal),
      bulgeDir: newBulge,
      endAngle: Math.round((res.subtendedAngle * 180) / Math.PI),
    };
    onUpdateArc(updated);
  };

  const handleUpdateArcRadius = (newR: number) => {
    if (!selectedArc || !onUpdateArc) return;
    if (selectedArc.startPoint && selectedArc.endPoint) {
      const p1 = logicalToThree(selectedArc.startPoint);
      const p2 = logicalToThree(selectedArc.endPoint);
      const bDir = selectedArc.bulgeDir || '+z';
      const res = getTwoPointArcPoints(p1, p2, Math.max(1, newR), bDir, 48);
      const updated: DrawingArc = {
        ...selectedArc,
        radius: res.actualRadius,
        center: threeToLogical(res.center),
        normal: threeToLogicalNormal(res.normal),
        endAngle: Math.round((res.subtendedAngle * 180) / Math.PI),
      };
      onUpdateArc(updated);
    } else {
      onUpdateArc({ ...selectedArc, radius: Math.max(1, newR) });
    }
  };

  const lineDetails = selectedLine
    ? {
        length: calculateLogicalLength(selectedLine.start, selectedLine.end, unitSize),
        direction: getLineDirection(selectedLine.start, selectedLine.end, unitSize),
      }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Inspector Tab Switcher */}
      <div
        style={{
          display: 'flex',
          backgroundColor: isDark ? '#1f242d' : '#f1f5f9',
          padding: 2,
          borderRadius: 6,
          gap: 2,
        }}
      >
        <button
          onClick={() => setInspectorTab('properties')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 5,
            border: 'none',
            backgroundColor: inspectorTab === 'properties' ? (isDark ? '#2d3340' : '#ffffff') : 'transparent',
            color: inspectorTab === 'properties' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
            fontSize: 11,
            fontWeight: inspectorTab === 'properties' ? 600 : 500,
            cursor: 'pointer',
            boxShadow: inspectorTab === 'properties' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Sliders size={12} />
          <span>Properties</span>
        </button>

        <button
          onClick={() => setInspectorTab('groups')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 5,
            border: 'none',
            backgroundColor: inspectorTab === 'groups' ? (isDark ? '#2d3340' : '#ffffff') : 'transparent',
            color: inspectorTab === 'groups' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
            fontSize: 11,
            fontWeight: inspectorTab === 'groups' ? 600 : 500,
            cursor: 'pointer',
            boxShadow: inspectorTab === 'groups' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <FolderTree size={12} />
          <span>Groups</span>
          <span
            style={{
              padding: '1px 5px',
              borderRadius: 10,
              fontSize: 9,
              fontWeight: 700,
              backgroundColor: inspectorTab === 'groups' ? (isDark ? '#4f46e5' : '#e0e7ff') : (isDark ? '#2d3340' : '#e2e8f0'),
              color: inspectorTab === 'groups' ? (isDark ? '#ffffff' : '#4338ca') : (isDark ? '#94a3b8' : '#64748b'),
            }}
          >
            {groups.length}
          </span>
        </button>
      </div>

      {inspectorTab === 'groups' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Quick Grouping Banner if multiple items selected */}
          {multiCount > 0 && (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: isDark ? '#1e2430' : '#eff6ff',
                border: isDark ? '1px solid #3b82f6' : '1px solid #93c5fd',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                  Selection: {multiCount} {selectionCategory || 'items'}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: 3,
                    backgroundColor: isDark ? '#2563eb' : '#bfdbfe',
                    color: isDark ? '#ffffff' : '#1e40af',
                  }}
                >
                  {selectionCategory || 'mixed'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder={`Name (e.g. ${selectionCategory ? selectionCategory.charAt(0).toUpperCase() + selectionCategory.slice(1) + ' Group' : 'Group'})`}
                  value={customGroupName}
                  onChange={(e) => setCustomGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onCreateGroupFromSelection?.(customGroupName);
                      setCustomGroupName('');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: 11,
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    border: isDark ? '1px solid #374151' : '1px solid #cbd5e1',
                    borderRadius: 4,
                    color: isDark ? '#f8fafc' : '#0f172a',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => {
                    onCreateGroupFromSelection?.(customGroupName);
                    setCustomGroupName('');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    backgroundColor: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Group selected elements together (Ctrl+G)"
                >
                  <Link2 size={11} />
                  <span>Group</span>
                </button>
                <button
                  onClick={() => onClearSelection?.()}
                  style={{
                    padding: '4px 6px',
                    backgroundColor: 'transparent',
                    color: isDark ? '#94a3b8' : '#64748b',
                    border: isDark ? '1px solid #374151' : '1px solid #cbd5e1',
                    borderRadius: 4,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                  title="Clear current selection"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Group Transform Behavior Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              backgroundColor: isDark ? '#1a1d24' : '#f8fafc',
              borderRadius: 5,
              border: isDark ? '1px solid #2e3542' : '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 500 }}>
              Group Transform Mode
            </span>
            <button
              onClick={() => onToggleGroupMode?.(!groupMode)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: groupMode ? '#4f46e5' : isDark ? '#334155' : '#cbd5e1',
                color: '#ffffff',
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="When ON, transforming any member of a group moves/rotates/scales the entire group"
            >
              {groupMode ? 'ALL AS UNIT' : 'SINGLE'}
            </button>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['all', 'mesh', 'plane', 'edge', 'vertex'] as const).map((cat) => {
              const count = cat === 'all' ? groups.length : groups.filter((g) => g.type === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setGroupFilter(cat)}
                  style={{
                    padding: '3px 7px',
                    borderRadius: 4,
                    border: 'none',
                    fontSize: 9,
                    fontWeight: groupFilter === cat ? 700 : 500,
                    backgroundColor: groupFilter === cat ? (isDark ? '#4f46e5' : '#e0e7ff') : (isDark ? '#232731' : '#f1f5f9'),
                    color: groupFilter === cat ? (isDark ? '#ffffff' : '#4338ca') : (isDark ? '#94a3b8' : '#64748b'),
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Groups List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups
              .filter((g) => groupFilter === 'all' || g.type === groupFilter)
              .map((group) => {
                const isEditing = editingGroupId === group.id;
                const isSelected = selectedGroupId === group.id;
                const typeColors = {
                  mesh: { bg: isDark ? '#1e3a8a' : '#dbeafe', text: isDark ? '#93c5fd' : '#1d4ed8' },
                  plane: { bg: isDark ? '#064e3b' : '#d1fae5', text: isDark ? '#6ee7b7' : '#047857' },
                  edge: { bg: isDark ? '#312e81' : '#ede9fe', text: isDark ? '#c7d2fe' : '#6d28d9' },
                  vertex: { bg: isDark ? '#78350f' : '#fef3c7', text: isDark ? '#fde68a' : '#b45309' },
                }[group.type] || { bg: isDark ? '#27272a' : '#f4f4f5', text: isDark ? '#a1a1aa' : '#52525b' };

                return (
                  <div
                    key={group.id}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: isSelected
                        ? (isDark ? 'rgba(79, 70, 229, 0.22)' : '#eef2ff')
                        : (isDark ? '#1a1d24' : '#ffffff'),
                      borderRadius: 6,
                      border: isSelected
                        ? '1px solid #6366f1'
                        : (isDark ? '1px solid #2e3542' : '1px solid #e2e8f0'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <Layers size={13} style={{ color: isSelected ? '#818cf8' : (isDark ? '#a5b4fc' : '#4f46e5'), flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 3,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            backgroundColor: typeColors.bg,
                            color: typeColors.text,
                          }}
                        >
                          {group.type}
                        </span>

                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onRenameGroup?.(group.id, editingName);
                                  setEditingGroupId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingGroupId(null);
                                }
                              }}
                              autoFocus
                              style={{
                                flex: 1,
                                fontSize: 10,
                                padding: '2px 4px',
                                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                border: '1px solid #4f46e5',
                                borderRadius: 3,
                                color: isDark ? '#ffffff' : '#000000',
                                outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => {
                                onRenameGroup?.(group.id, editingName);
                                setEditingGroupId(null);
                              }}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, color: '#10b981' }}
                            >
                              <Check size={11} />
                            </button>
                            <button
                              onClick={() => setEditingGroupId(null)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, color: '#ef4444' }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <span
                            onDoubleClick={() => {
                              setEditingGroupId(group.id);
                              setEditingName(group.name);
                            }}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isDark ? '#f1f5f9' : '#0f172a',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {group.name}
                          </span>
                        )}
                      </div>

                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingGroupId(group.id);
                            setEditingName(group.name);
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: isDark ? '#64748b' : '#94a3b8',
                            padding: 2,
                          }}
                          title="Rename Group"
                        >
                          <Edit2 size={10} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: isDark ? '#94a3b8' : '#64748b' }}>
                      <span>{group.memberIds.length} members</span>
                    </div>

                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <button
                        onClick={() => onSelectGroup?.(group.id)}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          padding: '4px 6px',
                          borderRadius: 4,
                          border: isSelected ? '1px solid #6366f1' : (isDark ? '1px solid #374151' : '1px solid #cbd5e1'),
                          backgroundColor: isSelected ? '#4f46e5' : (isDark ? '#232731' : '#f8fafc'),
                          color: isSelected ? '#ffffff' : (isDark ? '#93c5fd' : '#2563eb'),
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Select this group in 3D viewport"
                      >
                        <Target size={10} />
                        <span>{isSelected ? 'Selected' : 'Select'}</span>
                      </button>
                      <button
                        onClick={() => onUngroup?.(group.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 6px',
                          borderRadius: 4,
                          border: isDark ? '1px solid #374151' : '1px solid #cbd5e1',
                          backgroundColor: 'transparent',
                          color: isDark ? '#cbd5e1' : '#475569',
                          fontSize: 9,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                        title="Dissolve group into individual items"
                      >
                        <Unlink size={10} />
                        <span>Ungroup</span>
                      </button>
                      <button
                        onClick={() => onDeleteGroupAndMembers?.(group.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '4px 6px',
                          borderRadius: 4,
                          border: isDark ? '1px solid #7f1d1d' : '1px solid #fecaca',
                          backgroundColor: 'transparent',
                          color: isDark ? '#f87171' : '#dc2626',
                          fontSize: 9,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                        title="Delete group and all its member entities"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}

            {groups.filter((g) => groupFilter === 'all' || g.type === groupFilter).length === 0 && (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  backgroundColor: isDark ? '#181b22' : '#f8fafc',
                  borderRadius: 6,
                  border: isDark ? '1px dashed #2d3340' : '1px dashed #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FolderTree size={22} style={{ color: isDark ? '#4b5563' : '#9ca3af' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>
                  No groups {groupFilter !== 'all' ? `in ${groupFilter}` : 'created yet'}
                </span>
                <span style={{ fontSize: 10, color: isDark ? '#6b7280' : '#9ca3af', lineHeight: 1.4 }}>
                  Select multiple items of the same type using Shift+Click, then press Ctrl+G or use the Group button.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Active Selected Group Info Card in Properties tab */}
          {selectedGroupId && (() => {
            const activeGroup = groups.find((g) => g.id === selectedGroupId);
            if (!activeGroup) return null;
            return (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: isDark ? '#1e2430' : '#eff6ff',
                  border: isDark ? '1px solid #4f46e5' : '1px solid #93c5fd',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={14} style={{ color: isDark ? '#a5b4fc' : '#4f46e5' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                      {activeGroup.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 3,
                      backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                      color: isDark ? '#c7d2fe' : '#4338ca',
                    }}
                  >
                    {activeGroup.type}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
                  <span>Group Members</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{activeGroup.memberIds.length} items</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => onToggleGroupMode?.(!groupMode)}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: groupMode ? '#4f46e5' : (isDark ? '#334155' : '#94a3b8'),
                      color: '#ffffff',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Toggle moving all members together vs single item"
                  >
                    {groupMode ? 'Group Move: ON' : 'Single Move'}
                  </button>
                  <button
                    onClick={() => onUngroup?.(activeGroup.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                      backgroundColor: 'transparent',
                      color: isDark ? '#cbd5e1' : '#475569',
                      fontSize: 10,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    title="Dissolve group into individual items"
                  >
                    <Unlink size={11} />
                    <span>Ungroup</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Multi-Selection Info Card in Properties tab */}
          {multiCount > 1 && !selectedGroupId && (
            <div
              style={{
                padding: '8px 10px',
                backgroundColor: isDark ? '#1e2430' : '#eff6ff',
                border: isDark ? '1px solid #3b82f6' : '1px solid #93c5fd',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                  Multi-Selection: {multiCount} items
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '1px 5px',
                    borderRadius: 3,
                    backgroundColor: isDark ? '#2563eb' : '#bfdbfe',
                    color: isDark ? '#ffffff' : '#1e40af',
                  }}
                >
                  {selectionCategory || 'mixed'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#64748b' }}>
                Hold Shift to add or toggle more elements of the same type.
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button
                  onClick={() => onCreateGroupFromSelection?.()}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    padding: '5px 8px',
                    backgroundColor: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Link2 size={11} />
                  <span>Group Selected (Ctrl+G)</span>
                </button>
                <button
                  onClick={() => setInspectorTab('groups')}
                  style={{
                    padding: '5px 8px',
                    backgroundColor: 'transparent',
                    color: isDark ? '#93c5fd' : '#2563eb',
                    border: isDark ? '1px solid #3b82f6' : '1px solid #93c5fd',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Manage Groups
                </button>
              </div>
            </div>
          )}

          {selectedLine && lineDetails ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Tool</span>
            <span style={{ fontWeight: 500 }}>Line</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Start</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.start.x}, {selectedLine.start.y}, {selectedLine.start.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>End</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedLine.end.x}, {selectedLine.end.y}, {selectedLine.end.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Length</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lineDetails.length}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Angle</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {lineDetails.direction.angle}°
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Direction</span>
            <span
              style={{
                backgroundColor: isDark ? '#282c34' : '#f3f4f6',
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 500,
                color: isDark ? '#cbd5e1' : '#111827',
              }}
            >
              {lineDetails.direction.directionLabel}
            </span>
          </div>

          <div
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: isDark ? '1px solid #2d3139' : '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Type</span>
            <select
              value={selectedLine.style?.lineType || 'solid'}
              onChange={(e) =>
                onUpdateLineStyle(selectedLine.id, {
                  lineType: e.target.value as any,
                })
              }
              style={{
                fontSize: 11,
                border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                borderRadius: 3,
                padding: '2px 4px',
                background: isDark ? '#1e2026' : '#ffffff',
                color: isDark ? '#f8fafc' : '#111827',
              }}
            >
              <option value="solid">Solid (Continuous)</option>
              <option value="dashed">Dashed (Hidden)</option>
            </select>
          </div>

          {renderGroupWidget(selectedLine.groupId, 'edge', [selectedLine.id], 'Edge Group')}

          <button
            onClick={() => onDeleteLine(selectedLine.id)}
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>Delete Selected</span>
          </button>
        </div>
      ) : selectedArc ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>
              {selectedArc.startPoint && selectedArc.endPoint
                ? 'Two-Vertex Arc'
                : (selectedArc.endAngle ?? 360) - (selectedArc.startAngle ?? 0) <= 180
                ? 'Half Arc (180°)'
                : 'Circle (360°)'}
            </span>
          </div>

          {selectedArc.startPoint && selectedArc.endPoint ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 10 }}>Endpoints (P1 → P2)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                  ({selectedArc.startPoint.x}, {selectedArc.startPoint.y}, {selectedArc.startPoint.z || 0}) → (
                  {selectedArc.endPoint.x}, {selectedArc.endPoint.y}, {selectedArc.endPoint.z || 0})
                </span>
              </div>

              {(() => {
                const chordDist =
                  Math.round(
                    Math.hypot(
                      selectedArc.endPoint.x - selectedArc.startPoint.x,
                      selectedArc.endPoint.y - selectedArc.startPoint.y,
                      (selectedArc.endPoint.z || 0) - (selectedArc.startPoint.z || 0)
                    ) * 10
                  ) / 10;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                      <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Chord Distance</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{chordDist}</span>
                    </div>

                    <div>
                      <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 10, display: 'block', marginBottom: 4 }}>
                        Bulge / Plane Direction:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                        {(['+z', '-z', '+y', '-y', '+x', '-x'] as const).map((dir) => {
                          const isSel = (selectedArc.bulgeDir || '+z') === dir;
                          return (
                            <button
                              key={dir}
                              onClick={() => handleUpdateArcBulge(dir)}
                              style={{
                                padding: '3px 4px',
                                fontSize: 10,
                                fontWeight: isSel ? 700 : 500,
                                backgroundColor: isSel ? '#4f46e5' : (isDark ? '#22262e' : '#f1f5f9'),
                                color: isSel ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569'),
                                border: isSel ? '1px solid #4f46e5' : (isDark ? '1px solid #334155' : '1px solid #cbd5e1'),
                                borderRadius: 4,
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                              }}
                            >
                              {dir}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius:</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist / 2)))}
                            title="Set to exact semicircle (180° / π radians)"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            π (D/2)
                          </button>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist)))}
                            title="Radius = Chord Distance"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            1×
                          </button>
                          <button
                            onClick={() => handleUpdateArcRadius(Math.max(1, Math.round(chordDist * 2)))}
                            title="Radius = 2 * Chord Distance (Gentle curve)"
                            style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              backgroundColor: isDark ? '#312e81' : '#e0e7ff',
                              color: isDark ? '#c7d2fe' : '#3730a3',
                              border: isDark ? '1px solid #4338ca' : '1px solid #c7d2fe',
                              borderRadius: 3,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            2×
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => handleUpdateArcRadius(Math.max(1, selectedArc.radius - 1))}
                          style={{
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDark ? '#22262e' : '#f1f5f9',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            color: isDark ? '#e2e8f0' : '#111827',
                            cursor: 'pointer',
                          }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={selectedArc.radius}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v > 0) handleUpdateArcRadius(v);
                          }}
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: '2px 0',
                            fontSize: 11,
                            backgroundColor: isDark ? '#1e2026' : '#ffffff',
                            color: isDark ? '#f8fafc' : '#111827',
                          }}
                        />
                        <button
                          onClick={() => handleUpdateArcRadius(selectedArc.radius + 1)}
                          style={{
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDark ? '#22262e' : '#f1f5f9',
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            borderRadius: 4,
                            color: isDark ? '#e2e8f0' : '#111827',
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Plane / Normal</span>
                <span
                  style={{
                    backgroundColor: isDark ? '#2e1065' : '#ede9fe',
                    color: isDark ? '#c4b5fd' : '#5b21b6',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 600,
                    fontSize: 10,
                  }}
                >
                  {selectedArc.normal
                    ? `[${selectedArc.normal.x}, ${selectedArc.normal.y}, ${selectedArc.normal.z || 0}]`
                    : (selectedArc.plane || 'TOP').toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  ({selectedArc.center.x}, {selectedArc.center.y}, {selectedArc.center.z || 0})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius (R)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Diameter (Ø)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedArc.radius * 2}</span>
              </div>
            </>
          )}

          {onExtrudeArc && (
            <button
              onClick={() => onExtrudeArc(selectedArc)}
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '6px 8px',
                backgroundColor: '#4f46e5',
                border: 'none',
                borderRadius: 4,
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Extrude circle into 3D cylinder (E)"
            >
              <ArrowUpCircle size={13} />
              <span>Extrude to Cylinder (E)</span>
            </button>
          )}

          {renderGroupWidget(selectedArc.groupId, 'edge', [selectedArc.id], 'Edge Group')}

          <button
            onClick={() => onDeleteArc?.(selectedArc.id)}
            style={{
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>{selectedArc.startPoint && selectedArc.endPoint ? 'Delete Arc' : 'Delete Circle'}</span>
          </button>
        </div>
      ) : selectedCylinder ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>3D Cylinder</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedCylinder.center.x}, {selectedCylinder.center.y}, {selectedCylinder.center.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius (R)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedCylinder.radius}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Height (H)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedCylinder.height}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Normal</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10 }}>
              [{selectedCylinder.normal?.x ?? 0}, {selectedCylinder.normal?.y ?? 0}, {selectedCylinder.normal?.z ?? 1}]
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Volume</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(Math.PI * selectedCylinder.radius * selectedCylinder.radius * selectedCylinder.height)}
            </span>
          </div>

          {renderGroupWidget(selectedCylinder.groupId, 'mesh', [selectedCylinder.id], 'Cylinder Group')}

          <button
            onClick={() => onDeleteCylinder?.(selectedCylinder.id)}
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>Delete Cylinder</span>
          </button>
        </div>
      ) : selectedSphere ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entity</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>3D Solid Sphere</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedSphere.center.x}, {selectedSphere.center.y}, {selectedSphere.center.z || 0})
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Radius (R)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => onUpdateSphere?.({ ...selectedSphere, radius: Math.max(1, selectedSphere.radius - 1) })}
                style={{
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  border: isDark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                  borderRadius: 3,
                  color: isDark ? '#f4f4f5' : '#18181b',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                -
              </button>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 20, textAlign: 'center' }}>
                {selectedSphere.radius}
              </span>
              <button
                onClick={() => onUpdateSphere?.({ ...selectedSphere, radius: selectedSphere.radius + 1 })}
                style={{
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  border: isDark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                  borderRadius: 3,
                  color: isDark ? '#f4f4f5' : '#18181b',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Diameter (Ø)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedSphere.radius * 2}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Surface Area</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(4 * Math.PI * selectedSphere.radius * selectedSphere.radius)}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Volume</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round((4 / 3) * Math.PI * Math.pow(selectedSphere.radius, 3))}
            </span>
          </div>

          {renderGroupWidget(selectedSphere.groupId, 'mesh', [selectedSphere.id], 'Sphere Mesh')}

          <button
            onClick={() => onDeleteSphere?.(selectedSphere.id)}
            style={{
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              backgroundColor: isDark ? '#22262e' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
              borderRadius: 4,
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            <span>Delete Sphere</span>
          </button>
        </div>
      ) : selectedVertex ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>3D Vertex</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate X</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.x}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate Y (Depth)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.y}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Coordinate Z (Height)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedVertex.z || 0}</span>
          </div>

          {renderGroupWidget(undefined, 'vertex', [`v_${selectedVertex.x}_${selectedVertex.y}_${selectedVertex.z || 0}`], 'Vertex Group')}

          <div
            style={{
              marginTop: 6,
              padding: '6px 8px',
              backgroundColor: isDark ? '#1e1b4b' : '#eef2ff',
              borderRadius: 4,
              border: isDark ? '1px solid #3730a3' : '1px solid #c7d2fe',
              color: isDark ? '#c7d2fe' : '#3730a3',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            Vertex selected. Switch to Line tool (L) to snap and draw directly from this point.
          </div>
        </div>
      ) : selectedFace ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Selection</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>Planar Face</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Plane Orientation</span>
            <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{selectedFace.plane}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Face Elevation</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedFace.elevation}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Center (X, Y, Z)</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ({selectedFace.center.x}, {selectedFace.center.y}, {selectedFace.center.z})
            </span>
          </div>

          <button
            onClick={() => onSketchOnFace?.(selectedFace)}
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: 4,
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(79, 70, 229, 0.25)',
            }}
          >
            <Sparkles size={13} />
            <span>Sketch on this Face</span>
          </button>

          {renderGroupWidget(selectedFace.groupId, 'plane', [selectedFace.id], 'Plane Group')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Workspace</span>
            <span style={{ fontWeight: 500 }}>3D CAD Studio</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Active Tool</span>
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{activeTool}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Entities</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {totalLines} lines{totalArcs > 0 ? `, ${totalArcs} circles` : ''}{totalCylinders > 0 ? `, ${totalCylinders} cylinders` : ''}{totalSpheres > 0 ? `, ${totalSpheres} spheres` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#e2e8f0' : '#374151' }}>
            <span style={{ color: isDark ? '#94a3b8' : '#6b7280' }}>Zoom Level</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              padding: '6px 8px',
              backgroundColor: isDark ? '#1e2026' : '#f9fafb',
              borderRadius: 4,
              border: isDark ? '1px solid #2d3139' : '1px solid #f3f4f6',
              color: isDark ? '#94a3b8' : '#6b7280',
              fontSize: 10,
              lineHeight: 1.4,
            }}
          >
            Use Blender modes 1 (Vertex), 2 (Edge), 3 (Face) to inspect and sketch on 3D geometry.
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};
