/**
 * 戰鬥結算模組
 */

import { ENEMY } from './ai-taunt.js';

export const TEAM_MAX_HP = 100;
export const ROUND_DURATION = 10;

const MAGE_DEBUFF_THRESHOLD = 15;
const MAGE_DEBUFF_RATE = 0.35;
const ASSASSIN_CRIT_RATE = 0.25;

/** 每次答對獨立產生一筆命中 */
function rollHit(classId) {
  switch (classId) {
    case 'knight':
      return { shield: 1.5, shieldDisplay: 1 };
    case 'warrior':
      return { damage: 0.6, shield: 0.6, damageDisplay: 1, shieldDisplay: 1 };
    case 'mage':
      return { damage: 1, damageDisplay: 1 };
    case 'assassin': {
      const crit = Math.random() < ASSASSIN_CRIT_RATE;
      return {
        damage: crit ? 1.4 : 0.7,
        damageDisplay: crit ? 2 : 1,
        crit,
      };
    }
    default:
      return {};
  }
}

export function getBossRoundInfo(bossRound) {
  if (bossRound % 3 === 2) {
    return { type: 'ultimate', rawDamage: 40, label: '大招', sucking: false };
  }
  if (bossRound % 3 === 0) {
    return { type: 'lifesteal', rawDamage: 15, label: '金蟬脫殼', sucking: true };
  }
  return { type: 'normal', rawDamage: 20, label: '普通攻擊', sucking: false };
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

export { sumPlayerHits };

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

  let nextBossDebuff = false;
  for (const p of players) {
    if (p.role === 'mage' && p.score >= MAGE_DEBUFF_THRESHOLD && Math.random() < MAGE_DEBUFF_RATE) {
      nextBossDebuff = true;
      break;
    }
  }

  const roundInfo = getBossRoundInfo(bossRound);
  let bossRawDamage = roundInfo.rawDamage;
  const bossDebuffApplied = combat.bossIsDebuffed;

  if (bossDebuffApplied) {
    bossRawDamage *= 0.5;
  }

  let finalDamageToHero = bossRawDamage - totalShield;
  if (finalDamageToHero < 0) finalDamageToHero = 0;
  finalDamageToHero = Math.round(finalDamageToHero);

  let bossHeal = 0;
  if (roundInfo.sucking) {
    bossHeal = finalDamageToHero;
  }

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
  const totalShield = combat.players.reduce(
    (s, p) => s + sumHits(p.shieldHits || [], 'amount'),
    0,
  );

  let nextBossDebuff = false;
  for (const p of combat.players) {
    if (p.class?.id === 'mage' && (p.roundScore || 0) >= MAGE_DEBUFF_THRESHOLD
      && Math.random() < MAGE_DEBUFF_RATE) {
      nextBossDebuff = true;
      break;
    }
  }

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
    this.battleTotalDamage = 0;
    this.battleTotalShield = 0;
    this.victory = false;
    this.defeat = false;
  }

  startNewRound() {
    this.round++;
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
        display: hit.damageDisplay,
        crit: hit.crit || false,
      });
    }
    if (hit.shield) {
      player.shieldHits.push({
        amount: hit.shield,
        display: hit.shieldDisplay,
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
