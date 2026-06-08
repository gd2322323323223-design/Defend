/**
 * 戰鬥結算模組
 */

import { ENEMY } from './ai-taunt.js';

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
  }

  addPlayer(classConfig) {
    this.players.push({
      class: classConfig,
      shield: 0,
      damage: 0,
      correctCount: 0,
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

  resolveRound() {
    const netDamage = Math.max(0, this.totalDamage);
    const blocked = Math.min(this.totalShield, ENEMY.attackDamage);
    const enemyAttack = Math.max(0, ENEMY.attackDamage - blocked);

    this.enemyHp = Math.max(0, this.enemyHp - netDamage);

    if (this.enemyHp <= 0) {
      this.victory = true;
    }

    return {
      damageDealt: netDamage,
      damageBlocked: blocked,
      enemyAttack,
      enemyHp: this.enemyHp,
      victory: this.victory,
    };
  }

  getHpPercent() {
    return (this.enemyHp / this.enemyMaxHp) * 100;
  }
}

export const ROUND_DURATION = 10;
