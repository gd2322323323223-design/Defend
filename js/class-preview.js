/**
 * 職業選擇畫面 — 單一 WebGL 渲染四格預覽（避免 iPad 多 context 崩潰）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
import { EquipmentManager } from '@/equipment.js';
import { ANIMATION_FILES, ANIM_MAP } from '@/models-config.js';

const gltfCache = new Map();
const loader = new GLTFLoader();
let heroAnimClips = null;

function isLowPowerDevice() {
  return window.matchMedia('(max-width: 1024px)').matches
    || navigator.maxTouchPoints > 0;
}

async function fetchGLTF(path) {
  if (gltfCache.has(path)) return gltfCache.get(path);
  const gltf = await loader.loadAsync(path);
  gltfCache.set(path, gltf);
  return gltf;
}

async function loadHeroAnimClips() {
  if (heroAnimClips) return heroAnimClips;
  try {
    const gltf = await loader.loadAsync(ANIMATION_FILES.hero);
    heroAnimClips = gltf.animations || [];
  } catch {
    heroAnimClips = [];
  }
  return heroAnimClips;
}

function findIdleClip(clips) {
  const names = ANIM_MAP.idle || ['Idle_A'];
  for (const name of names) {
    const clip = clips.find((a) => a.name === name);
    if (clip) return clip;
  }
  return clips.find((a) => a.name.toLowerCase().includes('idle')) || clips[0];
}

function elevateModel(model) {
  model.traverse((child) => {
    if (child.isMesh && child.material) child.material.fog = false;
  });
}

/** 鏡頭在 +Z，模型正面朝玩家 */
const FACE_CAMERA_Y = 0;

export class ClassPreviewManager {
  constructor() {
    this.instances = [];
    this.clock = new THREE.Clock();
    this.raf = null;
    this._resizeObserver = null;
    this.equipmentManager = new EquipmentManager();
    this.grid = null;
    this.canvas = null;
    this.renderer = null;
    this.lowPower = isLowPowerDevice();
  }

  async mountAll(classes) {
    this.dispose();
    this.grid = document.getElementById('class-grid');
    if (!this.grid) return;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'class-preview-shared';
    this.grid.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !this.lowPower,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(this.lowPower ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 0);

    const clips = this.lowPower ? [] : await loadHeroAnimClips();

    for (let i = 0; i < classes.length; i++) {
      await this._mountOne(classes[i], i, clips);
    }

    this._resizeCanvas();
    this._startLoop();
    this._observeResize();
  }

  async _mountOne(cls, index, clips) {
    const card = document.querySelector(`.class-card[data-class-id="${cls.id}"]`);
    if (!card) return;

    let wrap = card.querySelector('.class-preview-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'class-preview-wrap';
      card.insertBefore(wrap, card.firstChild);
    }

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x8899bb, 0.95));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.15);
    key.position.set(0, 4, 4);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.0, 2.45);
    camera.lookAt(0, 0.88, 0);

    try {
      const gltf = await fetchGLTF(cls.modelPath);
      const model = cloneSkinnedModel(gltf.scene);
      elevateModel(model);
      model.scale.setScalar(this.lowPower ? 0.48 : 0.52);
      model.position.y = 0.08;
      model.rotation.y = FACE_CAMERA_Y;
      scene.add(model);

      if (cls.defaultEquipment) {
        await this.equipmentManager.attachEquipment(
          model,
          cls.defaultEquipment,
          `preview_${cls.id}`,
        );
      }

      let mixer = null;
      if (!this.lowPower) {
        const idleClip = findIdleClip(clips);
        if (idleClip) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(idleClip).play();
        }
      }

      this.instances.push({
        scene,
        camera,
        model,
        mixer,
        wrap,
        phase: index * 1.4,
      });
    } catch (err) {
      console.warn(`職業預覽載入失敗: ${cls.modelPath}`, err);
    }
  }

  _resizeCanvas() {
    if (!this.grid || !this.renderer) return;
    const w = this.grid.clientWidth;
    const h = this.grid.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
  }

  _observeResize() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this.grid);
  }

  _renderAll() {
    if (!this.renderer || !this.grid) return;

    const dpr = this.renderer.getPixelRatio();
    const canvasRect = this.canvas.getBoundingClientRect();

    this.renderer.setScissorTest(true);
    this.renderer.clear();

    this.instances.forEach((inst) => {
      const rect = inst.wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.round((rect.left - canvasRect.left) * dpr);
      const y = Math.round((canvasRect.bottom - rect.bottom) * dpr);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);

      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);

      inst.camera.aspect = rect.width / rect.height;
      inst.camera.updateProjectionMatrix();
      this.renderer.render(inst.scene, inst.camera);
    });

    this.renderer.setScissorTest(false);
  }

  _startLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clock.start();
    const tick = () => {
      const delta = this.clock.getDelta();
      const t = this.clock.getElapsedTime();

      this.instances.forEach((inst) => {
        if (inst.mixer) inst.mixer.update(delta);
        const sway = Math.sin(t * 1.1 + inst.phase) * 0.07;
        inst.model.rotation.y = FACE_CAMERA_Y;
        inst.model.rotation.z = sway;
        inst.model.rotation.x = 0;
      });

      this._renderAll();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  dispose() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.equipmentManager.detachAll();
    this.instances = [];
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.grid = null;
  }
}
