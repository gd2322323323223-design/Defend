/**
 * Three.js 3D 場景模組（含資源快取與預載）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/addons/utils/SkeletonUtils.js';
import { EquipmentManager } from './equipment.js';
import { BattleVFX, delay } from './vfx.js';
import {
  ANIMATION_FILES,
  ANIM_MAP,
  BATTLE_FORMATION,
  PRELOAD_MODELS,
} from './models-config.js';

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.equipmentManager = new EquipmentManager();
    this.gltfCache = new Map();
    this.animClips = { hero: null, enemy: null };
    this.animations = {};
    this.models = {};
    this.heroSlots = {};
    this.heroIds = [];
    this.isBattleLayout = false;
    this._init();
  }

  setBattleLayout(isBattle) {
    this.isBattleLayout = isBattle;
    if (isBattle) this._applyBattleCamera();
    this._onResize();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12182b);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this._applyBattleCamera();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.85));

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    keyLight.position.set(2, 8, 5);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6688ff, 0.55);
    fillLight.position.set(-4, 4, 2);
    this.scene.add(fillLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({ color: 0x1e2438, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.renderOrder = 0;
    this.scene.add(ground);

    this.vfx = new BattleVFX(this.scene);
    this.clock = new THREE.Clock();
    this._animate();
    window.addEventListener('resize', () => this._onResize());

    this.preloadEssentials();
  }

  /** 背景預載動畫與常用模型 */
  preloadEssentials() {
    Promise.all([
      this._loadAnimClips('hero'),
      this._loadAnimClips('enemy'),
      ...PRELOAD_MODELS.map((p) => this._fetchGLTF(p)),
    ]).catch((err) => console.warn('預載資源時發生錯誤', err));
  }

  _applyBattleCamera() {
    this.camera.position.set(0, 1.6, 5.5);
    this.camera.lookAt(0, 1.1, 0);
  }

  async _fetchGLTF(path) {
    if (this.gltfCache.has(path)) return this.gltfCache.get(path);
    const gltf = await this.loader.loadAsync(path);
    this.gltfCache.set(path, gltf);
    return gltf;
  }

  _elevateModel(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        child.renderOrder = 10;
        if (child.material) {
          child.material.depthWrite = true;
          child.material.fog = false;
        }
      }
    });
  }

  async _loadAnimClips(type) {
    if (this.animClips[type]) return this.animClips[type];
    try {
      const gltf = await this.loader.loadAsync(ANIMATION_FILES[type]);
      this.animClips[type] = gltf.animations;
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
      this._placeEnemy();
      this._playAnimation('enemy', 'idle', { loop: true });
    }
    return model;
  }

  async loadHero(classId, path, slotKey = 'solo', defaultEquipment = null) {
    const model = await this._loadModel(path, classId, 'hero');
    if (model) {
      this.heroSlots[classId] = slotKey;
      this._placeHero(classId, slotKey);
      this._playAnimation(classId, 'idle', { loop: true });
      if (!this.heroIds.includes(classId)) this.heroIds.push(classId);

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

  _placeEnemy() {
    const m = this.models.enemy;
    if (!m) return;
    const { x, y, z, rotY } = BATTLE_FORMATION.enemy;
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.scale.setScalar(1.05);
  }

  _placeHero(classId, slotKey) {
    const m = this.models[classId];
    const slot = BATTLE_FORMATION[slotKey] || BATTLE_FORMATION.solo;
    if (!m) return;
    m.position.set(slot.x, slot.y, slot.z);
    m.rotation.y = slot.rotY;
    m.scale.setScalar(1);
  }

  layoutBattleFormation(formationSlots) {
    this._placeEnemy();
    formationSlots.forEach(({ classId, slot }) => {
      this.heroSlots[classId] = slot;
      this._placeHero(classId, slot);
    });
  }

  getFrontHeroModel() {
    const frontId = Object.entries(this.heroSlots).find(([, s]) => s === 'front')?.[0]
      || Object.entries(this.heroSlots).find(([, s]) => s === 'solo')?.[0]
      || this.heroIds[0];
    return frontId ? this.models[frontId] : null;
  }

  async _loadModel(path, key, animType) {
    if (this.models[key]) return this.models[key];

    try {
      const [gltf, clips] = await Promise.all([
        this._fetchGLTF(path),
        this._loadAnimClips(animType),
      ]);

      const model = SkeletonUtils.clone(gltf.scene);
      this._elevateModel(model);

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
    const body = new THREE.Mesh(
      isEnemy ? new THREE.CapsuleGeometry(0.4, 1.2, 8, 16) : new THREE.CapsuleGeometry(0.35, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({
        color: isEnemy ? 0xeeeeee : (key === 'mage' ? 0x7c4dff : 0x4fc3f7),
        roughness: 0.6,
        fog: false,
      }),
    );
    body.position.y = 1;
    body.renderOrder = 10;
    group.add(body);
    return group;
  }

  _playAnimation(modelKey, actionName, { loop = false } = {}) {
    const anim = this.animations[modelKey];
    if (!anim || !anim.clips.length) return Promise.resolve();

    const clip = this._findClip(anim.clips, actionName);
    if (!clip) return Promise.resolve();

    return new Promise((resolve) => {
      const action = anim.mixer.clipAction(clip);
      action.reset().fadeIn(0.1).play();

      if (loop) {
        action.setLoop(THREE.LoopRepeat);
        resolve();
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        setTimeout(() => {
          this._playAnimation(modelKey, 'idle', { loop: true });
          resolve();
        }, 550);
      }
    });
  }

  playHeroAction(classId, action) {
    return this._playAnimation(classId, action, { loop: false });
  }

  /** 逐次攻擊 Boss，每次顯示獨立傷害數字 */
  async playHeroAttackHits(heroId, hits) {
    const hero = this.models[heroId];
    const enemy = this.models.enemy;
    if (!hero || !enemy || !hits.length) return;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const action = heroId === 'mage' ? 'cast' : 'attack';
      this._playAnimation(heroId, action, { loop: false });
      this.vfx.spawnProjectile(hero, enemy, hit.crit ? 0xffd54f : 0xff6b35);
      await delay(220);
      this.vfx.spawnHitFlash(enemy, hit.crit ? 0xffd54f : 0xff4444);
      const label = hit.crit ? `-${hit.amount} 暴擊!` : `-${hit.amount}`;
      this.vfx.showDamageNumber(enemy, label, hit.crit ? '#ffd54f' : '#ff3333', i);
      this._shakeModel(enemy);
      await delay(180);
    }
  }

  /** 逐次防禦，每次 +1 盾 */
  async playHeroShieldHits(heroId, count) {
    const hero = this.models[heroId];
    if (!hero || count <= 0) return;

    for (let i = 0; i < count; i++) {
      this._playAnimation(heroId, 'block', { loop: false });
      this.vfx.spawnShieldFlash(hero);
      this.vfx.showDamageNumber(hero, '+1 盾', '#4fc3f7', i);
      await delay(200);
    }
  }

  /** Boss 一次反擊，逐次顯示 -1 於隊伍位置 */
  async playBossAttackTeam(totalDamage) {
    if (totalDamage <= 0) return;
    const enemy = this.models.enemy;
    const teamTarget = this.getFrontHeroModel() || this.models[this.heroIds[0]];
    if (!enemy || !teamTarget) return;

    this._playAnimation('enemy', 'attack', { loop: false });
    await delay(200);

    for (let i = 0; i < totalDamage; i++) {
      this.vfx.spawnProjectile(enemy, teamTarget, 0x88ccff);
      await delay(180);
      this.vfx.spawnHitFlash(teamTarget, 0xef5350);
      this.vfx.showDamageNumber(teamTarget, '-1', '#ef5350', i);
      await delay(120);
    }

    this._shakeModel(teamTarget);
    this.heroIds.forEach((id) => this._playAnimation(id, 'hit', { loop: false }));
  }

  playEnemyDeath() {
    return this._playAnimation('enemy', 'death', { loop: false });
  }

  _shakeModel(model) {
    if (!model) return;
    const ox = model.position.x;
    const oz = model.position.z;
    let frame = 0;
    const shake = () => {
      if (frame >= 10) {
        model.position.x = ox;
        model.position.z = oz;
        return;
      }
      model.position.x = ox + (Math.random() - 0.5) * 0.15;
      model.position.z = oz + (Math.random() - 0.5) * 0.08;
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
    this.heroIds = [];
    this.heroSlots = {};
    this.equipmentManager.detachAll();
    this.vfx.clear();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = this.isBattleLayout ? window.innerHeight * 0.5 : window.innerHeight;
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
