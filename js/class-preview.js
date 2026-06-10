/**
 * 職業選擇畫面 — 並行載入、不透明預覽（避免背後 3D 場景疊成黑霧）
 */

import * as THREE from 'three';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF } from '@/asset-cache.js';
import { ANIMATION_FILES, ANIM_MAP } from '@/models-config.js';

let heroAnimClips = null;

async function loadHeroAnimClips() {
  if (heroAnimClips) return heroAnimClips;
  try {
    const gltf = await loadGLTF(ANIMATION_FILES.hero);
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
    if (child.isMesh && child.material) {
      child.material.fog = false;
      child.material.side = THREE.FrontSide;
    }
  });
}

const FACE_CAMERA_Y = 0;

/** 與各職業卡配色呼應的不透明底色 */
const PREVIEW_BG = {
  knight: 0x1e4a6e,
  warrior: 0x6d3018,
  mage: 0x3d1f52,
  assassin: 0x1f4a28,
};

export class ClassPreviewManager {
  constructor() {
    this.instances = [];
    this.clock = new THREE.Clock();
    this.raf = null;
    this._resizeObserver = null;
    this._active = false;
  }

  async mountAll(classes) {
    this.dispose();
    const clips = await loadHeroAnimClips();
    await Promise.all(classes.map((cls, i) => this._mountOne(cls, i, clips)));

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    this.instances.forEach((inst) => this._resizeInstance(inst));
    this._active = true;
    this._startLoop();
    this._observeResize();
  }

  async _mountOne(cls, index, clips) {
    const card = document.querySelector(`.class-card[data-class-id="${cls.id}"]`);
    if (!card) return;

    const wrap = card.querySelector('.class-preview-wrap');
    if (!wrap) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'class-preview-canvas';
    wrap.appendChild(canvas);

    const bg = PREVIEW_BG[cls.id] ?? 0x1a2744;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(bg, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445566, 1.1));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.35);
    key.position.set(1.5, 5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.45);
    fill.position.set(-2, 2, -1);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.0, 2.45);
    camera.lookAt(0, 0.88, 0);

    try {
      const gltf = await loadGLTF(cls.modelPath);
      const model = cloneSkinnedModel(gltf.scene);
      elevateModel(model);
      model.scale.setScalar(0.52);
      model.position.y = 0.08;
      model.rotation.y = FACE_CAMERA_Y;
      scene.add(model);

      let mixer = null;
      const idleClip = findIdleClip(clips);
      if (idleClip) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idleClip).play();
      }

      this.instances.push({
        renderer,
        scene,
        camera,
        model,
        mixer,
        wrap,
        phase: index * 1.4,
      });
    } catch (err) {
      console.warn(`職業預覽載入失敗: ${cls.modelPath}`, err);
      canvas.remove();
      renderer.dispose();
    }
  }

  _resizeInstance(inst) {
    const { wrap, renderer, camera } = inst;
    const w = Math.max(wrap.clientWidth, 1);
    const h = Math.max(wrap.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  _observeResize() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      this.instances.forEach((inst) => this._resizeInstance(inst));
    });
    this.instances.forEach((inst) => this._resizeObserver.observe(inst.wrap));
  }

  _startLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clock.start();
    const tick = () => {
      if (!this._active) return;
      const delta = this.clock.getDelta();
      const t = this.clock.getElapsedTime();

      this.instances.forEach((inst) => {
        if (inst.mixer) inst.mixer.update(delta);
        const sway = Math.sin(t * 1.1 + inst.phase) * 0.07;
        inst.model.rotation.y = FACE_CAMERA_Y;
        inst.model.rotation.z = sway;
        inst.model.rotation.x = 0;
        inst.renderer.render(inst.scene, inst.camera);
      });

      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  dispose() {
    this._active = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.instances.forEach((inst) => {
      inst.wrap.querySelector('.class-preview-canvas')?.remove();
      inst.renderer.dispose();
    });
    this.instances = [];
  }
}
