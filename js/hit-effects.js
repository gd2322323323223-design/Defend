/**
 * 受擊特效 — 參考 HitEffect/StylizedHitFX vfx_hit_01、vfx_hit_02
 * （Glow 光暈 + 衝擊核心 + 四芒星 + 放射條紋）
 */

import * as THREE from 'three';

const HIT_PRESETS = {
  hit01: {
    core: 0xff6b35,
    glow: 0xff8844,
    star: 0xffd54f,
    streak: 0xffaa66,
    coreScale: 1,
  },
  hit02: {
    core: 0xffd54f,
    glow: 0xffeb3b,
    star: 0xffffff,
    streak: 0xffcc00,
    coreScale: 1.35,
  },
  boss: {
    core: 0x88ccff,
    glow: 0x64b5f6,
    star: 0xe3f2fd,
    streak: 0x90caf9,
    coreScale: 1.2,
  },
  shield: {
    core: 0x4fc3f7,
    glow: 0x29b6f6,
    star: 0xb3e5fc,
    streak: 0x81d4fa,
    coreScale: 0.9,
  },
};

export function spawnStylizedHit(scene, trackFn, model, presetKey = 'hit01') {
  const preset = HIT_PRESETS[presetKey] || HIT_PRESETS.hit01;
  const pos = new THREE.Vector3();
  model.getWorldPosition(pos);
  pos.y += 1.2;

  const group = new THREE.Group();
  group.position.copy(pos);
  group.renderOrder = 996;
  scene.add(group);
  trackFn(group, 650);

  const coreGeo = new THREE.SphereGeometry(0.18 * preset.coreScale, 10, 10);
  const coreMat = new THREE.MeshBasicMaterial({
    color: preset.core,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const glowGeo = new THREE.SphereGeometry(0.35 * preset.coreScale, 12, 12);
  const glowMat = new THREE.MeshBasicMaterial({
    color: preset.glow,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  for (let i = 0; i < 4; i++) {
    const star = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5 * preset.coreScale, 0.5 * preset.coreScale),
      new THREE.MeshBasicMaterial({
        color: preset.star,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    star.rotation.z = (Math.PI / 4) + (i * Math.PI / 2);
    group.add(star);
  }

  for (let i = 0; i < 8; i++) {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.7 * preset.coreScale),
      new THREE.MeshBasicMaterial({
        color: preset.streak,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    streak.rotation.z = (i / 8) * Math.PI * 2;
    streak.position.y = 0.15;
    group.add(streak);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.55 * preset.coreScale, 16),
    new THREE.MeshBasicMaterial({
      color: preset.glow,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const start = performance.now();
  const duration = 420;
  const tick = () => {
    const t = Math.min((performance.now() - start) / duration, 1);
    const ease = 1 - (1 - t) ** 3;
    const fade = 1 - t;

    core.scale.setScalar(1 + ease * 1.2);
    coreMat.opacity = 0.95 * fade;
    glow.scale.setScalar(1 + ease * 2.5);
    glowMat.opacity = 0.55 * fade;
    ring.scale.setScalar(1 + ease * 2.8);
    ring.material.opacity = 0.8 * fade;

    group.children.forEach((child) => {
      if (child.geometry?.type === 'PlaneGeometry' && child !== ring) {
        child.material.opacity = (child.geometry.parameters.width > 0.2 ? 0.9 : 0.85) * fade;
        if (child.geometry.parameters.height > 0.5) {
          child.scale.y = 1 + ease * 0.8;
        }
      }
    });

    if (t < 1) requestAnimationFrame(tick);
  };
  tick();
}
