/**
 * 裝備掛載模組 — 利用 Object3D.add() 將裝備掛載至骨骼節點
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const EQUIPMENT_CATALOG = {
  arrow_crossbow: {
    name: '弩箭十字弓',
    path: 'assets/models/equipment/arrow_crossbow_bundle.gltf',
    attachBone: 'hand_r',
    fallbackBoneNames: ['RightHand', 'mixamorigRightHand', 'Hand_R', 'hand.R'],
    offset: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
  },
};

export class EquipmentManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.attached = new Map();
  }

  /**
   * 在模型骨架中遞迴搜尋骨骼節點
   */
  findBone(root, boneName, fallbackNames = []) {
    let found = null;
    const names = [boneName, ...fallbackNames];

    root.traverse((node) => {
      if (found) return;
      if (node.isBone || node.type === 'Bone') {
        for (const name of names) {
          if (node.name.toLowerCase().includes(name.toLowerCase())) {
            found = node;
            return;
          }
        }
      }
    });

    return found;
  }

  /**
   * 載入裝備並掛載至英雄手部骨骼
   */
  async attachEquipment(heroModel, equipmentId) {
    const config = EQUIPMENT_CATALOG[equipmentId];
    if (!config) {
      console.warn(`未知裝備: ${equipmentId}`);
      return null;
    }

    if (this.attached.has(equipmentId)) {
      return this.attached.get(equipmentId);
    }

    let equipmentModel;
    try {
      const gltf = await this.loader.loadAsync(config.path);
      equipmentModel = gltf.scene;
    } catch {
      equipmentModel = this._createPlaceholderEquipment();
      console.warn(`裝備模型載入失敗，使用佔位符: ${config.path}`);
    }

    const bone = this.findBone(heroModel, config.attachBone, config.fallbackBoneNames);

    if (bone) {
      equipmentModel.position.copy(config.offset);
      equipmentModel.rotation.copy(config.rotation);
      equipmentModel.scale.copy(config.scale);
      bone.add(equipmentModel);
      console.log(`裝備已掛載至骨骼: ${bone.name}`);
    } else {
      heroModel.add(equipmentModel);
      console.warn('找不到手部骨骼，裝備掛載至模型根節點');
    }

    this.attached.set(equipmentId, equipmentModel);
    return equipmentModel;
  }

  _createPlaceholderEquipment() {
    const group = new THREE.Group();

    const bowGeo = new THREE.BoxGeometry(0.05, 0.4, 0.1);
    const bowMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
    const bow = new THREE.Mesh(bowGeo, bowMat);
    bow.position.set(0, 0.2, 0);
    group.add(bow);

    const arrowGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffd54f });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.z = Math.PI / 2;
    arrow.position.set(0.15, 0.35, 0);
    group.add(arrow);

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
