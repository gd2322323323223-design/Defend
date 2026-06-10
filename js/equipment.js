/**
 * 裝備掛載模組 — 利用 Object3D.add() 將裝備掛載至骨骼節點
 */

import * as THREE from 'three';
import { loadGLTF } from '@/asset-cache.js';
import { EQUIPMENT_CATALOG, HAND_BONES } from '@/models-config.js';

export class EquipmentManager {
  constructor() {
    this.attached = new Map();
  }

  findBone(root, side = 'right') {
    const names = HAND_BONES[side] || HAND_BONES.right;

    for (const name of names) {
      const exact = root.getObjectByName(name, true);
      if (exact) return exact;
    }

    let found = null;
    root.traverse((node) => {
      if (found) return;
      const n = node.name.toLowerCase();
      for (const name of names) {
        const key = name.toLowerCase();
        if (n === key || n.endsWith(key) || n.includes(key)) {
          found = node;
          return;
        }
      }
    });
    return found;
  }

  _prepareEquipmentMesh(equipmentModel) {
    equipmentModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.renderOrder = 25;
      child.castShadow = true;
      child.material.fog = false;
      child.material.depthTest = true;
      child.material.depthWrite = true;
      if ('side' in child.material) child.material.side = THREE.DoubleSide;
    });
  }

  _refreshSkeleton(root) {
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (child.isSkinnedMesh?.skeleton) {
        child.skeleton.update();
      }
    });
  }

  async attachEquipment(heroModel, equipmentId, instanceKey = equipmentId) {
    const config = EQUIPMENT_CATALOG[equipmentId];
    if (!config) {
      console.warn(`未知裝備: ${equipmentId}`);
      return null;
    }

    if (this.attached.has(instanceKey)) {
      return this.attached.get(instanceKey);
    }

    let equipmentModel;
    try {
      const gltf = await loadGLTF(config.path);
      equipmentModel = gltf.scene.clone(true);
    } catch (err) {
      equipmentModel = this._createPlaceholderEquipment();
      console.warn(`裝備模型載入失敗，使用佔位符: ${config.path}`, err);
    }

    this._prepareEquipmentMesh(equipmentModel);

    const attachNode = this.findBone(heroModel, config.attachSide);

    if (attachNode) {
      const { offset, rotation, scale } = config;
      equipmentModel.position.set(offset.x, offset.y, offset.z);
      equipmentModel.rotation.set(rotation.x, rotation.y, rotation.z);
      equipmentModel.scale.setScalar(scale);
      attachNode.add(equipmentModel);
      this._refreshSkeleton(heroModel);
    } else {
      equipmentModel.position.set(0, 1.0, 0.2);
      heroModel.add(equipmentModel);
      console.warn(`找不到${config.attachSide}手掛點: ${equipmentId}`);
    }

    this.attached.set(instanceKey, equipmentModel);
    return equipmentModel;
  }

  async attachEquipmentList(heroModel, equipmentIds, keyPrefix) {
    const list = Array.isArray(equipmentIds) ? equipmentIds : [equipmentIds];
    const results = [];
    for (const id of list) {
      if (!id) continue;
      results.push(await this.attachEquipment(heroModel, id, `${keyPrefix}_${id}`));
    }
    this._refreshSkeleton(heroModel);
    return results;
  }

  _createPlaceholderEquipment() {
    const group = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.55, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.35 }),
    );
    blade.position.set(0, 0.25, 0);
    group.add(blade);
    return group;
  }

  detachAll() {
    this.attached.forEach((model) => {
      if (model.parent) model.parent.remove(model);
    });
    this.attached.clear();
  }
}

export { EQUIPMENT_CATALOG };
