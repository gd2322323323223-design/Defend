/**
 * Three.js 3D 場景模組
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EquipmentManager } from './equipment.js';
import { ANIMATION_FILES, ANIM_MAP } from './models-config.js';

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.equipmentManager = new EquipmentManager();
    this.animClips = { hero: null, enemy: null };
    this.animations = {};
    this.models = {};
    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.scene.fog = new THREE.Fog(0x0a0e1a, 10, 30);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 2.5, 6);
    this.camera.lookAt(0, 1.2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.add(new THREE.AmbientLight(0x404060, 0.6));

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(3, 6, 4);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x6688ff, 0.4);
    rimLight.position.set(-3, 2, -2);
    this.scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(8, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.clock = new THREE.Clock();
    this._animate();
    window.addEventListener('resize', () => this._onResize());
  }

  async _loadAnimClips(type) {
    if (this.animClips[type]) return this.animClips[type];

    const files = ANIMATION_FILES[type];
    try {
      const [general, movement] = await Promise.all([
        this.loader.loadAsync(files.general),
        this.loader.loadAsync(files.movement),
      ]);
      this.animClips[type] = [...general.animations, ...movement.animations];
    } catch (err) {
      console.warn(`動畫載入失敗 (${type}):`, err);
      this.animClips[type] = [];
    }
    return this.animClips[type];
  }

  _findClip(clips, actionName) {
    const candidates = ANIM_MAP[actionName] || [actionName];
    for (const name of candidates) {
      const clip = clips.find((a) => a.name === name);
      if (clip) return clip;
    }
    return clips.find((a) => a.name.toLowerCase().includes(actionName.toLowerCase()));
  }

  async loadEnemy(path) {
    const model = await this._loadModel(path, 'enemy', 'enemy');
    if (model) {
      model.position.set(0, 0, -2);
      model.scale.setScalar(1);
      this._playAnimation('enemy', 'idle', { loop: true });
    }
    return model;
  }

  async loadHero(classId, path, side = 'left', defaultEquipment = null) {
    const x = side === 'left' ? -2 : 2;
    const model = await this._loadModel(path, classId, 'hero');
    if (model) {
      model.position.set(x, 0, 1.5);
      model.rotation.y = side === 'left' ? 0.4 : -0.4;
      model.scale.setScalar(1);
      this._playAnimation(classId, 'idle', { loop: true });

      if (defaultEquipment) {
        await this.equipmentManager.attachEquipment(
          model,
          defaultEquipment,
          `${classId}_${defaultEquipment}`,
        );
      }
    }
    return model;
  }

  async _loadModel(path, key, animType) {
    if (this.models[key]) return this.models[key];

    try {
      const [gltf, clips] = await Promise.all([
        this.loader.loadAsync(path),
        this._loadAnimClips(animType),
      ]);

      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const mixer = new THREE.AnimationMixer(model);
      this.animations[key] = { mixer, clips };
      this.scene.add(model);
      this.models[key] = model;
      return model;
    } catch (err) {
      console.warn(`模型載入失敗: ${path}`, err);
      const placeholder = this._createPlaceholder(key);
      this.scene.add(placeholder);
      this.models[key] = placeholder;
      return placeholder;
    }
  }

  _createPlaceholder(key) {
    const group = new THREE.Group();
    const isEnemy = key === 'enemy';
    const bodyGeo = isEnemy
      ? new THREE.CapsuleGeometry(0.4, 1.2, 8, 16)
      : new THREE.CapsuleGeometry(0.35, 1.0, 8, 16);
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({
        color: isEnemy ? 0xeeeeee : (key === 'mage' ? 0x7c4dff : 0x4fc3f7),
        roughness: 0.6,
      }),
    );
    body.position.y = 1;
    group.add(body);
    return group;
  }

  _playAnimation(modelKey, actionName, { loop = false } = {}) {
    const anim = this.animations[modelKey];
    if (!anim || !anim.clips.length) return;

    const clip = this._findClip(anim.clips, actionName);
    if (!clip) return;

    anim.mixer.stopAllAction();
    const action = anim.mixer.clipAction(clip);
    action.reset().fadeIn(0.2).play();

    if (loop) {
      action.setLoop(THREE.LoopRepeat);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;

      const onFinished = (e) => {
        if (e.action !== action) return;
        anim.mixer.removeEventListener('finished', onFinished);
        this._playAnimation(modelKey, 'idle', { loop: true });
      };
      anim.mixer.addEventListener('finished', onFinished);
    }
  }

  playHeroAction(classId, action) {
    this._playAnimation(classId, action, { loop: false });
  }

  playEnemyHit() {
    this._playAnimation('enemy', 'hit', { loop: false });
    this.shakeEnemy();
  }

  playEnemyDeath() {
    this._playAnimation('enemy', 'death', { loop: false });
  }

  shakeEnemy() {
    const enemy = this.models.enemy;
    if (!enemy) return;

    const originalX = enemy.position.x;
    let frame = 0;
    const shake = () => {
      if (frame >= 20) {
        enemy.position.x = originalX;
        return;
      }
      enemy.position.x = originalX + (Math.random() - 0.5) * 0.3;
      frame++;
      requestAnimationFrame(shake);
    };
    shake();
  }

  async unlockEquipment(heroClassId) {
    const hero = this.models[heroClassId];
    if (!hero) return;
    await this.equipmentManager.attachEquipment(
      hero,
      'arrow_crossbow',
      `${heroClassId}_arrow_crossbow`,
    );
  }

  clearScene() {
    Object.values(this.models).forEach((m) => this.scene.remove(m));
    this.models = {};
    this.animations = {};
    this.equipmentManager.detachAll();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const delta = this.clock.getDelta();
    Object.values(this.animations).forEach(({ mixer }) => mixer.update(delta));
    this.renderer.render(this.scene, this.camera);
  }
}
