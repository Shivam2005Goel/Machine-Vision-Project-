import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_LEARN_ORDER,
  clearInMemoryColorReferences,
  hasPersistedColorCalibration,
  isColorsCalibrated,
  loadPersistedColorReferences,
  resetColorReferences,
  saveLearnedColor,
} from './colorReference';

const STORAGE_KEY = 'makemecubemaster-color-calibration';

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  resetColorReferences();
  vi.unstubAllGlobals();
});

describe('hasPersistedColorCalibration', () => {
  it('is false when storage is empty', () => {
    expect(hasPersistedColorCalibration()).toBe(false);
  });

  it('is true when a full calibration is saved', () => {
    for (const color of COLOR_LEARN_ORDER) {
      saveLearnedColor(color, [50, 10, 10]);
    }
    expect(isColorsCalibrated()).toBe(true);
    expect(hasPersistedColorCalibration()).toBe(true);
  });

  it('loadPersistedColorReferences restores saved refs after in-memory clear', () => {
    for (const color of COLOR_LEARN_ORDER) {
      saveLearnedColor(color, [50, 10, 10]);
    }
    clearInMemoryColorReferences();
    expect(isColorsCalibrated()).toBe(false);
    expect(loadPersistedColorReferences()).toBe(true);
    expect(isColorsCalibrated()).toBe(true);
  });

  it('resetColorReferences clears storage', () => {
    for (const color of COLOR_LEARN_ORDER) {
      saveLearnedColor(color, [50, 10, 10]);
    }
    resetColorReferences();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(hasPersistedColorCalibration()).toBe(false);
  });
});
