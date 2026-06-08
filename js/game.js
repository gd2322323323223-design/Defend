/**
 * 遊戲主狀態機
 */

import { WordMatrix } from './matrix.js';
import { CLASSES, ENEMY, getRandomTaunt } from './ai-taunt.js';
import {
  computeBossPhase,
  applyBossPhaseResult,
  CombatState,
  getBossRoundInfo,
  getDamageHitsForResolve,
  ROUND_DURATION,
  TEAM_MAX_HP,
  sumPlayerHits,
} from './combat.js';
import { assignFormationSlots } from './models-config.js';
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
    this.formationSlots = [];
    this.scene3d = null;
    this._resolving = false;
    this._bindUI();
  }

  _bindUI() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this._selectMode(btn.dataset.mode));
    });

    document.getElementById('btn-start-battle').addEventListener('click', () => this._startTaunt());
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

    const maxPlayers = this.mode === 'dual' ? 2 : 1;
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
    const maxPlayers = this.mode === 'dual' ? 2 : 1;
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

  _getTurnOrder() {
    if (this.mode === 'dual') return [0, 1];
    return [0];
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

    const countdownEl = document.getElementById('taunt-countdown');
    countdownEl.textContent = '2 秒後進入戰鬥…';
    await delay(1000);
    countdownEl.textContent = '1 秒後進入戰鬥…';
    await delay(1000);
    await this._startBattle();
  }

  async _startBattle() {
    this.combat.reset();
    this.selectedClasses.forEach((cls) => this.combat.addPlayer(cls));

    const formation = assignFormationSlots(this.selectedClasses);
    this.formationSlots = formation.map(({ index, slot }) => ({
      classId: this.selectedClasses[index].id,
      slot,
    }));

    await Promise.all(
      formation.map(({ index, slot }) => {
        const cls = this.selectedClasses[index];
        return this.scene3d.loadHero(cls.id, cls.modelPath, slot, cls.defaultEquipment);
      }),
    );
    this.scene3d.layoutBattleFormation(this.formationSlots);
    this.scene3d.setHeroLabels(
      this.selectedClasses.map((cls, i) => ({
        classId: cls.id,
        playerIndex: i,
        label: cls.name,
      })),
    );

    this.combat.round = 1;
    this.turnOrder = this._getTurnOrder();
    this.currentTurnStep = 0;

    this._setupBattleUI();
    this._showScreen('screen-battle');
    this._beginRoundInput();
  }

  _beginRoundInput() {
    this._startTurn();
  }

  _resetRoundUI() {
    this.selectedClasses.forEach((_, i) => {
      const scoreEl = document.getElementById(`p${i + 1}-score`);
      if (scoreEl) scoreEl.textContent = '答對: 0';
    });
  }

  _setupBattleUI() {
    const row = document.getElementById('players-row');
    row.className = 'players-row';
    if (this.mode === 'single') row.classList.add('solo');
    else if (this.mode === 'dual') row.classList.add('dual');

    const teamHp = document.getElementById('team-hp-floating');
    if (teamHp) teamHp.classList.remove('hidden');

    if (this.mode === 'dual') {
      document.getElementById('player1-zone').classList.remove('hidden');
      document.getElementById('player2-zone').classList.remove('hidden');
      this.selectedClasses.forEach((cls, i) => {
        document.getElementById(`p${i + 1}-class-icon`).textContent = cls.icon;
        document.getElementById(`p${i + 1}-class-name`).textContent = cls.name;
      });
    }

    this._updateHpBar();
    this._updateTeamHp();
  }

  _updateZoneStates(activePlayerIdx) {
    const isDual = this.mode === 'dual';

    if (isDual) {
      document.getElementById('player1-zone').classList.remove('hidden');
      document.getElementById('player2-zone').classList.remove('hidden');
      [0, 1].forEach((i) => {
        const zone = document.getElementById(`player${i + 1}-zone`);
        const matrixEl = document.getElementById(`matrix-p${i + 1}`);
        zone.classList.toggle('active-zone', i === activePlayerIdx);
        zone.classList.toggle('inactive-zone', i !== activePlayerIdx);
        if (i !== activePlayerIdx) matrixEl.innerHTML = '';
      });
    } else {
      document.getElementById('player1-zone').classList.remove('hidden');
      document.getElementById('player2-zone').classList.add('hidden');
      document.getElementById('player1-zone').classList.add('active-zone');
      document.getElementById('player1-zone').classList.remove('inactive-zone');
    }
  }

  _startTurn() {
    this._cleanupMatrices();
    const playerIdx = this.turnOrder[this.currentTurnStep];
    if (playerIdx === undefined) {
      this._endTurn();
      return;
    }
    const cls = this.selectedClasses[playerIdx];

    this._updateZoneStates(playerIdx);

    document.getElementById(`p${playerIdx + 1}-class-icon`).textContent = cls.icon;
    document.getElementById(`p${playerIdx + 1}-class-name`).textContent = cls.name;

    if (this.mode === 'dual') {
      const otherIdx = playerIdx === 0 ? 1 : 0;
      if (this.selectedClasses[otherIdx]) {
        const otherCls = this.selectedClasses[otherIdx];
        document.getElementById(`p${otherIdx + 1}-class-icon`).textContent = otherCls.icon;
        document.getElementById(`p${otherIdx + 1}-class-name`).textContent = otherCls.name;
      }
    }

    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');
    indicator.textContent = `第 ${this.combat.round} 回合 — ${this._getPhaseLabel(cls)}階段 — ${cls.icon} ${cls.name}！限時 ${ROUND_DURATION} 秒`;

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

    this._startTimer(() => this._endTurn());
  }

  _onCorrect(playerIdx, cls) {
    this.combat.applyCorrect(playerIdx, cls);
    const player = this.combat.players[playerIdx];

    const scoreEl = document.getElementById(`p${playerIdx + 1}-score`);
    scoreEl.textContent = `答對: ${player.roundScore}`;

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

  _endTurn() {
    if (this._resolving) return;
    this._cleanupMatrices();
    this._resolving = true;
    this._finishPlayerTurn().finally(() => {
      this._resolving = false;
    });
  }

  async _finishPlayerTurn() {
    const playerIdx = this.turnOrder[this.currentTurnStep];
    if (playerIdx !== undefined) {
      await this._resolvePlayerCombat(playerIdx);
      if (this.combat.victory) {
        await delay(300);
        this._showVictory();
        return;
      }
    }

    this.currentTurnStep++;
    if (this.currentTurnStep < this.turnOrder.length) {
      setTimeout(() => this._startTurn(), 500);
      return;
    }

    await this._resolveBossTurn();
  }

  async _resolvePlayerCombat(playerIdx) {
    const player = this.combat.players[playerIdx];
    const cls = this.selectedClasses[playerIdx];
    const indicator = document.getElementById('turn-indicator');

    const damageHits = getDamageHitsForResolve(player, cls.id);
    const totalDamage = damageHits.reduce((s, h) => s + h.amount, 0);
    const totals = sumPlayerHits(player);

    if (damageHits.length) {
      indicator.classList.remove('hidden');
      indicator.textContent = damageHits.some((h) => h.crit)
        ? `⚔️ ${cls.icon} ${cls.name} 暴擊！`
        : `⚔️ ${cls.icon} ${cls.name} 攻擊！`;
      await this.scene3d.playHeroAttackHits(cls.id, damageHits, (hit) => {
        this.combat.enemyHp = Math.max(0, this.combat.enemyHp - hit.amount);
        this._updateHpBar();
        if (this.combat.enemyHp <= 0) this.combat.victory = true;
      });
      this.combat.battleTotalDamage += totalDamage;
      if (this.combat.victory) return;
    }

    if (player.shieldHits.length) {
      indicator.classList.remove('hidden');
      indicator.textContent = `🛡️ ${cls.icon} ${cls.name} 防禦！`;
      await this.scene3d.playHeroShieldHits(cls.id, player.shieldHits);
      this.combat.battleTotalShield += totals.shield;
    }
  }

  async _resolveBossTurn() {
    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');

    const preview = getBossRoundInfo(this.combat.round);
    let bossHint = `👹 Boss 準備 ${preview.label}（${preview.rawDamage} 傷）`;
    if (this.combat.bossIsDebuffed) bossHint += ' — 寒冰凍結生效，傷害減半！';
    indicator.textContent = bossHint;
    await delay(700);

    const result = computeBossPhase(this.combat, this.combat.round);

    if (!this.combat.victory) {
      if (result.damageReceived > 0) {
        indicator.textContent = `👹 Boss ${result.bossRound.label}！`;
        await this.scene3d.playBossAttackTeam(result.damageReceived);
        this.combat.teamHp = Math.max(0, this.combat.teamHp - result.damageReceived);
        this._updateTeamHp();
        if (this.combat.teamHp <= 0) this.combat.defeat = true;
      } else if (result.blocked > 0) {
        indicator.textContent = `🛡️ 護盾完全抵擋 ${Math.round(result.blocked)} 點傷害！`;
        await delay(700);
      }

      if (result.bossHeal > 0) {
        indicator.textContent = `👹 Boss 吸血回復 ${Math.round(result.bossHeal)}！`;
        this.combat.enemyHp += result.bossHeal;
        await this.scene3d.playBossHeal(result.bossHeal);
        this._updateHpBar();
      }
    }

    applyBossPhaseResult(this.combat, result);

    if (result.debuffTriggered) {
      indicator.textContent = '🔮 法師寒冰凍結！下回合 Boss 傷害減半';
      await delay(800);
    }

    if (this.combat.victory) {
      await delay(300);
      this._showVictory();
      return;
    }

    if (this.combat.defeat || !this.combat.isTeamAlive()) {
      await delay(300);
      this._showDefeat();
      return;
    }

    this.combat.startNewRound();
    this.turnOrder = this._getTurnOrder();
    this.currentTurnStep = 0;
    this._resetRoundUI();

    const nextBoss = getBossRoundInfo(this.combat.round);
    indicator.textContent = `第 ${this.combat.round} 回合 — Boss 將發動${nextBoss.label}`;
    await delay(1000);
    this._beginRoundInput();
  }

  _updateHpBar() {
    const pct = this.combat.getHpPercent();
    document.getElementById('enemy-hp-bar').style.width = `${pct}%`;
    document.getElementById('enemy-hp-text').textContent =
      `${Math.round(this.combat.enemyHp)} / ${this.combat.enemyMaxHp}`;
  }

  _updateTeamHp() {
    const bar = document.getElementById('team-hp-bar');
    const text = document.getElementById('team-hp-text');
    if (!bar || !text) return;
    const pct = this.combat.getTeamHpPercent();
    bar.style.width = `${pct}%`;
    text.textContent = `${Math.round(this.combat.teamHp)} / ${this.combat.teamMaxHp}`;
  }

  async _showVictory() {
    document.getElementById('turn-indicator').classList.add('hidden');
    this.scene3d.playEnemyDeath();
    const heroClass = this.selectedClasses.find((c) => c.role === 'dps') || this.selectedClasses[0];
    await this.scene3d.unlockEquipment(heroClass.id);

    document.getElementById('equipment-unlock').classList.remove('hidden');
    document.getElementById('result-title').textContent = '🎉 勝利！魔王已被擊敗！';
    document.getElementById('result-stats').innerHTML = `
      <p>經過 ${this.combat.round} 回合</p>
      <p>累計護盾: ${Math.round(this.combat.battleTotalShield)}</p>
      <p>累計傷害: ${Math.round(this.combat.battleTotalDamage)}</p>
      <p>答對字數: ${this.combat.players.map((p) => p.correctCount).join(' / ')}</p>
    `;
    this._showScreen('screen-result');
  }

  _showDefeat() {
    document.getElementById('turn-indicator').classList.add('hidden');
    document.getElementById('equipment-unlock').classList.add('hidden');
    document.getElementById('result-title').textContent = '💀 戰敗…';
    document.getElementById('result-stats').innerHTML = `
      <p>經過 ${this.combat.round} 回合後隊伍全滅</p>
      <p>累計造成傷害: ${Math.round(this.combat.battleTotalDamage)}</p>
      <p>魔王剩餘 HP: ${Math.round(this.combat.enemyHp)}</p>
    `;
    this._showScreen('screen-result');
  }

  _goToMenu() {
    this._cleanupMatrices();
    this.combat.reset();
    this.selectedClasses = [];
    this.turnOrder = [];
    this.currentTurnStep = 0;
    this.formationSlots = [];
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
    const bossHp = document.getElementById('boss-head-stack');
    const teamHp = document.getElementById('team-hp-floating');
    if (bossHp && !isBattle) bossHp.classList.add('hidden');
    if (teamHp) teamHp.classList.toggle('hidden', !isBattle);
    if (this.scene3d) {
      this.scene3d.setBattleLayout(isBattle);
    }
  }
}
