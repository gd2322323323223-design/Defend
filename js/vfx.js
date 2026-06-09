/**
 * 戰鬥視覺特效 — 傷害數字、投射物、受擊閃光
 */

import * as THREE from 'three';
import {
  spawnStylizedHit,
  getHitPresetForClass,
  getHitPresetForBoss,
} from '@/hit-effects.js';
import { spawnSpriteBillboard, SPLASH04 } from '@/sprite-billboard.js';

const CLASS_PROJECTILE = {
  knight: { color: 0x4fc3f7, glow: 0x29b6f6, size: 0.14, speed: 300, shape: 'shield' },
  warrior: { color: 0xff5722, glow: 0xff8a65, size: 0.12, speed: 240, shape: 'slash' },
  mage: { color: 0xab47bc, glow: 0xce93d8, size: 0.16, speed: 320, shape: 'orb' },
  assassin: { color: 0x43a047, glow: 0x66bb6a, size: 0.08, speed: 180, shape: 'dart' },
  rage_hero: { color: 0xffd54f, glow: 0xff6b35, size: 0.14, speed: 260, shape: 'slash' },
};

const BOSS_PROJECTILE = {
  normal: { color: 0x64b5f6, glow: 0x90caf9, size: 0.16, speed: 520 },
  ultimate: { color: 0xff3d00, glow: 0xffab40, size: 0.26, speed: 620 },
  lifesteal: { color: 0x9c27b0, glow: 0x66bb6a, size: 0.18, speed: 560 },
};

export class BattleVFX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.active = [];
  }

  _track(obj, ttl = 1200) {
    this.active.push(obj);
    setTimeout(() => {
      this.scene.remove(obj);
      if (obj.material) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
      obj.traverse?.((child) => {
        if (child.material) {
          child.material.map?.dispose();
          child.material.dispose();
        }
        child.geometry?.dispose();
      });
      const idx = this.active.indexOf(obj);
      if (idx >= 0) this.active.splice(idx, 1);
    }, ttl);
  }

  showDamageNumber(model, text, color = '#ff3333', stackIndex = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 52px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.strokeText(text, 80, 40);
    ctx.fillStyle = color;
    ctx.fillText(text, 80, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 999;

    const pos = new THREE.Vector3();
    model.getWorldPosition(pos);
    const xOff = (stackIndex % 3 - 1) * 0.35;
    const yOff = 2.2 + Math.floor(stackIndex / 3) * 0.45;
    sprite.position.set(pos.x + xOff, pos.y + yOff, pos.z);
    sprite.scale.set(1.6, 0.8, 1);
    this.scene.add(sprite);
    this._track(sprite);

    const startY = sprite.position.y;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t > 1) return;
      sprite.position.y = startY + t * 1.4;
      sprite.material.opacity = 1 - t;
      requestAnimationFrame(tick);
    };
    tick();
  }

  _buildProjectileMesh(cfg, crit = false) {
    const group = new THREE.Group();
    const size = cfg.size * (crit ? 1.35 : 1);

    if (cfg.shape === 'slash') {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(size * 2.2, size * 0.5, size * 0.5),
        new THREE.MeshBasicMaterial({ color: cfg.color, depthTest: false }),
      );
      blade.rotation.z = Math.PI / 4;
      group.add(blade);
    } else if (cfg.shape === 'dart') {
      const dart = new THREE.Mesh(
        new THREE.ConeGeometry(size, size * 3, 6),
        new THREE.MeshBasicMaterial({ color: cfg.color, depthTest: false }),
      );
      dart.rotation.x = Math.PI / 2;
      group.add(dart);
    } else if (cfg.shape === 'shield') {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(size, size, size * 0.4, 12),
        new THREE.MeshBasicMaterial({ color: cfg.color, depthTest: false }),
      );
      disc.rotation.x = Math.PI / 2;
      group.add(disc);
    } else {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 8),
        new THREE.MeshBasicMaterial({ color: cfg.color, depthTest: false }),
      );
      group.add(orb);
    }

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.8, 8, 8),
      new THREE.MeshBasicMaterial({
        color: cfg.glow,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
      }),
    );
    group.add(glow);

    return group;
  }

  spawnClassProjectile(fromModel, toModel, classId, crit = false) {
    const cfg = { ...CLASS_PROJECTILE[classId] || CLASS_PROJECTILE.warrior };
    if (crit) {
      cfg.color = 0xffd54f;
      cfg.glow = 0xffeb3b;
      cfg.speed = Math.round(cfg.speed * 0.85);
    }
    this._spawnProjectileMesh(fromModel, toModel, cfg);
  }

  spawnBossProjectile(fromModel, toModel, phaseType = 'normal') {
    const cfg = BOSS_PROJECTILE[phaseType] || BOSS_PROJECTILE.normal;
    this._spawnProjectileMesh(fromModel, toModel, cfg);
  }

  /** Boss 普通攻擊 — 三顆遞增大小的異色球 */
  spawnBossNormalVolley(fromModel, toModel) {
    const volley = [
      { color: 0x42a5f5, glow: 0x90caf9, size: 0.11, speed: 480 },
      { color: 0xab47bc, glow: 0xce93d8, size: 0.17, speed: 480 },
      { color: 0xff7043, glow: 0xffab40, size: 0.25, speed: 480 },
    ];
    return volley.reduce(
      (chain, cfg, i) => chain.then(() => {
        if (i > 0) return delay(180).then(() => this._spawnProjectileMeshAwait(fromModel, toModel, cfg));
        return this._spawnProjectileMeshAwait(fromModel, toModel, cfg);
      }),
      Promise.resolve(),
    );
  }

  _spawnProjectileMeshAwait(fromModel, toModel, cfg) {
    return new Promise((resolve) => {
      const from = new THREE.Vector3();
      const to = new THREE.Vector3();
      fromModel.getWorldPosition(from);
      toModel.getWorldPosition(to);
      from.y += 1.4;
      to.y += 1.4;

      const ball = this._buildProjectileMesh(cfg);
      ball.renderOrder = 998;
      ball.position.copy(from);
      this.scene.add(ball);
      this._track(ball, cfg.speed + 200);

      const start = performance.now();
      const tick = () => {
        const t = Math.min((performance.now() - start) / cfg.speed, 1);
        ball.position.lerpVectors(from, to, t);
        ball.rotation.y += 0.25;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  spawnProjectile(fromModel, toModel, color = 0xff6b35) {
    this._spawnProjectileMesh(fromModel, toModel, {
      color,
      glow: color,
      size: 0.1,
      speed: 280,
      shape: 'orb',
    });
  }

  _spawnProjectileMesh(fromModel, toModel, cfg) {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    fromModel.getWorldPosition(from);
    toModel.getWorldPosition(to);
    from.y += 1.4;
    to.y += 1.4;

    const ball = this._buildProjectileMesh(cfg);
    ball.renderOrder = 998;
    ball.position.copy(from);
    this.scene.add(ball);
    this._track(ball, cfg.speed + 200);

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / cfg.speed, 1);
      ball.position.lerpVectors(from, to, t);
      ball.rotation.y += 0.25;
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  spawnHitFlash(model, color = 0xff4444) {
    const preset = color === 0xffd54f ? 'hit02' : 'hit01';
    this.spawnStylizedHit(model, preset);
  }

  spawnClassHit(model, classId, crit = false) {
    this.spawnStylizedHit(model, getHitPresetForClass(classId, crit));
  }

  /** 刺客噴濺序列圖 — 雙人模式 Boss 受擊 */
  spawnAssassinSplash(model, crit = false) {
    return spawnSpriteBillboard({
      scene: this.scene,
      camera: this.camera,
      trackFn: (obj, ttl) => this._track(obj, ttl),
      model,
      config: SPLASH04,
      scale: crit ? SPLASH04.scale * 1.35 : SPLASH04.scale,
    });
  }

  spawnBossHit(model, phaseType = 'normal') {
    this.spawnStylizedHit(model, getHitPresetForBoss(phaseType));
  }

  /** StylizedHitFX 風格受擊特效 */
  spawnStylizedHit(model, preset = 'hit01') {
    spawnStylizedHit(this.scene, (obj, ttl) => this._track(obj, ttl), model, preset);
  }

  spawnShieldFlash(model) {
    this.spawnStylizedHit(model, 'shield');
  }

  /** Boss 蓄力 — 腳下光環 */
  spawnGroundGlow(model, color = 0xff6b35, duration = 1400) {
    const pos = new THREE.Vector3();
    model.getWorldPosition(pos);
    pos.y += 0.06;

    const group = new THREE.Group();
    group.position.copy(pos);
    group.renderOrder = 995;
    this.scene.add(group);
    this._track(group, duration + 200);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.55, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.1, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    outer.rotation.x = -Math.PI / 2;
    group.add(outer);

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      const pulse = 1 + Math.sin(t * Math.PI * 6) * 0.12;
      ring.scale.setScalar(0.8 + t * 1.6 * pulse);
      outer.scale.setScalar(0.6 + t * 2.2 * pulse);
      ring.material.opacity = 0.85 * (1 - t * 0.35);
      outer.material.opacity = 0.45 * (1 - t * 0.5);
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  /** Boss 蓄力 — 身上光暈 */
  spawnBossChargeAura(model, color = 0xffab40, duration = 1200) {
    const pos = new THREE.Vector3();
    model.getWorldPosition(pos);
    pos.y += 0.9;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 14, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
      }),
    );
    glow.position.copy(pos);
    glow.renderOrder = 994;
    this.scene.add(glow);
    this._track(glow, duration + 200);

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      const s = 1 + t * 1.8;
      glow.scale.setScalar(s);
      glow.material.opacity = 0.5 * (1 - t);
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  /** 吸血撕咬 — 能量汲取光束 */
  spawnDrainBeam(fromModel, toModel, color = 0x9c27b0, duration = 1100) {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    fromModel.getWorldPosition(from);
    toModel.getWorldPosition(to);
    from.y += 1.3;
    to.y += 1.2;

    const dist = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const up = new THREE.Vector3(0, 1, 0);

    const group = new THREE.Group();
    group.renderOrder = 997;
    this.scene.add(group);
    this._track(group, duration + 300);

    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 + i * 0.02, 0.06 + i * 0.02, dist, 8),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0x66bb6a : color,
          transparent: true,
          opacity: 0.75 - i * 0.15,
          depthTest: false,
        }),
      );
      beam.position.copy(mid);
      beam.quaternion.setFromUnitVectors(up, dir);
      group.add(beam);
    }

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x66bb6a,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    group.add(orb);

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      orb.position.lerpVectors(from, to, t);
      group.children.forEach((child) => {
        if (child.material) child.material.opacity *= 0.992;
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  /** 吸血 — 目標身上散開的紫綠粒子 */
  spawnLifestealParticles(model, duration = 900) {
    const pos = new THREE.Vector3();
    model.getWorldPosition(pos);
    pos.y += 1.1;

    const group = new THREE.Group();
    group.position.copy(pos);
    group.renderOrder = 996;
    this.scene.add(group);
    this._track(group, duration + 200);

    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x9c27b0 : 0x66bb6a,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        }),
      );
      const angle = (i / 10) * Math.PI * 2;
      p.userData.vel = new THREE.Vector3(
        Math.cos(angle) * 0.02,
        0.03 + Math.random() * 0.02,
        Math.sin(angle) * 0.02,
      );
      group.add(p);
    }

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      group.children.forEach((p) => {
        p.position.add(p.userData.vel);
        p.material.opacity = 0.85 * (1 - t);
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  clear() {
    this.active.forEach((obj) => {
      this.scene.remove(obj);
      obj.material?.map?.dispose();
      obj.material?.dispose();
    });
    this.active = [];
  }
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
