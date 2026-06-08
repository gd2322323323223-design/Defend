/**
 * 戰鬥視覺特效 — 傷害數字、投射物、受擊閃光
 */

import * as THREE from 'three';

export class BattleVFX {
  constructor(scene) {
    this.scene = scene;
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
      const idx = this.active.indexOf(obj);
      if (idx >= 0) this.active.splice(idx, 1);
    }, ttl);
  }

  showDamageNumber(model, text, color = '#ff3333') {
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
    sprite.position.set(pos.x, pos.y + 2.2, pos.z);
    sprite.scale.set(1.8, 0.9, 1);
    this.scene.add(sprite);
    this._track(sprite);

    const startY = sprite.position.y;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t > 1.2) return;
      sprite.position.y = startY + t * 1.5;
      sprite.material.opacity = 1 - t / 1.2;
      requestAnimationFrame(tick);
    };
    tick();
  }

  spawnProjectile(fromModel, toModel, color = 0xff6b35) {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    fromModel.getWorldPosition(from);
    toModel.getWorldPosition(to);
    from.y += 1.4;
    to.y += 1.4;

    const geo = new THREE.SphereGeometry(0.12, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const ball = new THREE.Mesh(geo, mat);
    ball.renderOrder = 998;
    ball.position.copy(from);
    this.scene.add(ball);
    this._track(ball, 800);

    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / 400, 1);
      ball.position.lerpVectors(from, to, t);
      if (t < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  spawnHitFlash(model, color = 0xff4444) {
    const pos = new THREE.Vector3();
    model.getWorldPosition(pos);
    const geo = new THREE.RingGeometry(0.3, 0.8, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.renderOrder = 997;
    ring.position.set(pos.x, pos.y + 1.2, pos.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this._track(ring, 500);

    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 500;
      if (t >= 1) return;
      ring.scale.setScalar(1 + t * 2);
      mat.opacity = 0.85 * (1 - t);
      requestAnimationFrame(tick);
    };
    tick();
  }

  spawnShieldFlash(model) {
    this.spawnHitFlash(model, 0x4fc3f7);
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
