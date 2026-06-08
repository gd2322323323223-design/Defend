/**
 * 字詞矩陣模組 — 3x3 動態補位演算法
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
export const MAX_FIRE_CELLS = 4;
const REFILL_NON_FIRE_RATE = 0.7;
const COOLDOWN_MS = 500;

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

  _countFireCells() {
    return this.cells.filter((cell) => this._hasRadical(cell.dataset.word)).length;
  }

  /** 補位：70% 非火字；若已達火字上限則必為非火字 */
  _refillChar() {
    const fireCount = this._countFireCells();
    if (fireCount >= MAX_FIRE_CELLS) {
      return this._randomChar(false);
    }
    const useNonFire = Math.random() < REFILL_NON_FIRE_RATE;
    return this._randomChar(!useNonFire);
  }

  _handleCorrect(cell) {
    cell.classList.add('correct');
    this.onCorrect(cell.dataset.word);

    setTimeout(() => {
      const newChar = this._refillChar();
      cell.dataset.word = newChar;
      cell.textContent = newChar;
      cell.classList.remove('correct');
    }, 400);
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

  _generateBoard() {
    const total = MATRIX_SIZE * MATRIX_SIZE;
    const board = [];

    for (let i = 0; i < MAX_FIRE_CELLS; i++) {
      board.push(this._randomChar(true));
    }
    for (let i = MAX_FIRE_CELLS; i < total; i++) {
      board.push(this._randomChar(false));
    }

    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
    return board;
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
