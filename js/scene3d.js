/**
 * Three.js 3D 場景模組
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EquipmentManager } from './equipment.js';
import { BattleVFX, delay } from './vfx.js';
import { ANIMATION_FILES, ANIM_MAP, BATTLE_FORMATION } from './models-config.js';

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.equipmentManager = new EquipmentManager();
    this.animClips = { hero: null, enemy: null };
    this.animations = {};
    this.models = {};
    this.heroIds = [];
    this.isBattleLayout = false;
    this._init();
  }

  setBattleLayout(isBattle) {
    this.isBattleLayout = isBattle;
    if (isBattle) {
      this._applyBattleCamera();
    }
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

    const rimLight = new THREE.DirectionalLight(0xffaa66, 0.45);
    rimLight.position.set(0, 3, -5);
    this.scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({ color: 0x1e2438, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.renderOrder = 0;
    this.ground = ground;
    this.scene.add(ground);

    this.vfx = new BattleVFX(this.scene);
    this.clock = new THREE.Clock();
    this._animate();
    window.addEventListener('resize', () => this._onResize());
  }

  _applyBattleCamera() {
    this.camera.position.set(0, 1.6, 5.5);
    this.camera.lookAt(0, 1.1, 0);
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
      this._placeEnemy();
      this._playAnimation('enemy', 'idle', { loop: true });
    }
    return model;
  }

  async loadHero(classId, path, slotIndex = 0, defaultEquipment = null) {
    const model = await this._loadModel(path, classId, 'hero');
    if (model) {
      this._placeHero(classId, slotIndex);
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

  _placeHero(classId, slotIndex) {
    const m = this.models[classId];
    const slot = BATTLE_FORMATION.heroSlots[slotIndex] || BATTLE_FORMATION.heroSlots[0];
    if (!m || !slot) return;
    m.position.set(slot.x, slot.y, slot.z);
    m.rotation.y = slot.rotY;
    m.scale.setScalar(1);
  }

  layoutBattleFormation(heroClassIds) {
    this._placeEnemy();
    heroClassIds.forEach((id, i) => this._placeHero(id, i));
  }

  async _loadModel(path, key, animType) {
    if (this.models[key]) return this.models[key];

    try {
      const [gltf, clips] = await Promise.all([
        this.loader.loadAsync(path),
        this._loadAnimClips(animType),
      ]);

      const model = gltf.scene;
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
      anim.mixer.stopAllAction();
      const action = anim.mixer.clipAction(clip);
      action.reset().fadeIn(0.15).play();

      if (loop) {
        action.setLoop(THREE.LoopRepeat);
        action.clampWhenFinished = false;
        resolve();
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        const onFinished = (e) => {
          if (e.action !== action) return;
          anim.mixer.removeEventListener('finished', onFinished);
          this._playAnimation(modelKey, 'idle', { loop: true });
          resolve();
        };
        anim.mixer.addEventListener('finished', onFinished);
        setTimeout(resolve, 900);
      }
    });
  }

  playHeroAction(classId, action) {
    return this._playAnimation(classId, action, { loop: false });
  }

  async playHeroAttackBoss(heroId, damage) {
    if (damage <= 0) return;
    const hero = this.models[heroId];
    const enemy = this.models.enemy;
    if (!hero || !enemy) return;

    await this._playAnimation(heroId, 'attack', { loop: false });
    this.vfx.spawnProjectile(hero, enemy, 0xff6b35);
    await delay(420);
    this.vfx.spawnHitFlash(enemy, 0xff4444);
    this.vfx.showDamageNumber(enemy, `-${damage}`, '#ff3333');
    await this._playAnimation('enemy', 'hit', { loop: false });
    this._shakeModel(enemy);
  }

  async playHeroDefend(heroId, shieldGain) {
    if (shieldGain <= 0) return;
    const hero = this.models[heroId];
    if (!hero) return;

    await this._playAnimation(heroId, 'block', { loop: false });
    this.vfx.spawnShieldFlash(hero);
    this.vfx.showDamageNumber(hero, `+${shieldGain} 盾`, '#4fc3f7');
  }

  async playBossAttackPlayer(targetHeroId, damage) {
    if (damage <= 0) return;
    const enemy = this.models.enemy;
    const hero = this.models[targetHeroId];
    if (!enemy || !hero) return;

    await this._playAnimation('enemy', 'attack', { loop: false });
    this.vfx.spawnProjectile(enemy, hero, 0x88ccff);
    await delay(420);
    this.vfx.spawnHitFlash(hero, 0xef5350);
    this.vfx.showDamageNumber(hero, `-${damage}`, '#ef5350');
    await this._playAnimation(targetHeroId, 'hit', { loop: false });
    this._shakeModel(hero);
  }

  playEnemyHit() {
    this._playAnimation('enemy', 'hit', { loop: false });
    this._shakeModel(this.models.enemy);
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
      if (frame >= 16) {
        model.position.x = ox;
        model.position.z = oz;
        return;
      }
      model.position.x = ox + (Math.random() - 0.5) * 0.2;
      model.position.z = oz + (Math.random() - 0.5) * 0.1;
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
