/**
 * 遊戲主狀態機
 */

import { WordMatrix } from './matrix.js';
import { CLASSES, ENEMY, getRandomTaunt } from './ai-taunt.js';
import { CombatState, ROUND_DURATION, PLAYER_MAX_HP } from './combat.js';
import { Scene3D } from './scene3d.js';
import { delay } from './vfx.js';

export class Game {
  constructor() {
    this.mode = null;
    this.selectedClasses = [];
    this.combat = new CombatState();
    this.matrices = [];
    this.timerInterval = null;
    this.timeLeft = ROUND_DURATION;
    this.turnOrder = [];
    this.currentTurnStep = 0;
    this.scene3d = null;
    this._bindUI();
  }

  _bindUI() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this._selectMode(btn.dataset.mode));
    });

    document.getElementById('btn-start-battle').addEventListener('click', () => this._startTaunt());
    document.getElementById('btn-ready').addEventListener('click', () => this._startBattle());
    document.getElementById('btn-replay').addEventListener('click', () => this._goToMenu());
  }

  init() {
    const canvas = document.getElementById('scene-canvas');
    this.scene3d = new Scene3D(canvas);
    this.scene3d.loadEnemy(ENEMY.modelPath);
    this._showScreen('screen-menu');
  }

  _selectMode(mode) {
    this.mode = mode;
    this.selectedClasses = [];
    this._renderClassSelection();
    this._showScreen('screen-class');
  }

  _renderClassSelection() {
    const grid = document.getElementById('class-grid');
    grid.innerHTML = '';

    const maxPlayers = this.mode === 'single' ? 1 : 2;
    const hint = document.createElement('p');
    hint.style.cssText = 'grid-column: 1/-1; text-align:center; color:#9fa8da; margin-bottom:8px;';
    hint.textContent = maxPlayers === 1
      ? '選擇 1 個職業'
      : '玩家 1 與玩家 2 各選一個職業';
    grid.appendChild(hint);

    Object.values(CLASSES).forEach((cls) => {
      const card = document.createElement('div');
      card.className = 'class-card';
      card.dataset.classId = cls.id;
      card.innerHTML = `
        <span class="icon">${cls.icon}</span>
        <span class="name">${cls.name}</span>
        <span class="desc">${cls.desc}</span>
      `;
      card.addEventListener('click', () => this._toggleClass(cls, card));
      grid.appendChild(card);
    });
  }

  _toggleClass(cls, card) {
    const maxPlayers = this.mode === 'single' ? 1 : 2;
    const idx = this.selectedClasses.findIndex((c) => c.id === cls.id);

    if (idx >= 0) {
      this.selectedClasses.splice(idx, 1);
      card.classList.remove('selected');
    } else if (this.selectedClasses.length < maxPlayers) {
      this.selectedClasses.push(cls);
      card.classList.add('selected');
    }

    document.getElementById('btn-start-battle').disabled =
      this.selectedClasses.length < maxPlayers;
  }

  /** 行動順序：攻擊角色 → 防禦角色（跳過已死亡玩家） */
  _getTurnOrder() {
    const withIdx = this.selectedClasses.map((cls, i) => ({ cls, i }));
    const alive = (i) => this.combat.isPlayerAlive(i);
    const attackers = withIdx
      .filter(({ cls, i }) => alive(i) && (cls.role === 'dps' || cls.role === 'hybrid'))
      .map(({ i }) => i);
    const defenders = withIdx
      .filter(({ cls, i }) => alive(i) && cls.role === 'tank')
      .map(({ i }) => i);
    const order = [...attackers, ...defenders];
    return order.length ? order : withIdx.filter(({ i }) => alive(i)).map(({ i }) => i);
  }

  _getPhaseLabel(cls) {
    if (cls.role === 'tank') return '防禦';
    if (cls.role === 'dps') return '攻擊';
    return '出擊';
  }

  async _startTaunt() {
    document.getElementById('taunt-text').textContent = getRandomTaunt();
    this._showScreen('screen-taunt');

    this.scene3d.clearScene();
    await this.scene3d.loadEnemy(ENEMY.modelPath);
  }

  async _startBattle() {
    this.combat.reset();
    this.selectedClasses.forEach((cls) => this.combat.addPlayer(cls));

    for (let i = 0; i < this.selectedClasses.length; i++) {
      await this.scene3d.loadHero(
        this.selectedClasses[i].id,
        this.selectedClasses[i].modelPath,
        i,
        this.selectedClasses[i].defaultEquipment,
      );
    }
    this.scene3d.layoutBattleFormation(this.selectedClasses.map((c) => c.id));

    this.combat.round = 1;
    this.turnOrder = this._getTurnOrder();
    this.currentTurnStep = 0;

    this._setupBattleUI();
    this._showScreen('screen-battle');
    this._beginRoundInput();
  }

  _beginRoundInput() {
    if (this.mode === 'dual-split') {
      this._startSplitScreen();
    } else {
      this._startMicroRound();
    }
  }

  _resetRoundUI() {
    this.selectedClasses.forEach((cls, i) => {
      const scoreEl = document.getElementById(`p${i + 1}-score`);
      if (!scoreEl) return;
      if (cls.role === 'tank') scoreEl.textContent = '護盾: 0';
      else if (cls.role === 'dps') scoreEl.textContent = '傷害: 0';
      else scoreEl.textContent = '護盾: 0 / 傷害: 0';
    });
  }

  _setupBattleUI() {
    const row = document.getElementById('players-row');
    row.className = 'players-row';
    if (this.mode === 'single') {
      row.classList.add('solo');
    } else if (this.mode === 'dual-sequential') {
      row.classList.add('sequential');
    }

    const statusEl = document.getElementById('player-status');
    statusEl.innerHTML = '';
    this.selectedClasses.forEach((cls, i) => {
      const chip = document.createElement('div');
      chip.className = 'player-hp-chip';
      chip.id = `player-hp-${i}`;
      chip.innerHTML = `
        <span>${cls.icon} ${cls.name}</span>
        <div class="hp-bar-container small">
          <div class="hp-bar player-hp-fill"></div>
          <span class="hp-text">${PLAYER_MAX_HP} / ${PLAYER_MAX_HP}</span>
        </div>
      `;
      statusEl.appendChild(chip);
    });

    this._updateHpBar();
    this._updatePlayerHp();
  }

  _startMicroRound() {
    this._cleanupMatrices();
    const playerIdx = this.turnOrder[this.currentTurnStep];
    if (playerIdx === undefined || !this.combat.isPlayerAlive(playerIdx)) {
      this._endMicroRound();
      return;
    }
    const cls = this.selectedClasses[playerIdx];

    document.getElementById('player1-zone').classList.toggle('hidden', playerIdx !== 0);
    document.getElementById('player2-zone').classList.toggle('hidden', playerIdx !== 1 || this.mode === 'single');

    document.querySelectorAll('.player-zone').forEach((z) => z.classList.remove('active-zone'));
    const activeZone = document.getElementById(`player${playerIdx + 1}-zone`);
    activeZone.classList.remove('hidden');
    activeZone.classList.add('active-zone');

    document.getElementById(`p${playerIdx + 1}-class-icon`).textContent = cls.icon;
    document.getElementById(`p${playerIdx + 1}-class-name`).textContent = cls.name;

    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');
    indicator.textContent = `${this._getPhaseLabel(cls)}階段 — ${cls.icon} ${cls.name}！限時 ${ROUND_DURATION} 秒`;

    const container = document.getElementById(`matrix-p${playerIdx + 1}`);
    const matrix = new WordMatrix(container, {
      radical: '火',
      onCorrect: () => this._onCorrect(playerIdx, cls),
      onWrong: () => this._onWrong(playerIdx, cls),
    });
    matrix.render();
    this.matrices.push(matrix);

    if (cls.role === 'tank') {
      this.scene3d.playHeroAction(cls.id, 'block');
    } else {
      this.scene3d.playHeroAction(cls.id, cls.id === 'assassin' ? 'attack' : 'cast');
    }

    this._startTimer(() => this._endMicroRound());
  }

  _startSplitScreen() {
    this._cleanupMatrices();

    const aliveIndices = this.selectedClasses
      .map((_, i) => i)
      .filter((i) => this.combat.isPlayerAlive(i));

    document.getElementById('player1-zone').classList.toggle('hidden', !aliveIndices.includes(0));
    document.getElementById('player2-zone').classList.toggle('hidden', !aliveIndices.includes(1));
    document.querySelectorAll('.player-zone').forEach((z) => z.classList.remove('active-zone'));

    aliveIndices.forEach((i) => {
      const cls = this.selectedClasses[i];
      const zone = document.getElementById(`player${i + 1}-zone`);
      zone.classList.remove('hidden');
      zone.classList.add('active-zone');

      document.getElementById(`p${i + 1}-class-icon`).textContent = cls.icon;
      document.getElementById(`p${i + 1}-class-name`).textContent = cls.name;

      const container = document.getElementById(`matrix-p${i + 1}`);
      const matrix = new WordMatrix(container, {
        radical: '火',
        onCorrect: () => this._onCorrect(i, cls),
        onWrong: () => this._onWrong(i, cls),
      });
      matrix.render();
      this.matrices.push(matrix);

      this.scene3d.playHeroAction(
        cls.id,
        cls.role === 'tank' ? 'block' : (cls.id === 'assassin' ? 'attack' : 'cast'),
      );
    });

    document.getElementById('turn-indicator').classList.remove('hidden');
    document.getElementById('turn-indicator').textContent = '攻擊 + 防禦同時作答！限時 10 秒';

    this._startTimer(() => this._endSplitRound());
  }

  _onCorrect(playerIdx, cls) {
    this.combat.applyCorrect(playerIdx, cls);
    const player = this.combat.players[playerIdx];

    const scoreEl = document.getElementById(`p${playerIdx + 1}-score`);
    if (cls.role === 'tank') {
      scoreEl.textContent = `護盾: ${player.shield}`;
    } else if (cls.role === 'dps') {
      scoreEl.textContent = `傷害: ${player.damage}`;
    } else {
      scoreEl.textContent = `護盾: ${player.shield} / 傷害: ${player.damage}`;
    }

    if (cls.role === 'dps') {
      this.scene3d.playHeroAction(cls.id, cls.id === 'assassin' ? 'attack' : 'cast');
    } else if (cls.role === 'hybrid') {
      this.scene3d.playHeroAction(cls.id, 'attack');
    }
  }

  _onWrong(playerIdx, cls) {
    if (cls.role === 'tank') {
      this.scene3d.playHeroAction(cls.id, 'block');
    }
  }

  _startTimer(onEnd) {
    this.timeLeft = ROUND_DURATION;
    const timerEl = document.getElementById('round-timer');
    timerEl.textContent = this.timeLeft;
    timerEl.classList.remove('urgent');

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      timerEl.textContent = this.timeLeft;
      if (this.timeLeft <= 3) timerEl.classList.add('urgent');
      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
        onEnd();
      }
    }, 1000);
  }

  _endMicroRound() {
    this._cleanupMatrices();

    this.currentTurnStep++;
    if (this.currentTurnStep < this.turnOrder.length) {
      setTimeout(() => this._startMicroRound(), 600);
      return;
    }

    this._resolveCombat();
  }

  _endSplitRound() {
    this._cleanupMatrices();
    this._resolveCombat();
  }

  async _resolveCombat() {
    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');
    indicator.textContent = '⚔️ 結算中…';

    const computed = this.combat.computeRound();

    // 1. 攻擊角色 → Boss
    for (const { player } of this.combat.getAttackers()) {
      if (player.damage <= 0) continue;
      indicator.textContent = `⚔️ ${player.class.icon} ${player.class.name} 攻擊！`;
      await this.scene3d.playHeroAttackBoss(player.class.id, player.damage);
      this.combat.enemyHp = Math.max(0, this.combat.enemyHp - player.damage);
      if (this.combat.enemyHp <= 0) this.combat.victory = true;
      this._updateHpBar();
      await delay(250);
      if (this.combat.victory) break;
    }

    // 2. 防禦角色 → 護盾
    if (!this.combat.victory) {
      for (const { player } of this.combat.getDefenders()) {
        if (player.shield <= 0) continue;
        indicator.textContent = `🛡️ ${player.class.icon} ${player.class.name} 防禦！`;
        await this.scene3d.playHeroDefend(player.class.id, player.shield);
        await delay(250);
      }

      for (const { player } of this.combat.getAttackers()) {
        if (player.class.role === 'hybrid' && player.shield > 0) {
          indicator.textContent = `🛡️ ${player.class.icon} ${player.class.name} 護盾！`;
          await this.scene3d.playHeroDefend(player.class.id, player.shield);
          await delay(250);
        }
      }
    }

    // 3. Boss → 玩家
    if (!this.combat.victory && computed.enemyAttack > 0) {
      const target = this.combat.players.find((p) => p.class.role === 'tank') || this.combat.players[0];
      indicator.textContent = '👹 Boss 反擊！';
      await this.scene3d.playBossAttackPlayer(target.class.id, computed.enemyAttack);
      this.combat.applyPlayerDamage(computed.enemyAttack);
      this._updatePlayerHp();
      await delay(300);
    } else if (!this.combat.victory && computed.blocked > 0) {
      indicator.textContent = `🛡️ 護盾完全抵擋 ${computed.blocked} 點傷害！`;
      await delay(900);
    }

    if (this.combat.victory) {
      await delay(400);
      this._showVictory();
      return;
    }

    if (this.combat.defeat || this.combat.players.every((p) => p.hp <= 0)) {
      await delay(400);
      this._showDefeat();
      return;
    }

    // 雙方仍存活 → 自動進入下一回合
    this.combat.startNewRound();
    this.turnOrder = this._getTurnOrder();
    this.currentTurnStep = 0;
    this._resetRoundUI();

    if (this.turnOrder.length === 0) {
      this._showDefeat();
      return;
    }

    indicator.textContent = `第 ${this.combat.round} 回合，繼續迎戰！`;
    await delay(1400);

    this._beginRoundInput();
  }

  _updateHpBar() {
    const pct = this.combat.getHpPercent();
    document.getElementById('enemy-hp-bar').style.width = `${pct}%`;
    document.getElementById('enemy-hp-text').textContent =
      `${this.combat.enemyHp} / ${this.combat.enemyMaxHp}`;
  }

  _updatePlayerHp() {
    this.combat.players.forEach((p, i) => {
      const el = document.getElementById(`player-hp-${i}`);
      if (!el) return;
      const pct = (p.hp / p.maxHp) * 100;
      el.querySelector('.player-hp-fill').style.width = `${pct}%`;
      el.querySelector('.hp-text').textContent = `${p.hp} / ${p.maxHp}`;
    });
  }

  async _showVictory() {
    document.getElementById('turn-indicator').classList.add('hidden');
    this.scene3d.playEnemyDeath();
    const heroClass = this.selectedClasses.find((c) => c.role === 'dps') || this.selectedClasses[0];
    await this.scene3d.unlockEquipment(heroClass.id);

    document.getElementById('equipment-unlock').classList.remove('hidden');
    const totalDmg = this.combat.battleTotalDamage + this.combat.totalDamage;
    const totalShield = this.combat.battleTotalShield + this.combat.totalShield;
    document.getElementById('result-title').textContent = '🎉 勝利！魔王已被擊敗！';
    document.getElementById('result-stats').innerHTML = `
      <p>經過 ${this.combat.round} 回合</p>
      <p>累計護盾: ${totalShield}</p>
      <p>累計傷害: ${totalDmg}</p>
      <p>答對字數: ${this.combat.players.map((p) => p.correctCount).join(' / ')}</p>
    `;
    this._showScreen('screen-result');
  }

  _showDefeat() {
    document.getElementById('equipment-unlock').classList.add('hidden');
    const totalDmg = this.combat.battleTotalDamage + this.combat.totalDamage;
    document.getElementById('result-title').textContent = '💀 戰敗…';
    document.getElementById('result-stats').innerHTML = `
      <p>經過 ${this.combat.round} 回合後隊伍全滅</p>
      <p>累計造成傷害: ${totalDmg}</p>
      <p>魔王剩餘 HP: ${this.combat.enemyHp}</p>
    `;
    this._showScreen('screen-result');
  }

  _goToMenu() {
    this._cleanupMatrices();
    this.combat.reset();
    this.selectedClasses = [];
    this.turnOrder = [];
    this.currentTurnStep = 0;
    this.scene3d.clearScene();
    this.scene3d.loadEnemy(ENEMY.modelPath);
    document.getElementById('equipment-unlock').classList.add('hidden');
    this._showScreen('screen-menu');
  }

  _cleanupMatrices() {
    this.matrices.forEach((m) => m.destroy());
    this.matrices = [];
    clearInterval(this.timerInterval);
  }

  _showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    const isBattle = id === 'screen-battle';
    document.getElementById('app').classList.toggle('battle-active', isBattle);
    if (this.scene3d) {
      this.scene3d.setBattleLayout(isBattle);
    }
  }
}
