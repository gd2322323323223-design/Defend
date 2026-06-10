/**
 * 共用 GLTF 快取 — 避免重複下載，職業預覽與戰鬥共用
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export function loadGLTF(path) {
  if (!cache.has(path)) {
    cache.set(path, loader.loadAsync(path).catch((err) => {
      cache.delete(path);
      throw err;
    }));
  }
  return cache.get(path);
}

export function preloadGLTF(paths) {
  return Promise.all([...new Set(paths)].map(loadGLTF));
}
