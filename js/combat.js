/**
 * 戰鬥結算模組 — 全局血量與職業乘數
 */

import { ENEMY } from '@/ai-taunt.js';

/** 雙人模式 — 全隊英雄總血量 */
export const HERO_HP = 30;
export const TEAM_MAX_HP = HERO_HP;

/** 雙人模式 — Boss 初始血量 */
export const BOSS_HP = 75;

/** 單人狂暴大英雄 */
export const SOLO_HERO_HP = 25;
export const SOLO_BOSS_HP = 65;
export const SOLO_DAMAGE_PER_HIT = 1.4;
export const SOLO_SHIELD_PER_HIT = 1.0;
export const SOLO_BONUS_THRESHOLD = 6;
export const SOLO_BONUS_RATE = 0.3;
export const SOLO_BONUS_MULT = 1.5;

export const ROUND_DURATION = 10;

/** 職業能量轉換乘數（1 次答對 = 1 點能量） */
export const CLASS_MULTIPLIERS = {
  knight: { shield: 2.0 },
  warrior: { damage: 1.5 },
  mage: { damage: 1.6 },
  assassin: { damage: 1.3 },
};

const MAGE_FREEZE_THRESHOLD = 6;
const MAGE_FREEZE_REDUCTION = 4;
const WARRIOR_ARMOR_BREAK_THRESHOLD = 7;
const ARMOR_BREAK_BONUS = 3;
const ASSASSIN_CRIT_RATE = 0.35;

export const SHIELD_OVERFLOW_LIMIT = 15;
export const SHIELD_CONVERT_TO_DAMAGE = 10;

/** 戰鬥數值顯示（保留小數，整數不帶 .0） */
export function formatCombatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function rollHitRageHero() {
  return {
    damage: SOLO_DAMAGE_PER_HIT,
    shield: SOLO_SHIELD_PER_HIT,
    damageDisplay: SOLO_DAMAGE_PER_HIT,
    shieldDisplay: SOLO_SHIELD_PER_HIT,
  };
}

/** 每次答對獨立產生一筆命中 */
function rollHit(classId) {
  if (classId === 'rage_hero') return rollHitRageHero();
  switch (classId) {
    case 'knight':
      return { shield: 2.0, shieldDisplay: 2.0 };
    case 'warrior':
      return { damage: 1.5, damageDisplay: 1.5 };
    case 'mage':
      return { damage: 1.6, damageDisplay: 1.6 };
    case 'assassin': {
      const crit = Math.random() < ASSASSIN_CRIT_RATE;
      const base = 1.3;
      const amount = crit ? base * 2 : base;
      return { damage: amount, damageDisplay: amount, crit };
    }
    default:
      return {};
  }
}

/** Boss 三回合循環（雙人：10 / 10吸血 / 18蓄力） */
export function getBossRoundInfo(bossRound, isSolo = false) {
  if (isSolo) {
    if (bossRound % 3 === 0) {
      return { type: 'ultimate', rawDamage: 18, label: '蓄力重擊', sucking: false };
    }
    if (bossRound % 3 === 2) {
      return { type: 'lifesteal', rawDamage: 8, label: '吸血撕咬', sucking: true };
    }
    return { type: 'normal', rawDamage: 10, label: '普通攻擊', sucking: false };
  }

  if (bossRound % 3 === 0) {
    return { type: 'ultimate', rawDamage: 18, label: '蓄力重擊', sucking: false };
  }
  if (bossRound % 3 === 2) {
    return { type: 'lifesteal', rawDamage: 10, label: '吸血撕咬', sucking: true };
  }
  return { type: 'normal', rawDamage: 10, label: '普通攻擊', sucking: false };
}

function sumHits(hits, key) {
  return hits.reduce((s, h) => s + (h[key] || 0), 0);
}

function sumPlayerHits(player) {
  return {
    damage: sumHits(player.damageHits || [], 'amount'),
    shield: sumHits(player.shieldHits || [], 'amount'),
  };
}

/** 單人模式 ≥6 分隨機加成 */
export function applySoloRoundBonuses(player) {
  const bonuses = {
    damageMult: 1,
    shieldMult: 1,
    mageCrit: false,
    holyShield: false,
  };
  player.soloBonuses = bonuses;

  if ((player.roundScore || 0) < SOLO_BONUS_THRESHOLD) return bonuses;

  if (Math.random() < SOLO_BONUS_RATE) {
    bonuses.mageCrit = true;
    bonuses.damageMult = SOLO_BONUS_MULT;
  }
  if (Math.random() < SOLO_BONUS_RATE) {
    bonuses.holyShield = true;
    bonuses.shieldMult = SOLO_BONUS_MULT;
  }
  return bonuses;
}

function applyMultToHits(hits, mult, critFlag = false) {
  if (mult <= 1) return hits.map((h) => ({ ...h }));
  return hits.map((h) => ({
    ...h,
    amount: h.amount * mult,
    display: h.amount * mult,
    crit: critFlag || h.crit,
  }));
}

/** 碎甲加成 — 本回合玩家對 Boss 傷害 +3 */
export function applyArmorBreakBonus(hits, combat) {
  if (!combat.bossArmorBreak || !hits.length) return hits;
  const boosted = hits.map((h) => ({ ...h }));
  const last = boosted[boosted.length - 1];
  last.amount += ARMOR_BREAK_BONUS;
  last.display = last.amount;
  return boosted;
}

/** 結算用傷害命中列表 */
export function getDamageHitsForResolve(player, combat, isSolo = false) {
  let hits = (player.damageHits || []).map((h) => ({ ...h }));
  if (isSolo && player.soloBonuses?.damageMult > 1) {
    hits = applyMultToHits(hits, player.soloBonuses.damageMult, player.soloBonuses.mageCrit);
  }
  if (!isSolo) {
    hits = applyArmorBreakBonus(hits, combat);
  }
  return hits;
}

/** 結算用護盾命中列表 */
export function getShieldHitsForResolve(player, isSolo = false) {
  const hits = (player.shieldHits || []).map((h) => ({ ...h }));
  if (isSolo && player.soloBonuses?.shieldMult > 1) {
    return applyMultToHits(hits, player.soloBonuses.shieldMult);
  }
  return hits;
}

export { sumPlayerHits };

function getPlayerShieldTotal(player, isSolo) {
  let shield = sumHits(player.shieldHits || [], 'amount');
  if (isSolo && player.soloBonuses?.shieldMult > 1) {
    shield *= player.soloBonuses.shieldMult;
  }
  return shield;
}

export function getRoundShieldTotal(combat) {
  const raw = combat.players.reduce(
    (s, p) => s + getPlayerShieldTotal(p, combat.isSolo),
    0,
  );
  return Math.max(0, raw - (combat.roundShieldPenalty || 0));
}

function getKnightRoundShield(combat) {
  const knight = combat.players.find((p) => p.class?.id === 'knight');
  if (!knight) return 0;
  return getPlayerShieldTotal(knight, combat.isSolo);
}

function checkMageFreeze(players, isSolo) {
  if (isSolo) return false;
  return players.some(
    (p) => p.class?.id === 'mage' && (p.roundScore || 0) >= MAGE_FREEZE_THRESHOLD,
  );
}

function checkWarriorArmorBreak(players, isSolo) {
  if (isSolo) return false;
  return players.some(
    (p) => p.class?.id === 'warrior' && (p.roundScore || 0) >= WARRIOR_ARMOR_BREAK_THRESHOLD,
  );
}

function applyBossAttackModifiers(rawDamage, combat) {
  let damage = rawDamage;
  if (combat.bossFreezeReduction > 0) {
    damage = Math.max(0, damage - combat.bossFreezeReduction);
  }
  return damage;
}

/**
 * 戰鬥結算 — 僅計算，不修改 HP（由 game.js 逐次套用）
 */
export function computeBattleResult(combat, bossRound) {
  const players = combat.players.map((p, index) => {
    const damageHits = p.damageHits || [];
    const shieldHits = p.shieldHits || [];
    return {
      index,
      role: p.class?.id,
      score: p.roundScore || 0,
      damageHits,
      shieldHits,
      damage: sumHits(damageHits, 'amount'),
      shield: sumHits(shieldHits, 'amount'),
      crit: damageHits.some((h) => h.crit),
    };
  });

  const totalDamage = players.reduce((s, p) => s + p.damage, 0);
  const totalShield = players.reduce((s, p) => s + p.shield, 0);
  const mageFreezeTriggered = checkMageFreeze(combat.players, combat.isSolo);

  const roundInfo = getBossRoundInfo(bossRound, combat.isSolo);
  let bossRawDamage = applyBossAttackModifiers(roundInfo.rawDamage, combat);
  const freezeApplied = combat.bossFreezeReduction > 0;

  let finalDamageToHero = Math.max(0, bossRawDamage - totalShield);
  finalDamageToHero = Math.round(finalDamageToHero);

  const knightShield = getKnightRoundShield(combat);
  const thornsDamage = knightShield > 0 ? Math.round(knightShield) : 0;

  let bossHeal = 0;
  if (roundInfo.sucking) bossHeal = finalDamageToHero;

  return {
    players,
    damageDealt: totalDamage,
    shieldGenerated: totalShield,
    damageReceived: finalDamageToHero,
    thornsDamage,
    bossHeal,
    mageFreezeTriggered,
    freezeApplied,
    warriorArmorBreakTriggered: checkWarriorArmorBreak(combat.players, combat.isSolo),
    bossRound: roundInfo,
    bossRawDamage: roundInfo.rawDamage,
    bossFinalDamage: bossRawDamage,
    blocked: Math.max(0, bossRawDamage - finalDamageToHero),
  };
}

/** Boss 階段結算（玩家攻擊已在各自回合完成） */
export function computeBossPhase(combat, bossRound) {
  let totalShield = getRoundShieldTotal(combat);
  let overflowDamage = 0;

  if (totalShield > SHIELD_OVERFLOW_LIMIT) {
    overflowDamage = SHIELD_CONVERT_TO_DAMAGE;
    totalShield -= SHIELD_CONVERT_TO_DAMAGE;
  }

  const mageFreezeTriggered = checkMageFreeze(combat.players, combat.isSolo);
  const warriorArmorBreakTriggered = checkWarriorArmorBreak(combat.players, combat.isSolo);

  const roundInfo = getBossRoundInfo(bossRound, combat.isSolo);
  let bossRawDamage = applyBossAttackModifiers(roundInfo.rawDamage, combat);
  const freezeApplied = combat.bossFreezeReduction > 0;

  let finalDamageToHero = Math.max(0, bossRawDamage - totalShield);
  finalDamageToHero = Math.round(finalDamageToHero);

  const knightShield = getKnightRoundShield(combat);
  const thornsDamage = knightShield > 0 ? Math.round(knightShield) : 0;

  let bossHeal = 0;
  if (roundInfo.sucking && finalDamageToHero > 0) {
    bossHeal = finalDamageToHero;
  }

  return {
    shieldGenerated: totalShield,
    overflowDamage,
    damageReceived: finalDamageToHero,
    thornsDamage,
    bossHeal,
    mageFreezeTriggered,
    freezeApplied,
    warriorArmorBreakTriggered,
    bossRound: roundInfo,
    bossFinalDamage: bossRawDamage,
    blocked: Math.max(0, bossRawDamage - finalDamageToHero),
  };
}

export function applyBossPhaseResult(combat, result) {
  if (result.freezeApplied) combat.bossFreezeReduction = 0;
  if (result.mageFreezeTriggered) combat.bossFreezeReduction = MAGE_FREEZE_REDUCTION;
}

export function prepareNextRound(combat, result) {
  if (result.warriorArmorBreakTriggered) {
    combat.bossArmorBreak = true;
  } else {
    combat.bossArmorBreak = false;
  }
}

export class CombatState {
  constructor() {
    this.reset('dual');
  }

  reset(gameMode = 'dual', overrides = {}) {
    this.gameMode = gameMode;
    this.isSolo = gameMode === 'single';

    if (this.isSolo) {
      this.enemyHp = overrides.bossHp ?? SOLO_BOSS_HP;
      this.enemyMaxHp = overrides.bossHp ?? SOLO_BOSS_HP;
      this.teamHp = overrides.teamHp ?? SOLO_HERO_HP;
      this.teamMaxHp = overrides.teamHp ?? SOLO_HERO_HP;
    } else {
      this.enemyHp = overrides.bossHp ?? ENEMY.maxHp;
      this.enemyMaxHp = overrides.bossHp ?? ENEMY.maxHp;
      this.teamHp = overrides.teamHp ?? TEAM_MAX_HP;
      this.teamMaxHp = overrides.teamHp ?? TEAM_MAX_HP;
    }

    this.players = [];
    this.round = 0;
    this.bossFreezeReduction = 0;
    this.bossArmorBreak = false;
    this.roundShieldPenalty = 0;
    this.battleTotalDamage = 0;
    this.battleTotalShield = 0;
    this.victory = false;
    this.defeat = false;
  }

  startNewRound() {
    this.round++;
    this.roundShieldPenalty = 0;
    this.players.forEach((p) => {
      p.roundScore = 0;
      p.damageHits = [];
      p.shieldHits = [];
      p.soloBonuses = null;
    });
  }

  isTeamAlive() {
    return this.teamHp > 0;
  }

  addPlayer(classConfig) {
    this.players.push({
      class: classConfig,
      roundScore: 0,
      correctCount: 0,
      damageHits: [],
      shieldHits: [],
      soloBonuses: null,
    });
  }

  applyCorrect(playerIndex, classConfig) {
    const player = this.players[playerIndex];
    if (!player) return;

    player.roundScore++;
    player.correctCount++;

    const hit = rollHit(classConfig.id);
    if (hit.damage) {
      player.damageHits.push({
        amount: hit.damage,
        display: hit.damageDisplay ?? hit.damage,
        crit: hit.crit ?? false,
      });
    }
    if (hit.shield) {
      player.shieldHits.push({
        amount: hit.shield,
        display: hit.shieldDisplay ?? hit.shield,
      });
    }
  }

  getHpPercent() {
    return (this.enemyHp / this.enemyMaxHp) * 100;
  }

  getTeamHpPercent() {
    return (this.teamHp / this.teamMaxHp) * 100;
  }

  /** 是否處於寒冰凍結（下輪 Boss 攻擊 -4） */
  get bossIsDebuffed() {
    return this.bossFreezeReduction > 0;
  }
}
