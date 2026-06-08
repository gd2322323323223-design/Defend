/**
 * Three.js 3D 場景模組
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EquipmentManager } from './equipment.js';

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.equipmentManager = new EquipmentManager();
    this.mixer = null;
    this.animations = {};
    this.models = {};
    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.scene.fog = new THREE.Fog(0x0a0e1a, 10, 30);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 2.5, 6);
    this.camera.lookAt(0, 1.2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(3, 6, 4);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x6688ff, 0.4);
    rimLight.position.set(-3, 2, -2);
    this.scene.add(rimLight);

    const groundGeo = new THREE.CircleGeometry(8, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.clock = new THREE.Clock();
    this._animate();

    window.addEventListener('resize', () => this._onResize());
  }

  async loadEnemy(path) {
    const model = await this._loadModel(path, 'enemy');
    if (model) {
      model.position.set(0, 0, -2);
      model.scale.setScalar(1.2);
      this._playAnimation(model, 'idle');
    }
    return model;
  }

  async loadHero(classId, path, side = 'left') {
    const x = side === 'left' ? -2 : 2;
    const model = await this._loadModel(path, classId);
    if (model) {
      model.position.set(x, 0, 1.5);
      model.rotation.y = side === 'left' ? 0.3 : -0.3;
      model.scale.setScalar(0.9);
      this._playAnimation(model, 'idle');
    }
    return model;
  }

  async _loadModel(path, key) {
    if (this.models[key]) return this.models[key];

    try {
      const gltf = await this.loader.loadAsync(path);
      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        this.animations[key] = { mixer, clips: gltf.animations };
        const idleClip = gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0];
        mixer.clipAction(idleClip).play();
      }

      this.scene.add(model);
      this.models[key] = model;
      return model;
    } catch {
      const placeholder = this._createPlaceholder(key);
      this.scene.add(placeholder);
      this.models[key] = placeholder;
      return placeholder;
    }
  }

  _createPlaceholder(key) {
    const group = new THREE.Group();
    const isEnemy = key === 'enemy';

    const bodyGeo = isEnemy
      ? new THREE.CapsuleGeometry(0.4, 1.2, 8, 16)
      : new THREE.CapsuleGeometry(0.35, 1.0, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isEnemy ? 0xeeeeee : (key === 'mage' ? 0x7c4dff : 0x4fc3f7),
      roughness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: isEnemy ? 0xdcdcdc : 0xffcc80,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = isEnemy ? 2.0 : 1.8;
    group.add(head);

    if (isEnemy) {
      const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff1744,
        emissive: 0xff1744,
        emissiveIntensity: 2,
      });
      [-0.1, 0.1].forEach((x) => {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(x, 2.05, 0.25);
        group.add(eye);
      });
    }

    return group;
  }

  _playAnimation(modelKey, animName) {
    const anim = this.animations[modelKey];
    if (!anim) return;

    const clip = anim.clips.find((a) => a.name.toLowerCase().includes(animName.toLowerCase()));
    if (!clip) return;

    anim.mixer.stopAllAction();
    anim.mixer.clipAction(clip).reset().fadeIn(0.3).play();
  }

  playHeroAction(classId, action) {
    this._playAnimation(classId, action);
    setTimeout(() => this._playAnimation(classId, 'idle'), 1500);
  }

  shakeEnemy() {
    const enemy = this.models.enemy;
    if (!enemy) return;

    const originalX = enemy.position.x;
    let frame = 0;
    const shake = () => {
      if (frame >= 20) {
        enemy.position.x = originalX;
        return;
      }
      enemy.position.x = originalX + (Math.random() - 0.5) * 0.3;
      frame++;
      requestAnimationFrame(shake);
    };
    shake();
  }

  async unlockEquipment(heroClassId) {
    const hero = this.models[heroClassId];
    if (!hero) return;
    await this.equipmentManager.attachEquipment(hero, 'arrow_crossbow');
  }

  clearScene() {
    Object.values(this.models).forEach((m) => this.scene.remove(m));
    this.models = {};
    this.animations = {};
    this.equipmentManager.detachAll();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const delta = this.clock.getDelta();

    Object.values(this.animations).forEach(({ mixer }) => {
      mixer.update(delta);
    });

    this.renderer.render(this.scene, this.camera);
  }
}
