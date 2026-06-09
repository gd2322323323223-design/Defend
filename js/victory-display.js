/**
 * 勝利畫面 — 英雄 3D 展示 + 彩帶碎紙
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const gltfCache = new Map();

const CONFETTI_COLORS = [
  '#ff6b35', '#ffd54f', '#4fc3f7', '#ce93d8', '#66bb6a', '#ef5350', '#fff176',
];

async function fetchGLTF(path) {
  if (gltfCache.has(path)) return gltfCache.get(path);
  const gltf = await loader.loadAsync(path);
  gltfCache.set(path, gltf);
  return gltf;
}

export class VictoryDisplay {
  constructor() {
    this.raf = null;
    this.heroRenderer = null;
    this.confettiRenderer = null;
    this.heroScene = null;
    this.heroCamera = null;
    this.confettiScene = null;
    this.confettiCamera = null;
    this.particles = [];
    this.heroModels = [];
    this.clock = new THREE.Clock();
    this._active = false;
  }

  async show(classes) {
    this.dispose();

    const wrap = document.getElementById('victory-heroes-wrap');
    const heroCanvas = document.getElementById('victory-heroes-canvas');
    const confettiCanvas = document.getElementById('victory-confetti');
    if (!wrap || !heroCanvas || !confettiCanvas) return;

    wrap.classList.remove('hidden');
    confettiCanvas.classList.remove('hidden');

    await this._setupHeroes(heroCanvas, classes);
    this._setupConfetti(confettiCanvas);
    this._resize();
    this._active = true;
    this._startLoop();

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(wrap.parentElement || wrap);
  }

  async _setupHeroes(canvas, classes) {
    this.heroRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    this.heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.heroRenderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.heroScene = new THREE.Scene();
    this.heroScene.add(new THREE.AmbientLight(0x8899bb, 0.9));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.3);
    key.position.set(2, 6, 4);
    this.heroScene.add(key);

    this.heroCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.heroCamera.position.set(0, 1.4, 4.2);
    this.heroCamera.lookAt(0, 0.9, 0);

    const offsets = classes.length === 1 ? [0] : [-1.1, 1.1];
    this.heroModels = [];
    await Promise.all(classes.map(async (cls, i) => {
      try {
        const gltf = await fetchGLTF(cls.modelPath);
        const model = cloneSkinnedModel(gltf.scene);
        model.scale.setScalar(0.55);
        model.position.set(offsets[i] ?? 0, 0.08, 0);
        model.rotation.y = 0;
        this.heroScene.add(model);
        this.heroModels.push(model);
      } catch (err) {
        console.warn('勝利模型載入失敗', cls.id, err);
      }
    }));
  }

  _setupConfetti(canvas) {
    this.confettiRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
    });
    this.confettiRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.confettiScene = new THREE.Scene();
    this.confettiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.confettiCamera.position.z = 5;

    const count = 120;
    for (let i = 0; i < count; i++) {
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const w = 0.02 + Math.random() * 0.04;
      const h = 0.01 + Math.random() * 0.03;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
      );
      mesh.position.set(
        (Math.random() - 0.5) * 2.2,
        1.2 + Math.random() * 0.5,
        0,
      );
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.userData = {
        vy: -(0.15 + Math.random() * 0.35),
        vx: (Math.random() - 0.5) * 0.12,
        vr: (Math.random() - 0.5) * 2,
        sway: Math.random() * Math.PI * 2,
      };
      this.confettiScene.add(mesh);
      this.particles.push(mesh);
    }
  }

  _resize() {
    const wrap = document.getElementById('victory-heroes-wrap');
    const confettiCanvas = document.getElementById('victory-confetti');
    if (!wrap) return;

    const section = wrap.closest('#screen-result');
    const w = section?.clientWidth || window.innerWidth;
    const heroH = Math.min(220, w * 0.42);

    wrap.style.height = `${heroH}px`;

    if (this.heroRenderer) {
      this.heroRenderer.setSize(w, heroH, false);
      if (this.heroCamera) {
        this.heroCamera.aspect = w / heroH;
        this.heroCamera.updateProjectionMatrix();
      }
    }

    if (this.confettiRenderer && section) {
      const sh = section.clientHeight;
      this.confettiRenderer.setSize(w, sh, false);
    }
  }

  _startLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clock.start();

    const tick = () => {
      if (!this._active) return;
      const t = this.clock.getElapsedTime();

      this.particles.forEach((p) => {
        const d = p.userData;
        p.position.y += d.vy * 0.016;
        p.position.x += d.vx * 0.016 + Math.sin(t * 2 + d.sway) * 0.002;
        p.rotation.z += d.vr * 0.016;
        if (p.position.y < -1.3) {
          p.position.y = 1.3 + Math.random() * 0.3;
          p.position.x = (Math.random() - 0.5) * 2.2;
        }
      });

      if (this.heroRenderer && this.heroCamera) {
        this.heroModels.forEach((model, i) => {
          model.rotation.y = Math.sin(t * 0.8 + i) * 0.08;
        });
        this.heroRenderer.render(this.heroScene, this.heroCamera);
      }

      if (this.confettiScene && this.confettiRenderer && this.confettiCamera) {
        this.confettiRenderer.render(this.confettiScene, this.confettiCamera);
      }

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

    document.getElementById('victory-heroes-wrap')?.classList.add('hidden');
    document.getElementById('victory-confetti')?.classList.add('hidden');

    this.particles = [];
    if (this.heroRenderer) {
      this.heroRenderer.dispose();
      this.heroRenderer = null;
    }
    if (this.confettiRenderer) {
      this.confettiRenderer.dispose();
      this.confettiRenderer = null;
    }
    this.heroScene = null;
    this.confettiScene = null;
    this.heroModels = [];
  }
}
