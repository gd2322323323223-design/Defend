/**
 * 遊戲主狀態機
 */

import { WordMatrix } from '@/matrix.js';
import { CLASSES, ENEMY, RAGE_HERO, getRandomTaunt } from '@/ai-taunt.js';
import {
  computeBossPhase,
  applyBossPhaseResult,
  applySoloRoundBonuses,
  CombatState,
  formatCombatNumber,
  getBossRoundInfo,
  getDamageHitsForResolve,
  getShieldHitsForResolve,
  getRoundShieldTotal,
  prepareNextRound,
  ROUND_DURATION,
} from '@/combat.js';
import { assignFormationSlots } from '@/models-config.js';
import { Scene3D } from '@/scene3d.js';
import { ClassPreviewManager } from '@/class-preview.js';
import { VictoryDisplay } from '@/victory-display.js';
import { delay } from '@/vfx.js';
import {
  getSettings,
  updateSettings,
  loadSettingsFromURL,
  getDifficulty,
  getRadicalTheme,
  getRoundDuration,
  getBossHpOverride,
  getTeamHpOverride,
} from '@/settings.js';
import { sound } from '@/audio.js';
import { getSynergyHint, getClassPickHint } from '@/class-synergy.js';
import {
  getBossAttackBanner,
  getRoundTacticalHint,
  getEducationalRecap,
} from '@/tactical-hints.js';
import { BattleStats } from '@/battle-stats.js';

export class Game {
  constructor() {
    this.mode = null;
    this.selectedClasses = [];
    this.combat = new CombatState();
    this.battleStats = new BattleStats();
    this.matrices = [];
    this.timerInterval = null;
    this.timeLeft = ROUND_DURATION;
    this.turnOrder = [];
    this.currentTurnStep = 0;
    this.formationSlots = [];
    this.scene3d = null;
    this.classPreviews = new ClassPreviewManager();
    this.victoryDisplay = new VictoryDisplay();
    this._resolving = false;
    this._victoryPlaying = false;
    this._activePlayerIdx = null;
    this._tauntInProgress = false;
    this._bindUI();
  }

  _bindUI() {
    const unlockAudio = () => {
      sound.unlock();
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this._selectMode(btn.dataset.mode));
    });

    document.getElementById('btn-start-battle').addEventListener('click', () => this._startTaunt());
    document.getElementById('btn-replay').addEventListener('click', () => this._goToMenu());
    document.getElementById('btn-teacher-toggle')?.addEventListener('click', () => {
      document.getElementById('teacher-panel')?.classList.toggle('hidden');
    });
    document.getElementById('btn-teacher-apply')?.addEventListener('click', () => this._applyTeacherSettings());
    document.getElementById('btn-safari-check')?.addEventListener('click', () => {
      document.getElementById('safari-check-modal')?.classList.remove('hidden');
    });
    document.getElementById('btn-safari-close')?.addEventListener('click', () => {
      document.getElementById('safari-check-modal')?.classList.add('hidden');
    });
  }

  _applyTeacherSettings() {
    const diff = document.getElementById('setting-difficulty')?.value || 'normal';
    const radical = document.getElementById('setting-radical')?.value || '火';
    const roundTime = Number(document.getElementById('setting-round-time')?.value) || null;
    const bossHp = Number(document.getElementById('setting-boss-hp')?.value) || null;
    const teamHp = Number(document.getElementById('setting-team-hp')?.value) || null;
    updateSettings({
      difficulty: diff,
      radical,
      roundDuration: roundTime,
      bossHp,
      teamHp,
      spectator: document.getElementById('setting-spectator')?.checked ?? false,
      classHints: document.getElementById('setting-class-hints')?.checked ?? true,
      tacticalHints: document.getElementById('setting-tactical-hints')?.checked ?? true,
      teacherMode: true,
    });
    this._syncSettingsUI();
    document.getElementById('teacher-panel')?.classList.add('hidden');
  }

  _syncSettingsUI() {
    const s = getSettings();
    const diff = getDifficulty();
    const theme = getRadicalTheme();
    document.getElementById('setting-difficulty')?.setAttribute('value', s.difficulty);
    const diffEl = document.getElementById('setting-difficulty');
    if (diffEl) diffEl.value = s.difficulty;
    const radEl = document.getElementById('setting-radical');
    if (radEl) radEl.value = s.radical;
    const rt = document.getElementById('setting-round-time');
    if (rt) rt.value = s.roundDuration || '';
    const bh = document.getElementById('setting-boss-hp');
    if (bh) bh.value = s.bossHp || '';
    const th = document.getElementById('setting-team-hp');
    if (th) th.value = s.teamHp || '';
    const spec = document.getElementById('setting-spectator');
    if (spec) spec.checked = s.spectator;
    const ch = document.getElementById('setting-class-hints');
    if (ch) ch.checked = s.classHints;
    const thint = document.getElementById('setting-tactical-hints');
    if (thint) thint.checked = s.tacticalHints;
    const label = document.getElementById('menu-radical-label');
    if (label) label.textContent = `本局字部：${theme.label} · ${diff.label}`;
    if (s.teacherMode) {
      document.getElementById('teacher-panel')?.classList.remove('hidden');
    }
  }

  _updateLoadProgress(fraction, done, total) {
    const fill = document.getElementById('load-progress-fill');
    const text = document.getElementById('load-progress-text');
    const pct = Math.round(fraction * 100);
    if (fill) fill.style.width = `${pct}%`;
    if (text) {
      text.textContent = fraction >= 1
        ? '資源已就緒 ✓'
        : `資源載入中… ${pct}%（${done}/${total}）`;
    }
    if (fraction >= 1) {
      document.getElementById('load-progress-wrap')?.classList.add('loaded');
    }
  }

  _updateBossBanner() {
    const el = document.getElementById('boss-next-banner');
    if (!el || !this.combat.round) return;
    el.textContent = getBossAttackBanner(this.combat.round, this.combat);
  }

  _updateTacticalHint(cls, score) {
    const bar = document.getElementById('tactical-hint-bar');
    if (!bar || !getSettings().tacticalHints) {
      bar?.classList.add('hidden');
      return;
    }
    bar.textContent = getRoundTacticalHint(this.combat, cls, score);
    bar.classList.remove('hidden');
  }

  _updateSynergyHint() {
    const el = document.getElementById('class-synergy-hint');
    if (!el || !getSettings().classHints || this.mode !== 'dual') {
      el?.classList.add('hidden');
      return;
    }
    const ids = this.selectedClasses.map((c) => c.id);
    if (ids.length === 2) {
      el.textContent = getSynergyHint(ids);
      el.classList.remove('hidden');
    } else if (ids.length === 1) {
      el.textContent = '再選一個職業，查看協同搭配建議';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  _renderEducationalRecap() {
    const el = document.getElementById('result-edu-recap');
    if (!el) return;
    el.innerHTML = getEducationalRecap(
      this.battleStats,
      this.combat,
      this.selectedClasses,
      getRadicalTheme().label,
    );
  }

  init() {
    loadSettingsFromURL();
    this._syncSettingsUI();
    const canvas = document.getElementById('scene-canvas');
    this.scene3d = new Scene3D(canvas);
    this.scene3d.preloadEssentials((f, d, t) => this._updateLoadProgress(f, d, t));
    this.scene3d.loadEnemy(ENEMY.modelPath, ENEMY.defaultEquipment);
    this._showScreen('screen-menu');
  }

  _selectMode(mode) {
    sound.unlock();
    this.mode = mode;
    const app = document.getElementById('app');
    app.classList.remove('mode-solo', 'mode-dual');
    app.classList.add(mode === 'single' ? 'mode-solo' : 'mode-dual');
    if (mode === 'single') {
      this.selectedClasses = [RAGE_HERO];
      this._startTaunt();
      return;
    }
    this.selectedClasses = [];
    this._renderClassSelection();
    this._showScreen('screen-class');
  }

  _renderClassSelection() {
    this.classPreviews.dispose();
    const grid = document.getElementById('class-grid');
    grid.innerHTML = '';

    const maxPlayers = this.mode === 'dual' ? 2 : 1;
    const hint = document.createElement('p');
    hint.className = 'class-select-hint';
    hint.textContent = maxPlayers === 1
      ? '選擇 1 個職業'
      : '玩家 1 與玩家 2 各選一個職業';
    grid.appendChild(hint);

    Object.values(CLASSES).forEach((cls) => {
      const card = document.createElement('div');
      card.className = `class-card class-card-${cls.id}`;
      card.dataset.classId = cls.id;
      card.innerHTML = `
        <div class="class-preview-wrap"></div>
        <span class="name">${cls.name}</span>
        <span class="desc">${cls.desc}</span>
      `;
      card.addEventListener('click', () => this._toggleClass(cls, card));
      grid.appendChild(card);
    });

    this.classPreviews.mountAll(Object.values(CLASSES));
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
    this._updateSynergyHint();
  }

  _getTurnOrder() {
    if (this.mode === 'dual') return [0, 1];
    return [0];
  }

  _getPhaseLabel(cls) {
    if (cls.role === 'rage') return '狂暴';
    if (cls.role === 'tank') return '防禦';
    if (cls.role === 'dps') return '攻擊';
    return '出擊';
  }

  async _startTaunt() {
    if (this._tauntInProgress) return;
    this._tauntInProgress = true;

    const startBtn = document.getElementById('btn-start-battle');
    const countdownEl = document.getElementById('taunt-countdown');
    if (startBtn) startBtn.disabled = true;

    try {
      document.getElementById('taunt-text').textContent = getRandomTaunt();
      this._showScreen('screen-taunt');
      this.scene3d.clearScene();

      const loadEnemyTask = this.scene3d.loadEnemy(ENEMY.modelPath, ENEMY.defaultEquipment);
      countdownEl.textContent = '2 秒後進入戰鬥…';
      await delay(1000);
      countdownEl.textContent = '1 秒後進入戰鬥…';
      await Promise.all([delay(1000), loadEnemyTask]);
      countdownEl.textContent = '進入戰鬥！';
      await this._startBattle();
    } catch (err) {
      console.error('進入戰鬥失敗', err);
      countdownEl.textContent = '載入失敗，請重試…';
      if (startBtn) startBtn.disabled = false;
      this._showScreen('screen-class');
    } finally {
      this._tauntInProgress = false;
    }
  }

  async _startBattle() {
    this.battleStats.reset();
    this.combat.reset(this.mode, {
      bossHp: getBossHpOverride(),
      teamHp: getTeamHpOverride(),
    });
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
    this._updateBossBanner();
    this._showScreen('screen-battle');
    document.getElementById('app').classList.toggle('spectator-mode', getSettings().spectator);
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
    this._updateRoundShield();
  }

  _setupBattleUI() {
    const row = document.getElementById('players-row');
    row.className = 'players-row';
    if (this.mode === 'single') row.classList.add('solo');
    else if (this.mode === 'dual') row.classList.add('dual');

    const teamHp = document.getElementById('team-hp-floating');
    if (teamHp) teamHp.classList.remove('hidden');

    document.getElementById('player1-zone').classList.remove('hidden');
    const cls0 = this.selectedClasses[0];
    if (cls0) {
      document.getElementById('p1-class-icon').textContent = cls0.icon;
      document.getElementById('p1-class-name').textContent = cls0.name;
    }

    if (this.mode === 'dual') {
      document.getElementById('player2-zone').classList.remove('hidden');
      const cls1 = this.selectedClasses[1];
      if (cls1) {
        document.getElementById('p2-class-icon').textContent = cls1.icon;
        document.getElementById('p2-class-name').textContent = cls1.name;
      }
    }

    this._updateHpBar();
    this._updateTeamHp();
    this._updateRoundShield();
  }

  _updateRoundShield() {
    const row = document.getElementById('team-shield-row');
    const text = document.getElementById('team-shield-text');
    if (!row || !text) return;
    const shield = getRoundShieldTotal(this.combat);
    if (shield > 0) {
      row.classList.remove('hidden');
      text.textContent = formatCombatNumber(shield);
    } else {
      row.classList.add('hidden');
    }
  }

  _hideAllZoneTimers() {
    [1, 2].forEach((n) => {
      document.getElementById(`p${n}-zone-timer`)?.classList.add('hidden');
      document.getElementById(`p${n}-ready-btn`)?.classList.add('hidden');
    });
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
    this._activePlayerIdx = playerIdx;

    this._updateZoneStates(playerIdx);
    this._hideAllZoneTimers();

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
    const radicalLabel = getRadicalTheme().label;
    if (this.combat.isSolo) {
      indicator.textContent = `第 ${this.combat.round} 回合 — ${cls.icon} 看到「${radicalLabel}」字就瘋狂點擊！`;
    } else {
      indicator.textContent = `第 ${this.combat.round} 回合 — ${this._getPhaseLabel(cls)}階段 — ${cls.icon} ${cls.name}`;
    }
    this._updateTacticalHint(cls, 0);
    this._updateBossBanner();

    const matrixEl = document.getElementById(`matrix-p${playerIdx + 1}`);
    matrixEl.innerHTML = '';
    matrixEl.classList.add('hidden');

    const readyBtn = document.getElementById(`p${playerIdx + 1}-ready-btn`);
    readyBtn.classList.remove('hidden');
    readyBtn.onclick = () => this._onPlayerReady(playerIdx, cls);

    if (this.combat.isSolo) {
      this.scene3d.playHeroAction(cls.id, 'attack');
    } else if (cls.role === 'tank') {
      this.scene3d.playHeroAction(cls.id, 'block');
    } else {
      this.scene3d.playHeroAction(cls.id, cls.id === 'assassin' ? 'attack' : 'cast');
    }
  }

  _onPlayerReady(playerIdx, cls) {
    const readyBtn = document.getElementById(`p${playerIdx + 1}-ready-btn`);
    readyBtn.classList.add('hidden');
    readyBtn.onclick = null;

    const matrixEl = document.getElementById(`matrix-p${playerIdx + 1}`);
    matrixEl.classList.remove('hidden');

    const diff = getDifficulty();
    const matrix = new WordMatrix(matrixEl, {
      radical: getRadicalTheme().radical,
      theme: getRadicalTheme(),
      targetCells: diff.targetCells,
      wrongCooldownMs: diff.wrongCooldownMs,
      onCorrect: (char) => this._onCorrect(playerIdx, cls, char),
      onWrong: () => this._onWrong(playerIdx, cls),
    });
    matrix.render();
    this.matrices.push(matrix);

    const roundSec = getRoundDuration();
    const indicator = document.getElementById('turn-indicator');
    indicator.textContent = `第 ${this.combat.round} 回合 — ${cls.icon} ${cls.name} — 限時 ${roundSec} 秒`;

    this._startZoneTimer(playerIdx, () => this._endTurn(), roundSec);
  }

  _startZoneTimer(playerIdx, onEnd, duration = null) {
    this.timeLeft = duration ?? getRoundDuration();
    const timerEl = document.getElementById(`p${playerIdx + 1}-zone-timer`);
    timerEl.textContent = this.timeLeft;
    timerEl.classList.remove('hidden', 'urgent');

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      timerEl.textContent = this.timeLeft;
      if (this.timeLeft <= 3) timerEl.classList.add('urgent');
      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
        timerEl.classList.add('hidden');
        onEnd();
      }
    }, 1000);
  }

  _onCorrect(playerIdx, cls, char) {
    this.combat.applyCorrect(playerIdx, cls);
    const player = this.combat.players[playerIdx];
    this.battleStats.recordCorrect(char, playerIdx);
    sound.playCorrect();
    this._updateTacticalHint(cls, player.roundScore);

    const scoreEl = document.getElementById(`p${playerIdx + 1}-score`);
    scoreEl.textContent = `答對: ${player.roundScore}`;

    if (this.combat.isSolo) {
      this._updateRoundShield();
      const action = player.roundScore % 2 === 0 ? 'attack' : 'block';
      this.scene3d.playHeroAction(cls.id, action);
      return;
    }

    if (cls.role === 'tank') {
      this._updateRoundShield();
    }

    if (cls.role === 'dps') {
      this.scene3d.playHeroAction(cls.id, cls.id === 'assassin' ? 'attack' : 'cast');
    }
  }

  _onWrong(playerIdx, cls) {
    sound.playWrong();
    if (cls.role === 'tank') {
      this.scene3d.playHeroAction(cls.id, 'block');
    }
  }

  _endTurn() {
    if (this._resolving) return;
    this._cleanupMatrices();
    if (this._activePlayerIdx !== null) {
      document.getElementById(`p${this._activePlayerIdx + 1}-zone-timer`)?.classList.add('hidden');
    }
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
        await this._handleVictory();
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

  _showRoundScorePopup(count) {
    return new Promise((resolve) => {
      const popup = document.getElementById('round-score-popup');
      const countEl = document.getElementById('score-popup-count');
      if (!popup || !countEl) {
        resolve();
        return;
      }
      countEl.textContent = String(count);
      popup.classList.remove('hidden', 'animating');
      void popup.offsetWidth;
      popup.classList.add('animating');
      setTimeout(() => {
        popup.classList.add('hidden');
        popup.classList.remove('animating');
        resolve();
      }, 1500);
    });
  }

  async _resolvePlayerCombat(playerIdx) {
    const player = this.combat.players[playerIdx];
    const cls = this.selectedClasses[playerIdx];
    const indicator = document.getElementById('turn-indicator');

    indicator.classList.add('hidden');
    await this._showRoundScorePopup(player.roundScore || 0);

    if (this.combat.isSolo) {
      const bonuses = applySoloRoundBonuses(player);
      if (bonuses.mageCrit) {
        indicator.classList.remove('hidden');
        indicator.textContent = '🔮 法師暴擊！本回合傷害 ×1.5！';
        await delay(700);
      }
      if (bonuses.holyShield) {
        indicator.classList.remove('hidden');
        indicator.textContent = '✨ 聖光大盾！本回合護盾 ×1.5！';
        await delay(700);
      }
    }

    const isSolo = this.combat.isSolo;
    const damageHits = getDamageHitsForResolve(player, this.combat, isSolo);
    const shieldHits = getShieldHitsForResolve(player, isSolo);
    const totalDamage = damageHits.reduce((s, h) => s + h.amount, 0);
    const totalShield = shieldHits.reduce((s, h) => s + h.amount, 0);

    if (damageHits.length) {
      if (damageHits.some((h) => h.crit)) {
        this.battleStats.recordCrit();
        sound.playCrit();
      }
      indicator.classList.remove('hidden');
      indicator.textContent = damageHits.some((h) => h.crit)
        ? `⚔️ ${cls.icon} ${cls.name} 暴擊！`
        : `⚔️ ${cls.icon} ${cls.name} 攻擊！`;
      await this.scene3d.playHeroAttackHits(
        cls.id,
        damageHits,
        (hit) => {
          this.combat.enemyHp = Math.max(0, this.combat.enemyHp - hit.amount);
          this._updateHpBar();
          if (this.combat.enemyHp <= 0) this.combat.victory = true;
        },
        { dualMode: !this.combat.isSolo },
      );
      this.combat.battleTotalDamage += totalDamage;
      if (this.combat.victory) return;
    }

    if (shieldHits.length) {
      indicator.classList.remove('hidden');
      indicator.textContent = `🛡️ ${cls.icon} ${cls.name} 防禦！`;
      await this.scene3d.playHeroShieldHits(cls.id, shieldHits);
      this.combat.battleTotalShield += totalShield;
      this._updateRoundShield();
    }
  }

  async _resolveBossTurn() {
    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');

    const preview = getBossRoundInfo(this.combat.round, this.combat.isSolo);
    let bossHint = `👹 Boss 準備 ${preview.label}（${preview.rawDamage} 傷）`;
    if (this.combat.bossIsDebuffed) bossHint += ' — 寒冰凍結生效，攻擊 -4！';
    indicator.textContent = bossHint;
    await delay(700);

    const result = computeBossPhase(this.combat, this.combat.round);

    if (!this.combat.victory && result.overflowDamage > 0) {
      indicator.textContent = '🛡️ 盾甲超過15！10點轉化為攻擊！';
      const attacker = this.selectedClasses.find((c) => c.role === 'tank' || c.role === 'dps')
        || this.selectedClasses[0];
      await this.scene3d.playHeroAttack(attacker.id, result.overflowDamage);
      this.combat.enemyHp = Math.max(0, this.combat.enemyHp - result.overflowDamage);
      this.combat.battleTotalDamage += result.overflowDamage;
      this.combat.roundShieldPenalty = result.overflowDamage;
      this._updateHpBar();
      this._updateRoundShield();
      if (this.combat.enemyHp <= 0) this.combat.victory = true;
      await delay(500);
    }

    if (!this.combat.victory) {
      const bossAttack = result.damageReceived > 0 || result.blocked > 0;
      if (bossAttack) {
        indicator.textContent = result.blocked > 0 && result.damageReceived <= 0
          ? `👹 Boss ${result.bossRound.label}！（護盾抵擋 ${Math.round(result.blocked)} 點）`
          : `👹 Boss ${result.bossRound.label}！`;
        await this.scene3d.playBossAttackTeam(
          result.damageReceived,
          result.bossRound.type,
          { blocked: result.blocked },
        );
        sound.playBossAttack();
        if (result.damageReceived > 0) {
          this.combat.teamHp = Math.max(0, this.combat.teamHp - result.damageReceived);
          this._updateTeamHp();
          if (this.combat.teamHp <= 0) this.combat.defeat = true;
        }
      }

      if (result.bossHeal > 0) {
        indicator.textContent = `👹 Boss 吸血回復 ${Math.round(result.bossHeal)}！`;
        this.combat.enemyHp = Math.min(
          this.combat.enemyMaxHp,
          this.combat.enemyHp + result.bossHeal,
        );
        await this.scene3d.playBossHeal(result.bossHeal);
        this._updateHpBar();
      }

      if (result.thornsDamage > 0) {
        const knight = this.selectedClasses.find((c) => c.id === 'knight');
        if (knight) {
          this.battleStats.recordThorns(result.thornsDamage);
          sound.playThorns();
          indicator.textContent = `🛡️ 聖光反傷盾！反彈 ${result.thornsDamage} 點！`;
          await this.scene3d.playHeroAttack(knight.id, result.thornsDamage);
          this.combat.enemyHp = Math.max(0, this.combat.enemyHp - result.thornsDamage);
          this.combat.battleTotalDamage += result.thornsDamage;
          this._updateHpBar();
          if (this.combat.enemyHp <= 0) this.combat.victory = true;
          await delay(600);
        }
      }
    }

    applyBossPhaseResult(this.combat, result);
    this._updateBossDebuffIcon();

    if (result.mageFreezeTriggered) {
      this.battleStats.recordFreeze();
      sound.playFreeze();
      indicator.textContent = '🔮 法師寒冰凍結！下回合 Boss 攻擊 -4';
      this._updateBossDebuffIcon();
      await delay(800);
    }

    if (result.warriorArmorBreakTriggered) {
      this.battleStats.recordArmorBreak();
      sound.playArmorBreak();
      indicator.textContent = '⚔️ 戰士碎甲重擊！下回合 Boss 額外 +3 傷害';
      await delay(700);
    }

    if (this.combat.victory) {
      await this._handleVictory();
      return;
    }

    if (this.combat.defeat || !this.combat.isTeamAlive()) {
      await delay(300);
      this._showDefeat();
      return;
    }

    prepareNextRound(this.combat, result);
    this.combat.startNewRound();
    this.turnOrder = this._getTurnOrder();
    this.currentTurnStep = 0;
    this._resetRoundUI();

    const nextBoss = getBossRoundInfo(this.combat.round, this.combat.isSolo);
    if (this.combat.bossArmorBreak) {
      indicator.textContent = `第 ${this.combat.round} 回合 — 碎甲生效！Boss 將發動${nextBoss.label}`;
    } else {
      indicator.textContent = `第 ${this.combat.round} 回合 — Boss 將發動${nextBoss.label}`;
    }
    this._updateBossBanner();
    await delay(1000);
    this._beginRoundInput();
  }

  _updateHpBar() {
    const pct = this.combat.getHpPercent();
    document.getElementById('enemy-hp-bar').style.width = `${pct}%`;
    document.getElementById('enemy-hp-text').textContent =
      `${Math.round(this.combat.enemyHp)} / ${this.combat.enemyMaxHp}`;
    this._updateBossDebuffIcon();
  }

  _updateBossDebuffIcon() {
    const icon = document.getElementById('boss-debuff-icon');
    if (!icon) return;
    icon.classList.toggle('hidden', !this.combat.bossIsDebuffed);
  }

  _updateTeamHp() {
    const bar = document.getElementById('team-hp-bar');
    const text = document.getElementById('team-hp-text');
    if (!bar || !text) return;
    const pct = this.combat.getTeamHpPercent();
    bar.style.width = `${pct}%`;
    text.textContent = `${Math.round(this.combat.teamHp)} / ${this.combat.teamMaxHp}`;
  }

  async _handleVictory() {
    if (this._victoryPlaying) return;
    this._victoryPlaying = true;

    const indicator = document.getElementById('turn-indicator');
    indicator.classList.remove('hidden');
    indicator.textContent = '👹 「啊！不！我會回來的！」';
    await delay(900);

    await this.scene3d.playBossDefeatSequence();
    sound.playVictory();
    await this._showVictory();
  }

  async _showVictory() {
    document.getElementById('turn-indicator').classList.add('hidden');

    const heroClass = this.selectedClasses.find((c) => c.role === 'dps') || this.selectedClasses[0];
    await this.scene3d.unlockEquipment(heroClass.id);

    document.getElementById('equipment-unlock').classList.remove('hidden');
    document.getElementById('result-title').textContent = '🎉 勝利！魔王已被擊敗！';
    this._renderEducationalRecap();
    document.getElementById('result-stats').innerHTML = `
      <p>答對字數：${this.combat.players.map((p) => p.correctCount).join(' / ')}</p>
    `;
    this._showScreen('screen-result');
    await this.victoryDisplay.show(this.selectedClasses);
  }

  _showDefeat() {
    this.victoryDisplay.dispose();
    document.getElementById('turn-indicator').classList.add('hidden');
    document.getElementById('equipment-unlock').classList.add('hidden');
    document.getElementById('result-title').textContent = '💀 戰敗…';
    this._renderEducationalRecap();
    document.getElementById('result-stats').innerHTML = `
      <p>魔王剩餘 HP：${Math.round(this.combat.enemyHp)}</p>
    `;
    this._showScreen('screen-result');
  }

  _goToMenu() {
    this._cleanupMatrices();
    this.victoryDisplay.dispose();
    this._victoryPlaying = false;
    this.combat.reset();
    this.battleStats.reset();
    this.selectedClasses = [];
    this.turnOrder = [];
    this.currentTurnStep = 0;
    this.formationSlots = [];
    this.scene3d.clearScene();
    this.scene3d.loadEnemy(ENEMY.modelPath, ENEMY.defaultEquipment);
    document.getElementById('equipment-unlock').classList.add('hidden');
    this._showScreen('screen-menu');
  }

  _cleanupMatrices() {
    this.matrices.forEach((m) => m.destroy());
    this.matrices = [];
    clearInterval(this.timerInterval);
  }

  _showScreen(id) {
    if (id !== 'screen-class') {
      this.classPreviews.dispose();
    }

    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    const isBattle = id === 'screen-battle';
    document.getElementById('app').classList.toggle('battle-active', isBattle);
    document.getElementById('app').classList.toggle('class-select-active', id === 'screen-class');
    const bossHp = document.getElementById('boss-head-stack');
    const teamHp = document.getElementById('team-hp-floating');
    if (bossHp && !isBattle) bossHp.classList.add('hidden');
    if (teamHp) teamHp.classList.toggle('hidden', !isBattle);
    if (!isBattle) {
      document.getElementById('app').classList.remove('spectator-mode');
    }
    if (this.scene3d) {
      this.scene3d.setBattleLayout(isBattle);
    }
  }
}
