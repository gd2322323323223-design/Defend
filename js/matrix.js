/**
 * 字詞矩陣模組 — 3x3，支援多字部與難度設定
 */

import { getRadicalTheme } from '@/settings.js';

const GENERIC_DISTRACTORS = [
  '土', '石', '金', '銀', '鐵', '銅', '田', '禾', '米', '豆',
  '瓜', '果', '山', '川', '日', '月', '星', '光', '電', '雷',
  '風', '霧', '露', '鳥', '魚', '虫', '馬', '牛', '羊', '犬',
];

export const MATRIX_SIZE = 3;
export const FIRE_CELL_COUNT = 3;
const DEFAULT_COOLDOWN_MS = 500;
const REFRESH_MS = 220;

export class WordMatrix {
  constructor(container, options = {}) {
    this.container = container;
    this.onCorrect = options.onCorrect || (() => {});
    this.onWrong = options.onWrong || (() => {});
    const theme = options.theme || getRadicalTheme();
    this.radical = options.radical || theme.radical;
    this.radicalChars = options.radicalChars || theme.chars;
    this.targetCells = options.targetCells ?? FIRE_CELL_COUNT;
    this.wrongCooldownMs = options.wrongCooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.cells = [];
    this.cooldown = false;
    this._bindEvents();
  }

  _bindEvents() {
    this._onPointerDown = (e) => {
      const cell = e.target.closest('.word-cell');
      if (!cell || this.cooldown || cell.classList.contains('cooldown')) return;
      e.preventDefault();

      const char = cell.dataset.word;
      if (this._hasRadical(char)) {
        this._handleCorrect(cell, char);
      } else {
        this._handleWrong(cell);
      }
    };

    this.container.addEventListener('pointerdown', this._onPointerDown);
  }

  _hasRadical(char) {
    if (this.radicalChars?.includes(char)) return true;
    return char.includes(this.radical);
  }

  _randomChar(isTarget) {
    const pool = isTarget ? this.radicalChars : GENERIC_DISTRACTORS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _generateBoard() {
    const total = MATRIX_SIZE * MATRIX_SIZE;
    const board = [];

    for (let i = 0; i < this.targetCells; i++) {
      board.push(this._randomChar(true));
    }
    for (let i = this.targetCells; i < total; i++) {
      board.push(this._randomChar(false));
    }

    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
    return board;
  }

  _applyBoard(board) {
    this.cells.forEach((cell, i) => {
      cell.classList.remove('correct', 'shake', 'cooldown');
      cell.dataset.word = board[i];
      cell.textContent = board[i];
    });
  }

  _refreshBoard() {
    this._applyBoard(this._generateBoard());
  }

  _handleCorrect(cell, char) {
    cell.classList.add('correct');
    this.onCorrect(char);

    setTimeout(() => {
      this._refreshBoard();
    }, REFRESH_MS);
  }

  _handleWrong(cell) {
    cell.classList.add('shake');
    this.onWrong();

    this.cooldown = true;
    this.container.querySelectorAll('.word-cell').forEach((c) => {
      c.classList.add('cooldown');
    });

    setTimeout(() => {
      cell.classList.remove('shake');
      this.container.querySelectorAll('.word-cell').forEach((c) => {
        c.classList.remove('cooldown');
      });
      this.cooldown = false;
    }, this.wrongCooldownMs);
  }

  render() {
    const board = this._generateBoard();
    this.container.innerHTML = '';
    this.cells = [];

    board.forEach((char) => {
      const cell = document.createElement('div');
      cell.className = 'word-cell';
      cell.dataset.word = char;
      cell.textContent = char;
      this.container.appendChild(cell);
      this.cells.push(cell);
    });
  }

  destroy() {
    this.container.removeEventListener('pointerdown', this._onPointerDown);
    this.container.innerHTML = '';
  }
}

export { GENERIC_DISTRACTORS as NON_FIRE_CHARS };
