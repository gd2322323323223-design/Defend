/**
 * 戰鬥結算模組
 */

import { ENEMY } from './ai-taunt.js';

export const TEAM_MAX_HP = 100;
export const ROUND_DURATION = 10;

const MAGE_DEBUFF_THRESHOLD = 15;
const MAGE_DEBUFF_RATE = 0.35;
const ASSASSIN_CRIT_RATE = 0.25;

function calcPlayerContribution(role, score) {
  let damage = 0;
  let shield = 0;
  let debuff = false;
  let crit = false;

  if (!role || score <= 0) {
    return { damage, shield, debuff, crit };
  }

  if (role === 'knight') {
    shield = score * 1.5;
  } else if (role === 'warrior') {
    damage = score * 0.6;
    shield = score * 0.6;
  } else if (role === 'mage') {
    damage = score * 0.8;
    if (score >= MAGE_DEBUFF_THRESHOLD && Math.random() < MAGE_DEBUFF_RATE) {
      debuff = true;
    }
  } else if (role === 'assassin') {
    damage = score * 0.7;
    if (Math.random() < ASSASSIN_CRIT_RATE) {
      damage *= 2;
      crit = true;
    }
  }

  return { damage, shield, debuff, crit };
}

export function getBossRoundInfo(bossRound) {
  if (bossRound % 3 === 2) {
    return { type: 'ultimate', rawDamage: 45, label: '大招', sucking: false };
  }
  if (bossRound % 3 === 0) {
    return { type: 'lifesteal', rawDamage: 20, label: '金蟬脫殼', sucking: true };
  }
  return { type: 'normal', rawDamage: 25, label: '普通攻擊', sucking: false };
}

/**
 * 戰鬥結算函式 — 依本輪答對題數計算傷害、護盾與 Boss 反擊
 */
export function calculateBattleResult(combat, bossRound) {
  const p1 = combat.players[0];
  const p2 = combat.players[1];
  const p1Role = p1?.class?.id;
  const p2Role = p2?.class?.id;
  const p1Score = p1?.roundScore || 0;
  const p2Score = p2?.roundScore || 0;

  const c1 = calcPlayerContribution(p1Role, p1Score);
  const c2 = calcPlayerContribution(p2Role, p2Score);

  const totalDamage = c1.damage + c2.damage;
  const totalShield = c1.shield + c2.shield;
  const nextBossDebuff = c1.debuff || c2.debuff;

  const roundInfo = getBossRoundInfo(bossRound);
  let bossRawDamage = roundInfo.rawDamage;

  if (combat.bossIsDebuffed) {
    bossRawDamage *= 0.5;
    combat.bossIsDebuffed = false;
  }

  let finalDamageToHero = bossRawDamage - totalShield;
  if (finalDamageToHero < 0) finalDamageToHero = 0;

  let bossHeal = 0;
  if (roundInfo.sucking) {
    bossHeal = finalDamageToHero;
  }

  combat.enemyHp = Math.max(0, combat.enemyHp - totalDamage);
  combat.teamHp = Math.max(0, combat.teamHp - finalDamageToHero);
  combat.enemyHp += bossHeal;

  if (nextBossDebuff) combat.bossIsDebuffed = true;

  combat.battleTotalDamage += totalDamage;
  combat.battleTotalShield += totalShield;

  if (combat.enemyHp <= 0) combat.victory = true;
  if (combat.teamHp <= 0) combat.defeat = true;

  return {
    players: [
      { index: 0, role: p1Role, score: p1Score, ...c1 },
      { index: 1, role: p2Role, score: p2Score, ...c2 },
    ],
    damageDealt: totalDamage,
    shieldGenerated: totalShield,
    damageReceived: finalDamageToHero,
    bossHeal,
    debuffTriggered: nextBossDebuff,
    bossDebuffApplied: bossRawDamage < roundInfo.rawDamage,
    bossRound: roundInfo,
    bossRawDamage: roundInfo.rawDamage,
    bossFinalDamage: bossRawDamage,
    blocked: Math.max(0, bossRawDamage - finalDamageToHero),
  };
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
    });
  }

  applyCorrect(playerIndex) {
    const player = this.players[playerIndex];
    if (!player) return;
    player.roundScore++;
    player.correctCount++;
  }

  getHpPercent() {
    return (this.enemyHp / this.enemyMaxHp) * 100;
  }

  getTeamHpPercent() {
    return (this.teamHp / this.teamMaxHp) * 100;
  }
}
