/**
 * Three.js 3D 場景模組（含資源快取與預載）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
import { EquipmentManager } from '@/equipment.js';
import { BattleVFX, delay } from '@/vfx.js';
import { formatCombatNumber } from '@/combat.js';
import {
  ANIMATION_FILES,
  ANIM_MAP,
  BATTLE_FORMATION,
  PRELOAD_MODELS,
} from '@/models-config.js';

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
    this.showBossHp = false;
    this.heroLabelData = [];
    this._init();
  }

  setBattleLayout(isBattle) {
    this.isBattleLayout = isBattle;
    this.showBossHp = isBattle;
    this._toggleFloatingUI(isBattle);
    if (isBattle) this._applyBattleCamera();
    this._onResize();
  }

  setHeroLabels(labels) {
    this.heroLabelData = labels;
  }

  _toggleFloatingUI(visible) {
    ['boss-head-stack', 'team-hp-floating'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !visible);
    });
    [0, 1].forEach((i) => {
      const el = document.getElementById(`hero-label-${i}`);
      if (el) el.classList.toggle('hidden', !visible);
    });
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
    this.camera.position.set(0, 1.75, 6.0);
    this.camera.lookAt(0, 0.95, 0);
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
    const { x, y, z, rotY, scale } = BATTLE_FORMATION.enemy;
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.scale.setScalar(scale ?? 1);
  }

  _placeHero(classId, slotKey) {
    const m = this.models[classId];
    const slot = BATTLE_FORMATION[slotKey] || BATTLE_FORMATION.solo;
    if (!m) return;
    m.position.set(slot.x, slot.y, slot.z);
    m.rotation.y = slot.rotY;
    m.scale.setScalar(slot.scale ?? 1);
  }

  layoutBattleFormation(formationSlots) {
    this._placeEnemy();
    formationSlots.forEach(({ classId, slot }) => {
      this.heroSlots[classId] = slot;
      this._placeHero(classId, slot);
    });
  }

  getFrontHeroModel() {
    const frontId = Object.entries(this.heroSlots).find(([, s]) =>
      s === 'front' || s === 'player1' || s === 'solo')?.[0]
      || this.heroIds[0];
    return frontId ? this.models[frontId] : null;
  }

  _projectToScreen(worldPos) {
    const pos = worldPos.clone();
    pos.project(this.camera);
    if (pos.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (pos.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-pos.y * 0.5 + 0.5) * rect.height,
    };
  }

  _placeFloatingEl(el, screenPos) {
    if (!el || !screenPos) {
      if (el) el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
  }

  async _loadModel(path, key, animType) {
    if (this.models[key]) return this.models[key];

    try {
      const [gltf, clips] = await Promise.all([
        this._fetchGLTF(path),
        this._loadAnimClips(animType),
      ]);

      const model = cloneSkinnedModel(gltf.scene);
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

  /** 單次攻擊 Boss，顯示聚合傷害數字 */
  async playHeroAttack(heroId, damage, crit = false) {
    const hero = this.models[heroId];
    const enemy = this.models.enemy;
    if (!hero || !enemy || damage <= 0) return;

    const action = heroId === 'mage' ? 'cast' : 'attack';
    this._playAnimation(heroId, action, { loop: false });
    this.vfx.spawnClassProjectile(hero, enemy, heroId, crit);
    await delay(220);
    this.vfx.spawnClassHit(enemy, heroId, crit);
    const label = crit ? `-${formatCombatNumber(damage)} 暴擊!` : `-${formatCombatNumber(damage)}`;
    this.vfx.showDamageNumber(enemy, label, crit ? '#ffd54f' : '#ff3333', 0);
    this._shakeModel(enemy);
    await delay(300);
  }

  /** 單次防禦，顯示聚合護盾數值 */
  async playHeroShield(heroId, shield) {
    const hero = this.models[heroId];
    if (!hero || shield <= 0) return;

    this._playAnimation(heroId, 'block', { loop: false });
    this.vfx.spawnShieldFlash(hero);
    this.vfx.showDamageNumber(hero, `+${Math.round(shield)} 盾`, '#4fc3f7', 0);
    await delay(400);
  }

  /** Boss 吸血回復 */
  async playBossHeal(amount) {
    const enemy = this.models.enemy;
    if (!enemy || amount <= 0) return;

    this.vfx.spawnBossChargeAura(enemy, 0x66bb6a, 900);
    this.vfx.showDamageNumber(enemy, `+${Math.round(amount)}`, '#81c784', 0);
    await delay(900);
  }

  /** 逐次攻擊 Boss，每次顯示獨立傷害數字 */
  async playHeroAttackHits(heroId, hits, onHit) {
    const hero = this.models[heroId];
    const enemy = this.models.enemy;
    if (!hero || !enemy || !hits.length) return;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const action = heroId === 'mage' ? 'cast' : 'attack';
      this._playAnimation(heroId, action, { loop: false });
      this.vfx.spawnClassProjectile(hero, enemy, heroId, hit.crit);
      await delay(220);
      this.vfx.spawnClassHit(enemy, heroId, hit.crit);
      const label = hit.crit
        ? `-${formatCombatNumber(hit.amount)} 暴擊!`
        : `-${formatCombatNumber(hit.amount)}`;
      this.vfx.showDamageNumber(enemy, label, hit.crit ? '#ffd54f' : '#ff3333', i);
      this._shakeModel(enemy);
      if (onHit) onHit(hit);
      await delay(180);
    }
  }

  /** 逐次防禦，每次 +1 盾 */
  async playHeroShieldHits(heroId, hits) {
    const hero = this.models[heroId];
    if (!hero || !hits.length) return;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      this._playAnimation(heroId, 'block', { loop: false });
      this.vfx.spawnShieldFlash(hero);
      this.vfx.showDamageNumber(hero, `+${formatCombatNumber(hit.amount)} 盾`, '#4fc3f7', i);
      await delay(200);
    }
  }

  async _tweenModelY(model, targetY, duration) {
    const startY = model.position.y;
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        model.position.y = startY + (targetY - startY) * ease;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  async _finishBossHit(teamTarget, totalDamage, phaseType, blocked = 0) {
    this.vfx.spawnBossHit(teamTarget, phaseType);
    if (totalDamage > 0) {
      const dmgColor = phaseType === 'ultimate' ? '#ff6e40'
        : phaseType === 'lifesteal' ? '#ab47bc' : '#ef5350';
      this.vfx.showDamageNumber(teamTarget, `-${Math.round(totalDamage)}`, dmgColor, 0);
      this._shakeModel(teamTarget);
      this.heroIds.forEach((id) => this._playAnimation(id, 'hit', { loop: false }));
    } else if (blocked > 0) {
      this.vfx.spawnShieldFlash(teamTarget);
      this.vfx.showDamageNumber(teamTarget, '格擋!', '#4fc3f7', 0);
    }
  }

  /** Boss 反擊隊伍 — 依招式類型不同動作與節奏（護盾全擋也播放） */
  async playBossAttackTeam(totalDamage, phaseType = 'normal', { blocked = 0 } = {}) {
    if (totalDamage <= 0 && blocked <= 0) return;
    const enemy = this.models.enemy;
    const teamTarget = this.getFrontHeroModel() || this.models[this.heroIds[0]];
    if (!enemy || !teamTarget) return;

    if (phaseType === 'ultimate') {
      const baseY = enemy.position.y;
      this.vfx.spawnGroundGlow(enemy, 0xff6b35, 1300);
      this.vfx.spawnBossChargeAura(enemy, 0xffab40, 1300);
      this._playAnimation('enemy', 'cast', { loop: false });
      await delay(1100);
      await this._tweenModelY(enemy, baseY + 1.0, 450);
      await delay(280);
      this.vfx.spawnBossProjectile(enemy, teamTarget, 'ultimate');
      await delay(420);
      await this._tweenModelY(enemy, baseY, 450);
      await delay(520);
      await this._finishBossHit(teamTarget, totalDamage, 'ultimate', blocked);
      await delay(780);
      return;
    }

    if (phaseType === 'lifesteal') {
      this.vfx.spawnBossChargeAura(enemy, 0x9c27b0, 900);
      this._playAnimation('enemy', 'run', { loop: false });
      await delay(650);
      this._playAnimation('enemy', 'attack', { loop: false });
      this.vfx.spawnDrainBeam(enemy, teamTarget);
      await delay(850);
      this.vfx.spawnBossProjectile(enemy, teamTarget, 'lifesteal');
      await delay(500);
      await this._finishBossHit(teamTarget, totalDamage, 'lifesteal', blocked);
      this.vfx.spawnLifestealParticles(teamTarget);
      await delay(600);
      return;
    }

    this._playAnimation('enemy', 'attack', { loop: false });
    await delay(620);
    await this.vfx.spawnBossNormalVolley(enemy, teamTarget);
    await delay(280);
    await this._finishBossHit(teamTarget, totalDamage, 'normal', blocked);
    await delay(380);
  }

  _updateFloatingUI() {
    if (!this.showBossHp) return;

    const enemy = this.models.enemy;

    if (enemy) {
      const headPos = new THREE.Vector3();
      enemy.getWorldPosition(headPos);
      headPos.y += 1.72;
      this._placeFloatingEl(
        document.getElementById('boss-head-stack'),
        this._projectToScreen(headPos),
      );
    }

    const heroModels = [];
    this.heroLabelData.forEach(({ classId, label, playerIndex }) => {
      const model = this.models[classId];
      const el = document.getElementById(`hero-label-${playerIndex}`);
      if (!model || !el) return;
      heroModels.push(model);
      el.textContent = label;
      const headPos = new THREE.Vector3();
      model.getWorldPosition(headPos);
      headPos.y += 1.42;
      this._placeFloatingEl(el, this._projectToScreen(headPos));
    });

    if (heroModels.length) {
      const teamCenter = new THREE.Vector3();
      heroModels.forEach((model) => {
        const p = new THREE.Vector3();
        model.getWorldPosition(p);
        teamCenter.add(p);
      });
      teamCenter.divideScalar(heroModels.length);
      teamCenter.y += 2.05;
      this._placeFloatingEl(
        document.getElementById('team-hp-floating'),
        this._projectToScreen(teamCenter),
      );
    }

    [0, 1].forEach((i) => {
      const hasLabel = this.heroLabelData.some((h) => h.playerIndex === i);
      const el = document.getElementById(`hero-label-${i}`);
      if (el && !hasLabel) el.classList.add('hidden');
    });
  }

  /** Boss 被擊敗 — 慢動作倒地約 5 秒 */
  async playBossDefeatSequence() {
    const anim = this.animations.enemy;
    const enemy = this.models.enemy;
    if (!anim || !enemy) {
      await delay(5000);
      return;
    }

    const clip = this._findClip(anim.clips, 'death');
    anim.mixer.timeScale = 0.32;

    if (clip) {
      const action = anim.mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.15).play();

      await new Promise((resolve) => {
        const onDone = (e) => {
          if (e.action === action) {
            anim.mixer.removeEventListener('finished', onDone);
            resolve();
          }
        };
        anim.mixer.addEventListener('finished', onDone);
        setTimeout(resolve, 5200);
      });
    } else {
      await delay(5000);
    }

    anim.mixer.timeScale = 1;
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
    if (this.showBossHp) this._updateFloatingUI();
    this.renderer.render(this.scene, this.camera);
  }
}
