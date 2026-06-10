/**
 * 裝備掛載模組 — 利用 Object3D.add() 將裝備掛載至骨骼節點
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EQUIPMENT_CATALOG, HAND_BONES } from '@/models-config.js';

export class EquipmentManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.attached = new Map();
  }

  findBone(root, side = 'right') {
    const names = HAND_BONES[side] || HAND_BONES.right;
    const slotNames = names.filter((n) => n.includes('slot'));
    const boneNames = names.filter((n) => !n.includes('slot'));
    let found = null;

    const matchName = (node, candidates) => {
      const n = node.name.toLowerCase();
      return candidates.some((name) => {
        const key = name.toLowerCase();
        return n === key || n.includes(key);
      });
    };

    // Kaykit 模型優先掛在 handslot（專用裝備掛點，非骨骼）
    root.traverse((node) => {
      if (found) return;
      if (matchName(node, slotNames)) found = node;
    });
    if (found) return found;

    root.traverse((node) => {
      if (found) return;
      if (!node.isBone && node.type !== 'Bone') return;
      if (matchName(node, boneNames)) found = node;
    });

    return found;
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
      const gltf = await this.loader.loadAsync(config.path);
      equipmentModel = gltf.scene;
    } catch (err) {
      equipmentModel = this._createPlaceholderEquipment();
      console.warn(`裝備模型載入失敗，使用佔位符: ${config.path}`, err);
    }

    const bone = this.findBone(heroModel, config.attachSide);

    equipmentModel.traverse((child) => {
      if (child.isMesh && child.material) child.material.fog = false;
    });

    if (bone) {
      const { offset, rotation, scale } = config;
      equipmentModel.position.set(offset.x, offset.y, offset.z);
      equipmentModel.rotation.set(rotation.x, rotation.y, rotation.z);
      equipmentModel.scale.setScalar(scale);
      bone.add(equipmentModel);
    } else {
      heroModel.add(equipmentModel);
      console.warn(`找不到${config.attachSide}手掛點，裝備掛載至模型根節點: ${equipmentId}`);
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
    return results;
  }

  _createPlaceholderEquipment() {
    const group = new THREE.Group();
    const bowGeo = new THREE.BoxGeometry(0.05, 0.4, 0.1);
    const bowMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
    const bow = new THREE.Mesh(bowGeo, bowMat);
    bow.position.set(0, 0.2, 0);
    group.add(bow);
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
