/**
 * 戰鬥統計 — 教學回顧用
 */

export class BattleStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.correctChars = {};
    this.totalCorrect = 0;
    this.thornsTotal = 0;
    this.thornsCount = 0;
    this.armorBreakCount = 0;
    this.freezeCount = 0;
    this.critCount = 0;
    this.playerCorrect = [];
  }

  recordCorrect(char, playerIdx) {
    this.totalCorrect++;
    this.correctChars[char] = (this.correctChars[char] || 0) + 1;
    if (!this.playerCorrect[playerIdx]) this.playerCorrect[playerIdx] = 0;
    this.playerCorrect[playerIdx]++;
  }

  recordCrit() {
    this.critCount++;
  }

  recordThorns(amount) {
    this.thornsCount++;
    this.thornsTotal += amount;
  }

  recordArmorBreak() {
    this.armorBreakCount++;
  }

  recordFreeze() {
    this.freezeCount++;
  }

  getTopChars(n = 5) {
    return Object.entries(this.correctChars)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }
}
