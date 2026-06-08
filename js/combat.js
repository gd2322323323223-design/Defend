/**
 * 戰鬥結算模組
 */

import { ENEMY } from './ai-taunt.js';

export const PLAYER_MAX_HP = 10;
export const ROUND_DURATION = 10;

export class CombatState {
  constructor() {
    this.reset();
  }

  reset() {
    this.enemyHp = ENEMY.maxHp;
    this.enemyMaxHp = ENEMY.maxHp;
    this.players = [];
    this.round = 0;
    this.totalShield = 0;
    this.totalDamage = 0;
    this.victory = false;
    this.defeat = false;
  }

  addPlayer(classConfig) {
    this.players.push({
      class: classConfig,
      shield: 0,
      damage: 0,
      correctCount: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
    });
  }

  applyCorrect(playerIndex, classConfig) {
    const player = this.players[playerIndex];
    if (!player) return;

    player.correctCount++;

    switch (classConfig.role) {
      case 'tank':
        player.shield++;
        this.totalShield++;
        break;
      case 'dps':
        player.damage += classConfig.id === 'assassin' ? 2 : 1;
        this.totalDamage += classConfig.id === 'assassin' ? 2 : 1;
        break;
      case 'hybrid':
        player.shield++;
        player.damage++;
        this.totalShield++;
        this.totalDamage++;
        break;
      default:
        break;
    }
  }

  /** 結算數值（不含動畫） */
  computeRound() {
    const damageDealt = Math.max(0, this.totalDamage);
    const blocked = Math.min(this.totalShield, ENEMY.attackDamage);
    const enemyAttack = Math.max(0, ENEMY.attackDamage - blocked);

    return { damageDealt, blocked, enemyAttack };
  }

  applyBossDamage(damageDealt) {
    this.enemyHp = Math.max(0, this.enemyHp - damageDealt);
    if (this.enemyHp <= 0) this.victory = true;
  }

  applyPlayerDamage(amount) {
    if (amount <= 0 || this.players.length === 0) return null;

    const target = this.players.find((p) => p.class.role === 'tank') || this.players[0];
    target.hp = Math.max(0, target.hp - amount);
    if (this.players.every((p) => p.hp <= 0)) this.defeat = true;
    return target;
  }

  getHpPercent() {
    return (this.enemyHp / this.enemyMaxHp) * 100;
  }

  getAttackers() {
    return this.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ player }) => player.class.role === 'dps' || player.class.role === 'hybrid');
  }

  getDefenders() {
    return this.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ player }) => player.class.role === 'tank');
  }
}
