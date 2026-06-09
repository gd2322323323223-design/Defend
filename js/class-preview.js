/**
 * 職業選擇畫面 — 各卡片 3D 預覽（正面朝向、鐘擺搖晃、持武）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
import { EquipmentManager } from '@/equipment.js';
import { ANIMATION_FILES, ANIM_MAP } from '@/models-config.js';

const gltfCache = new Map();
const loader = new GLTFLoader();
let heroAnimClips = null;

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
    if (child.isMesh) {
      child.castShadow = true;
      if (child.material) child.material.fog = false;
    }
  });
}

/** KayKit 模型預設朝 -Z，鏡頭在 +Z，需轉 180° 與玩家面對面 */
const FACE_CAMERA_Y = Math.PI;

export class ClassPreviewManager {
  constructor() {
    this.instances = [];
    this.clock = new THREE.Clock();
    this.raf = null;
    this._resizeObserver = null;
    this.equipmentManager = new EquipmentManager();
  }

  async mountAll(classes) {
    this.dispose();
    const clips = await loadHeroAnimClips();
    await Promise.all(classes.map((cls, i) => this._mountOne(cls, i, clips)));
    this._startLoop();
    this._observeResize();
  }

  async _mountOne(cls, index, clips) {
    const card = document.querySelector(`.class-card[data-class-id="${cls.id}"]`);
    if (!card) return;

    const wrap = document.createElement('div');
    wrap.className = 'class-preview-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.insertBefore(wrap, card.firstChild);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.2);
    key.position.set(0, 4, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6688ff, 0.45);
    fill.position.set(-2, 2, 2);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.0, 2.5);
    camera.lookAt(0, 0.88, 0);

    try {
      const gltf = await fetchGLTF(cls.modelPath);
      const model = cloneSkinnedModel(gltf.scene);
      elevateModel(model);
      model.scale.setScalar(0.52);
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
      const idleClip = findIdleClip(clips);
      if (idleClip) {
        mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(idleClip);
        action.play();
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
      this._resizeInstance(this.instances[this.instances.length - 1]);
    } catch (err) {
      console.warn(`職業預覽載入失敗: ${cls.modelPath}`, err);
      wrap.remove();
      renderer.dispose();
    }
  }

  _resizeInstance(inst) {
    const { wrap, renderer, camera } = inst;
    const w = wrap.clientWidth || 140;
    const h = wrap.clientHeight || 120;
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
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.equipmentManager.detachAll();
    this.instances.forEach((inst) => {
      inst.wrap.remove();
      inst.renderer.dispose();
      inst.scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
    });
    this.instances = [];
  }
}
