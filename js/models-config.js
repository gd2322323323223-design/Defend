/**
 * 3D 模型與動畫資源路徑設定
 */

const CHAR_BASE = 'Characters/Characters';
const ASSETS = `${CHAR_BASE}/Assets/gltf`;
const HEROES = `${CHAR_BASE}/gltf`;
const SKELETONS = `${CHAR_BASE}/Skeletons/gltf`;
const ANIM_HERO = `${CHAR_BASE}/Animations/gltf/Rig_Medium`;
const ANIM_SKELETON = `${CHAR_BASE}/Skeletons/Animations/gltf/Rig_Medium`;

const FRONT_CLASSES = new Set(['knight', 'warrior']);
const BACK_CLASSES = new Set(['mage', 'assassin']);

/** 戰鬥站位：玩家在左、Boss 在右；雙人錯開避免遮擋 */
export const BATTLE_FORMATION = {
  enemy: { x: 2.8, y: 0.08, z: 0, rotY: -Math.PI / 2, scale: 0.82 },
  player1: { x: -1.6, y: 0.08, z: 1.4, rotY: Math.PI / 2, scale: 0.62 },
  player2: { x: -4.2, y: 0.08, z: -0.6, rotY: Math.PI / 2, scale: 0.58 },
  front: { x: -1.6, y: 0.08, z: 1.4, rotY: Math.PI / 2, scale: 0.62 },
  back: { x: -4.2, y: 0.08, z: -0.6, rotY: Math.PI / 2, scale: 0.58 },
  solo: { x: -2.4, y: 0.08, z: 0.4, rotY: Math.PI / 2, scale: 0.65 },
};

/**
 * 前排：戰士、騎士；後排：法師、刺客
 * 同類型組合則隨機前後
 */
export function assignFormationSlots(classes) {
  if (classes.length === 1) {
    return [{ index: 0, slot: 'solo' }];
  }
  return [
    { index: 0, slot: 'player1' },
    { index: 1, slot: 'player2' },
  ];
}

export const ANIMATION_FILES = {
  hero: `${ANIM_HERO}/Rig_Medium_General.glb`,
  enemy: `${ANIM_SKELETON}/Rig_Medium_General.glb`,
};

/** 預載常用模型路徑 */
export const PRELOAD_MODELS = [
  `${SKELETONS}/Skeleton_Warrior.glb`,
  `${HEROES}/Knight.glb`,
  `${HEROES}/Mage.glb`,
  `${HEROES}/Rogue.glb`,
  `${HEROES}/Barbarian.glb`,
];

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
