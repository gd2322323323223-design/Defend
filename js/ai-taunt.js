/**
 * AI 敵方叫陣模組
 */

const CHAR = 'Characters/Characters';
const HEROES = `${CHAR}/gltf`;
const SKELETONS = `${CHAR}/Skeletons/gltf`;

const TAUNTS = [
  '愚蠢的冒險者，你們的詞彙量弱不禁風！有本事就用「火」字部的字來融化我的冰霜護盾啊！',
  '哈哈哈！你們的字彙就像紙糊的城牆！快用帶「火」的字來燒穿我的防線！',
  '我的冰霜護盾無懈可擊！除非你們能找到所有「火」部字……來啊，讓我看看你們的本事！',
  '區區小學生也想打敗我？先通過我的「火」字考驗再說！',
  '我的字典裡沒有「認輸」兩個字！但你們的字典裡有幾個「火」部字呢？',
];

const ENEMY_ATTACK_TAUNTS = [
  '冰霜衝擊！感受寒冷吧！',
  '你的護盾太薄弱了！',
  '哈哈哈，這點傷害連撓癢都不夠！',
];

export function getRandomTaunt() {
  return TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
}

export function getEnemyAttackTaunt() {
  return ENEMY_ATTACK_TAUNTS[Math.floor(Math.random() * ENEMY_ATTACK_TAUNTS.length)];
}

export const CLASSES = {
  knight: {
    id: 'knight',
    name: '騎士',
    icon: '🛡️',
    role: 'tank',
    desc: '答對題數 ×1.5 護盾',
    modelPath: `${HEROES}/Knight.glb`,
    defaultEquipment: 'shield_round',
    animBlock: 'block',
    animIdle: 'idle',
  },
  mage: {
    id: 'mage',
    name: '法師',
    icon: '🔮',
    role: 'dps',
    desc: '答對 ×0.8 傷害；15 題以上 35% 弱化 Boss',
    modelPath: `${HEROES}/Mage.glb`,
    defaultEquipment: 'staff',
    animCast: 'cast',
    animIdle: 'idle',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    icon: '🗡️',
    role: 'dps',
    desc: '答對 ×0.7 傷害；25% 整輪暴擊 x2',
    modelPath: `${HEROES}/Rogue.glb`,
    defaultEquipment: 'dagger',
    animAttack: 'attack',
    animIdle: 'idle',
  },
  warrior: {
    id: 'warrior',
    name: '戰士',
    icon: '⚔️',
    role: 'hybrid',
    desc: '答對 ×0.6 護盾與傷害',
    modelPath: `${HEROES}/Barbarian.glb`,
    defaultEquipment: 'axe_2handed',
    animAttack: 'attack',
    animIdle: 'idle',
  },
};

export const ENEMY = {
  name: '骷髏魔王',
  icon: '👹',
  maxHp: 100,
  modelPath: `${SKELETONS}/Skeleton_Warrior.glb`,
};
