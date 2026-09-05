import { useSyncExternalStore } from 'react';
import { Point3D, ScreenPoint } from '../types/drawing';
import { HostPlaneInfo } from '../geometry/snapping';

export interface CursorData {
  screen: ScreenPoint;
  logical: Point3D;
  snapType: string;
  angleDeg?: number;
  hostPlane?: HostPlaneInfo;
}

let currentCursor: CursorData = {
  screen: { x: 0, y: 0 },
  logical: { x: 0, y: 0, z: 0 },
  snapType: 'grid',
};

const listeners = new Set<() => void>();

let rafPending = false;
let nextCursor: CursorData | null = null;

export const cursorStore = {
  getSnapshot(): CursorData {
    return currentCursor;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Updates cursor state with RAF throttling so UI components only re-render
   * at most once per display frame, completely decoupled from root App state.
   */
  update(data: CursorData): void {
    nextCursor = data;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (nextCursor) {
          currentCursor = nextCursor;
          nextCursor = null;
          listeners.forEach((l) => l());
        }
      });
    }
  },
};

export function useCursorData(): CursorData {
  return useSyncExternalStore(cursorStore.subscribe, cursorStore.getSnapshot);
}
