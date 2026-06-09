/**
 * 序列圖 Billboard 特效 — 永遠面向鏡頭的 Plane 動畫
 */

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const textureCache = new Map();

export const SPLASH04 = {
  path: 'assets/vfx/splash04.png',
  columns: 5,
  rows: 2,
  frameCount: 10,
  fps: 22,
  scale: 2.4,
  yOffset: 1.15,
};

function loadTexture(path) {
  if (textureCache.has(path)) return textureCache.get(path);
  const promise = loader.loadAsync(path).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
  textureCache.set(path, promise);
  return promise;
}

export function preloadSpriteSheet(config = SPLASH04) {
  return loadTexture(config.path);
}

function setFrameUV(texture, frame, columns, rows) {
  const col = frame % columns;
  const row = Math.floor(frame / columns);
  const rw = 1 / columns;
  const rh = 1 / rows;
  texture.offset.set(col * rw, 1 - (row + 1) * rh);
  texture.repeat.set(rw, rh);
}

/**
 * 在 model 世界座標播放序列圖 Billboard，播完由 trackFn 自動銷毀
 */
export async function spawnSpriteBillboard({
  scene,
  camera,
  trackFn,
  model,
  config = SPLASH04,
  scale,
  yOffset,
}) {
  const texture = await loadTexture(config.path);
  setFrameUV(texture, 0, config.columns, config.rows);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const planeSize = scale ?? config.scale;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), material);
  mesh.renderOrder = 1000;

  const pos = new THREE.Vector3();
  model.getWorldPosition(pos);
  pos.y += yOffset ?? config.yOffset ?? 1.1;
  mesh.position.copy(pos);
  scene.add(mesh);

  const totalMs = (config.frameCount / config.fps) * 1000;
  trackFn(mesh, totalMs + 80);

  const start = performance.now();
  const frameDuration = 1000 / config.fps;

  const tick = () => {
    if (camera) mesh.quaternion.copy(camera.quaternion);

    const elapsed = performance.now() - start;
    const frame = Math.min(
      config.frameCount - 1,
      Math.floor(elapsed / frameDuration),
    );
    setFrameUV(texture, frame, config.columns, config.rows);

    if (elapsed < totalMs) requestAnimationFrame(tick);
  };
  tick();

  return mesh;
}
