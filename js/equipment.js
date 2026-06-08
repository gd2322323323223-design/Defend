/**
 * 裝備掛載模組 — 利用 Object3D.add() 將裝備掛載至骨骼節點
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EQUIPMENT_CATALOG, HAND_BONES } from './models-config.js';

export class EquipmentManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.attached = new Map();
  }

  findBone(root, side = 'right') {
    const names = HAND_BONES[side] || HAND_BONES.right;
    let found = null;

    root.traverse((node) => {
      if (found) return;
      if (node.isBone || node.type === 'Bone') {
        for (const name of names) {
          if (node.name.toLowerCase() === name.toLowerCase()
            || node.name.toLowerCase().includes(name.toLowerCase())) {
            found = node;
            return;
          }
        }
      }
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

    if (bone) {
      const { offset, rotation, scale } = config;
      equipmentModel.position.set(offset.x, offset.y, offset.z);
      equipmentModel.rotation.set(rotation.x, rotation.y, rotation.z);
      equipmentModel.scale.setScalar(scale);
      bone.add(equipmentModel);
      console.log(`裝備「${config.name}」已掛載至骨骼: ${bone.name}`);
    } else {
      heroModel.add(equipmentModel);
      console.warn(`找不到${config.attachSide}手骨骼，裝備掛載至模型根節點`);
    }

    this.attached.set(instanceKey, equipmentModel);
    return equipmentModel;
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
