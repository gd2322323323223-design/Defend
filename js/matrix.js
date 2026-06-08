/**
 * 字詞矩陣模組 — 3x3，每次答對全盤刷新，固定 3 個火字
 */

const FIRE_RADICAL_CHARS = [
  '火', '炎', '焰', '燒', '煮', '烤', '炒', '炸', '煙', '燈',
  '爐', '炊', '爆', '烈', '燙', '燭', '焚', '熄', '蒸', '煜',
  '煉', '熱', '烘', '炙', '燦', '煥', '燼', '燻', '煎', '熬',
  '熏', '焦', '煤', '炭', '炬', '烙',
];

const NON_FIRE_CHARS = [
  '水', '冰', '江', '河', '湖', '海', '雪', '冷', '凍', '霜',
  '雨', '雲', '風', '土', '石', '木', '金', '銀', '鐵', '銅',
  '田', '禾', '米', '豆', '瓜', '果', '花', '草', '樹', '林',
  '山', '川', '日', '月', '星', '光', '電', '雷', '霧', '露',
];

export const MATRIX_SIZE = 3;
export const FIRE_CELL_COUNT = 3;
const COOLDOWN_MS = 500;
const REFRESH_MS = 220;

export class WordMatrix {
  constructor(container, options = {}) {
    this.container = container;
    this.onCorrect = options.onCorrect || (() => {});
    this.onWrong = options.onWrong || (() => {});
    this.radical = options.radical || '火';
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
        this._handleCorrect(cell);
      } else {
        this._handleWrong(cell);
      }
    };

    this.container.addEventListener('pointerdown', this._onPointerDown);
  }

  _hasRadical(char) {
    if (this.radical === '火') {
      return FIRE_RADICAL_CHARS.includes(char) || char.includes('火');
    }
    return char.includes(this.radical);
  }

  _randomChar(isFire) {
    const pool = isFire ? FIRE_RADICAL_CHARS : NON_FIRE_CHARS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _generateBoard() {
    const total = MATRIX_SIZE * MATRIX_SIZE;
    const board = [];

    for (let i = 0; i < FIRE_CELL_COUNT; i++) {
      board.push(this._randomChar(true));
    }
    for (let i = FIRE_CELL_COUNT; i < total; i++) {
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

  _handleCorrect(cell) {
    cell.classList.add('correct');
    this.onCorrect(cell.dataset.word);

    setTimeout(() => {
      this._refreshBoard();
    }, REFRESH_MS);
  }

  _handleWrong(cell) {
    cell.classList.add('shake');
    this.onWrong(cell.dataset.word);

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
    }, COOLDOWN_MS);
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

export { FIRE_RADICAL_CHARS, NON_FIRE_CHARS };
