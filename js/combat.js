/**
 * 戰鬥結算模組 — 全局血量與職業乘數
 */

import { ENEMY } from './ai-taunt.js';

/** 全隊英雄總血量 */
export const HERO_HP = 20;
export const TEAM_MAX_HP = HERO_HP;

/** Boss 初始血量 */
export const BOSS_HP = 50;

export const ROUND_DURATION = 10;

/** 職業能量轉換乘數（1 次答對 = 1 點能量） */
export const CLASS_MULTIPLIERS = {
  knight: { shield: 2 },
  warrior: { damage: 1, shield: 1 },
  mage: { damage: 1.6 },
  assassin: { damage: 1.4 },
};

const MAGE_DEBUFF_THRESHOLD = 4;
const MAGE_DEBUFF_RATE = 0.5;
const ASSASSIN_CRIT_RATE = 0.25;

export const SHIELD_OVERFLOW_LIMIT = 15;
export const SHIELD_CONVERT_TO_DAMAGE = 10;

/** 戰鬥數值顯示（保留小數，整數不帶 .0） */
export function formatCombatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

/** 每次答對獨立產生一筆命中 */
function rollHit(classId) {
  switch (classId) {
    case 'knight':
      return { shield: 2, shieldDisplay: 2 };
    case 'warrior':
      return { damage: 1, shield: 1, damageDisplay: 1, shieldDisplay: 1 };
    case 'mage':
      return { damage: 1.6, damageDisplay: 1.6 };
    case 'assassin':
      return { damage: 1.4, damageDisplay: 1.4 };
    default:
      return {};
  }
}

export function getBossRoundInfo(bossRound) {
  if (bossRound % 3 === 2) {
    return { type: 'ultimate', rawDamage: 18, label: '蓄力重擊', sucking: false };
  }
  if (bossRound % 3 === 0) {
    return { type: 'lifesteal', rawDamage: 8, label: '吸血撕咬', sucking: true };
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

/** 刺客整輪暴擊判定（25% 傷害翻倍） */
export function getDamageHitsForResolve(player, classId) {
  const hits = (player.damageHits || []).map((h) => ({ ...h }));
  if (classId === 'assassin' && hits.length > 0 && Math.random() < ASSASSIN_CRIT_RATE) {
    return hits.map((h) => ({
      ...h,
      amount: h.amount * 2,
      display: h.amount * 2,
      crit: true,
    }));
  }
  return hits;
}

export { sumPlayerHits };

export function getRoundShieldTotal(combat) {
  const raw = combat.players.reduce(
    (s, p) => s + sumHits(p.shieldHits || [], 'amount'),
    0,
  );
  return Math.max(0, raw - (combat.roundShieldPenalty || 0));
}

function checkMageDebuff(players) {
  for (const p of players) {
    if (p.class?.id === 'mage' && (p.roundScore || 0) >= MAGE_DEBUFF_THRESHOLD
      && Math.random() < MAGE_DEBUFF_RATE) {
      return true;
    }
  }
  return false;
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
  const nextBossDebuff = checkMageDebuff(combat.players);

  const roundInfo = getBossRoundInfo(bossRound);
  let bossRawDamage = roundInfo.rawDamage;
  const bossDebuffApplied = combat.bossIsDebuffed;

  if (bossDebuffApplied) bossRawDamage *= 0.5;

  let finalDamageToHero = Math.max(0, bossRawDamage - totalShield);
  finalDamageToHero = Math.round(finalDamageToHero);

  let bossHeal = 0;
  if (roundInfo.sucking) bossHeal = finalDamageToHero;

  return {
    players,
    damageDealt: totalDamage,
    shieldGenerated: totalShield,
    damageReceived: finalDamageToHero,
    bossHeal,
    debuffTriggered: nextBossDebuff,
    bossDebuffApplied,
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

  const nextBossDebuff = checkMageDebuff(combat.players);

  const roundInfo = getBossRoundInfo(bossRound);
  let bossRawDamage = roundInfo.rawDamage;
  const bossDebuffApplied = combat.bossIsDebuffed;

  if (bossDebuffApplied) bossRawDamage *= 0.5;

  let finalDamageToHero = Math.max(0, bossRawDamage - totalShield);
  finalDamageToHero = Math.round(finalDamageToHero);

  let bossHeal = 0;
  if (roundInfo.sucking) bossHeal = finalDamageToHero;

  return {
    shieldGenerated: totalShield,
    overflowDamage,
    damageReceived: finalDamageToHero,
    bossHeal,
    debuffTriggered: nextBossDebuff,
    bossDebuffApplied,
    bossRound: roundInfo,
    bossFinalDamage: bossRawDamage,
    blocked: Math.max(0, bossRawDamage - finalDamageToHero),
  };
}

export function applyBossPhaseResult(combat, result) {
  if (result.bossDebuffApplied) combat.bossIsDebuffed = false;
  if (result.debuffTriggered) combat.bossIsDebuffed = true;
}

export class CombatState {
  constructor() {
    this.reset();
  }

  reset() {
    this.enemyHp = ENEMY.maxHp;
    this.enemyMaxHp = ENEMY.maxHp;
    this.teamHp = TEAM_MAX_HP;
    this.teamMaxHp = TEAM_MAX_HP;
    this.players = [];
    this.round = 0;
    this.bossIsDebuffed = false;
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
        crit: false,
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
}
