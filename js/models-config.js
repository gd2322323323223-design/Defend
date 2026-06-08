/**
 * 3D 模型與動畫資源路徑設定（對應 Characters/ 上傳目錄）
 */

const CHAR_BASE = 'Characters/Characters';
const ASSETS = `${CHAR_BASE}/Assets/gltf`;
const HEROES = `${CHAR_BASE}/gltf`;
const SKELETONS = `${CHAR_BASE}/Skeletons/gltf`;
const ANIM_HERO = `${CHAR_BASE}/Animations/gltf/Rig_Medium`;
const ANIM_SKELETON = `${CHAR_BASE}/Skeletons/Animations/gltf/Rig_Medium`;

/** 戰鬥站位：玩家在左、Boss 在右，互相對視 */
export const BATTLE_FORMATION = {
  enemy: { x: 3.2, y: 0.08, z: 0, rotY: -Math.PI / 2 },
  heroSlots: [
    { x: -3.2, y: 0.08, z: -0.75, rotY: Math.PI / 2 },
    { x: -3.2, y: 0.08, z: 0.75, rotY: Math.PI / 2 },
  ],
};

export const ANIMATION_FILES = {
  hero: {
    general: `${ANIM_HERO}/Rig_Medium_General.glb`,
    movement: `${ANIM_HERO}/Rig_Medium_MovementBasic.glb`,
  },
  enemy: {
    general: `${ANIM_SKELETON}/Rig_Medium_General.glb`,
    movement: `${ANIM_SKELETON}/Rig_Medium_MovementBasic.glb`,
  },
};

/** 動作名稱 → 動畫片段候選（KayKit Rig_Medium） */
export const ANIM_MAP = {
  idle: ['Idle_A', 'Idle_B'],
  block: ['Hit_A', 'Use_Item'],
  cast: ['Use_Item', 'Throw'],
  attack: ['Throw', 'Hit_B'],
  run: ['Running_A', 'Walking_A'],
  hit: ['Hit_A', 'Hit_B'],
  death: ['Death_A', 'Death_B'],
};

export const HAND_BONES = {
  right: ['handslot.r', 'hand.r', 'Hand_R', 'mixamorigRightHand'],
  left: ['handslot.l', 'hand.l', 'Hand_L', 'mixamorigLeftHand'],
};

export const EQUIPMENT_CATALOG = {
  arrow_crossbow: {
    name: '弩箭十字弓',
    path: `${ASSETS}/arrow_crossbow_bundle.gltf`,
    attachSide: 'right',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
  },
  shield_round: {
    name: '圓盾',
    path: `${ASSETS}/shield_round.gltf`,
    attachSide: 'left',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
    scale: 1,
  },
  staff: {
    name: '法杖',
    path: `${ASSETS}/staff.gltf`,
    attachSide: 'right',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
  },
  dagger: {
    name: '匕首',
    path: `${ASSETS}/dagger.gltf`,
    attachSide: 'right',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
  },
  axe_2handed: {
    name: '雙手斧',
    path: `${ASSETS}/axe_2handed.gltf`,
    attachSide: 'right',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
  },
};
