/**
 * 遊戲主狀態機
 */

import { WordMatrix } from './matrix.js';
import { CLASSES, ENEMY, getRandomTaunt } from './ai-taunt.js';
import { CombatState, ROUND_DURATION } from './combat.js';
import { Scene3D } from './scene3d.js';

export class Game {
  constructor() {
    this.mode = null;
    this.selectedClasses = [];
    this.combat = new CombatState();
    this.matrices = [];
    this.timerInterval = null;
    this.timeLeft = ROUND_DURATION;
    this.currentPlayerIndex = 0;
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
      : '玩家 1 選騎士（坦），玩家 2 選法師（打）';
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

    if (this.mode !== 'single' && this.selectedClasses.length === 2) {
      const hasKnight = this.selectedClasses.some((c) => c.id === 'knight');
      const hasMage = this.selectedClasses.some((c) => c.id === 'mage');
      if (!hasKnight || !hasMage) {
        document.getElementById('btn-start-battle').disabled = true;
        return;
      }
    }

    document.getElementById('btn-start-battle').disabled =
      this.selectedClasses.length < maxPlayers;
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
      const side = i === 0 ? 'left' : 'right';
      await this.scene3d.loadHero(
        this.selectedClasses[i].id,
        this.selectedClasses[i].modelPath,
        side,
      );
    }

    this._setupBattleUI();
    this._showScreen('screen-battle');

    if (this.mode === 'dual-sequential') {
      this.currentPlayerIndex = 0;
      this._startMicroRound();
    } else if (this.mode === 'dual-split') {
      this._startSplitScreen();
    } else {
      this.currentPlayerIndex = 0;
      this._startMicroRound();
    }
  }

  _setupBattleUI() {
    const arena = document.getElementById('battle-arena');
    arena.className = 'battle-arena';
    if (this.mode === 'dual-split') {
      arena.classList.add('split');
    } else {
      arena.classList.add('sequential');
    }

    const statusEl = document.getElementById('player-status');
    statusEl.innerHTML = '';
    this.selectedClasses.forEach((cls, i) => {
      const chip = document.createElement('span');
      chip.className = `status-chip ${cls.role === 'tank' ? 'shield' : 'damage'}`;
      chip.id = `status-p${i}`;
      chip.textContent = `${cls.icon} ${cls.name}: 0`;
      statusEl.appendChild(chip);
    });

    this._updateHpBar();
  }

  _startMicroRound() {
    this._cleanupMatrices();
    const playerIdx = this.currentPlayerIndex;
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
    indicator.textContent = `${cls.icon} ${cls.name} 的回合！限時 ${ROUND_DURATION} 秒`;

    const container = document.getElementById(`matrix-p${playerIdx + 1}`);
    const matrix = new WordMatrix(container, {
      radical: '火',
      onCorrect: (char) => this._onCorrect(playerIdx, cls, char),
      onWrong: () => this._onWrong(playerIdx, cls),
    });
    matrix.render();
    this.matrices.push(matrix);

    if (cls.role === 'tank') {
      this.scene3d.playHeroAction(cls.id, 'block');
    } else {
      this.scene3d.playHeroAction(cls.id, 'cast');
    }

    this._startTimer(() => this._endMicroRound());
  }

  _startSplitScreen() {
    this._cleanupMatrices();

    document.getElementById('player1-zone').classList.remove('hidden');
    document.getElementById('player2-zone').classList.remove('hidden');
    document.querySelectorAll('.player-zone').forEach((z) => z.classList.add('active-zone'));

    this.selectedClasses.forEach((cls, i) => {
      document.getElementById(`p${i + 1}-class-icon`).textContent = cls.icon;
      document.getElementById(`p${i + 1}-class-name`).textContent = cls.name;

      const container = document.getElementById(`matrix-p${i + 1}`);
      const matrix = new WordMatrix(container, {
        radical: '火',
        onCorrect: (char) => this._onCorrect(i, cls, char),
        onWrong: () => this._onWrong(i, cls),
      });
      matrix.render();
      this.matrices.push(matrix);

      this.scene3d.playHeroAction(cls.id, cls.role === 'tank' ? 'block' : 'cast');
    });

    document.getElementById('turn-indicator').classList.remove('hidden');
    document.getElementById('turn-indicator').textContent = '雙人同時作答！限時 10 秒';

    this._startTimer(() => this._endSplitRound());
  }

  _onCorrect(playerIdx, cls, char) {
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

    const statusEl = document.getElementById(`status-p${playerIdx}`);
    if (statusEl) {
      statusEl.textContent = `${cls.icon} ${cls.name}: ${player.correctCount} 字`;
    }

    if (cls.role === 'dps' || cls.role === 'hybrid') {
      this.scene3d.playHeroAction(cls.id, 'cast');
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

    const nextPlayer = this.currentPlayerIndex + 1;
    const isSequential = this.mode === 'dual-sequential';

    if (isSequential && nextPlayer < this.selectedClasses.length) {
      this.currentPlayerIndex = nextPlayer;
      setTimeout(() => this._startMicroRound(), 800);
      return;
    }

    this._resolveCombat();
  }

  _endSplitRound() {
    this._cleanupMatrices();
    this._resolveCombat();
  }

  _resolveCombat() {
    const result = this.combat.resolveRound();

    this.scene3d.shakeEnemy();
    this._updateHpBar();

    document.getElementById('turn-indicator').classList.add('hidden');

    setTimeout(() => {
      if (result.victory) {
        this._showVictory();
      } else if (this.combat.enemyHp > 0) {
        this._showRoundResult(result);
      }
    }, 1200);
  }

  _updateHpBar() {
    const pct = this.combat.getHpPercent();
    document.getElementById('enemy-hp-bar').style.width = `${pct}%`;
    document.getElementById('enemy-hp-text').textContent =
      `${this.combat.enemyHp} / ${this.combat.enemyMaxHp}`;
  }

  async _showVictory() {
    const heroClass = this.selectedClasses.find((c) => c.role === 'dps') || this.selectedClasses[0];
    await this.scene3d.unlockEquipment(heroClass.id);

    const unlockEl = document.getElementById('equipment-unlock');
    unlockEl.classList.remove('hidden');

    document.getElementById('result-title').textContent = '🎉 勝利！魔王已被擊敗！';
    document.getElementById('result-stats').innerHTML = `
      <p>總護盾: ${this.combat.totalShield}</p>
      <p>總傷害: ${this.combat.totalDamage}</p>
      <p>剩餘回合字數: ${this.combat.players.map((p) => p.correctCount).join(' / ')}</p>
    `;

    this._showScreen('screen-result');
  }

  _showRoundResult(result) {
    document.getElementById('equipment-unlock').classList.add('hidden');
    document.getElementById('result-title').textContent = '回合結算';
    document.getElementById('result-stats').innerHTML = `
      <p>造成傷害: ${result.damageDealt}</p>
      <p>抵擋攻擊: ${result.damageBlocked}</p>
      <p>敵方剩餘 HP: ${result.enemyHp}</p>
      <p style="color:#ef5350; margin-top:12px;">魔王還沒死！再戰一局！</p>
    `;
    this._showScreen('screen-result');
  }

  _goToMenu() {
    this._cleanupMatrices();
    this.combat.reset();
    this.selectedClasses = [];
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
  }
}
