/**
 * 戰鬥結算模組
 */

import { ENEMY } from './ai-taunt.js';

export const TEAM_MAX_HP = 20;
export const ROUND_DURATION = 10;
export const ASSASSIN_CRIT_RATE = 0.35;

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
    this.totalShield = 0;
    this.totalDamage = 0;
    this.battleTotalDamage = 0;
    this.battleTotalShield = 0;
    this.victory = false;
    this.defeat = false;
  }

  startNewRound() {
    this.battleTotalDamage += this.totalDamage;
    this.battleTotalShield += this.totalShield;
    this.round++;
    this.totalShield = 0;
    this.totalDamage = 0;
    this.players.forEach((p) => {
      p.shield = 0;
      p.damage = 0;
      p.damageHits = [];
      p.shieldHits = [];
    });
  }

  isTeamAlive() {
    return this.teamHp > 0;
  }

  isPlayerAlive() {
    return this.isTeamAlive();
  }

  addPlayer(classConfig) {
    this.players.push({
      class: classConfig,
      shield: 0,
      damage: 0,
      damageHits: [],
      shieldHits: [],
      correctCount: 0,
    });
  }

  _rollAssassinDamage() {
    const crit = Math.random() < ASSASSIN_CRIT_RATE;
    return { amount: crit ? 2 : 1, crit };
  }

  applyCorrect(playerIndex, classConfig) {
    const player = this.players[playerIndex];
    if (!player) return;

    player.correctCount++;

    switch (classConfig.role) {
      case 'tank':
        player.shield++;
        player.shieldHits.push(1);
        this.totalShield++;
        break;
      case 'dps':
        if (classConfig.id === 'assassin') {
          const hit = this._rollAssassinDamage();
          player.damage += hit.amount;
          player.damageHits.push(hit);
          this.totalDamage += hit.amount;
        } else {
          player.damage++;
          player.damageHits.push({ amount: 1, crit: false });
          this.totalDamage++;
        }
        break;
      case 'hybrid':
        player.shield++;
        player.shieldHits.push(1);
        player.damage++;
        player.damageHits.push({ amount: 1, crit: false });
        this.totalShield++;
        this.totalDamage++;
        break;
      default:
        break;
    }
  }

  computeRound() {
    const damageDealt = Math.max(0, this.totalDamage);
    const blocked = Math.min(this.totalShield, ENEMY.attackDamage);
    const enemyAttack = Math.max(0, ENEMY.attackDamage - blocked);
    return { damageDealt, blocked, enemyAttack };
  }

  applyTeamDamage(amount) {
    if (amount <= 0) return;
    this.teamHp = Math.max(0, this.teamHp - amount);
    if (this.teamHp <= 0) this.defeat = true;
  }

  getHpPercent() {
    return (this.enemyHp / this.enemyMaxHp) * 100;
  }

  getTeamHpPercent() {
    return (this.teamHp / this.teamMaxHp) * 100;
  }

  getAttackers() {
    return this.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ player }) => player.damageHits.length > 0);
  }

  getDefenders() {
    return this.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ player }) => player.shieldHits.length > 0);
  }
}
