/**
 * 教師後台與遊戲設定 — 支援 URL 參數與主選單調整
 */

export const DIFFICULTY_PRESETS = {
  easy: {
    id: 'easy',
    label: '簡單（低年級）',
    roundDuration: 12,
    wrongCooldownMs: 400,
    targetCells: 3,
  },
  normal: {
    id: 'normal',
    label: '標準',
    roundDuration: 10,
    wrongCooldownMs: 500,
    targetCells: 3,
  },
  hard: {
    id: 'hard',
    label: '困難（高年級）',
    roundDuration: 8,
    wrongCooldownMs: 700,
    targetCells: 3,
  },
};

export const RADICAL_THEMES = {
  火: {
    radical: '火',
    label: '火部',
    chars: [
      '火', '炎', '焰', '燒', '煮', '烤', '炒', '炸', '煙', '燈',
      '爐', '炊', '爆', '烈', '燙', '燭', '焚', '熄', '蒸', '煜',
      '煉', '熱', '烘', '炙', '燦', '煥', '燼', '燻', '煎', '熬',
      '熏', '焦', '煤', '炭', '炬', '烙',
    ],
  },
  水: {
    radical: '水',
    label: '水部',
    chars: [
      '水', '冰', '江', '河', '湖', '海', '雪', '冷', '凍', '霜',
      '雨', '雲', '泉', '溪', '流', '波', '浪', '潮', '濤', '潤',
      '滴', '淚', '汗', '泳', '洗', '浴', '淡', '深', '淺', '清',
    ],
  },
  木: {
    radical: '木',
    label: '木部',
    chars: [
      '木', '樹', '林', '森', '枝', '根', '葉', '花', '草', '竹',
      '松', '柏', '楊', '柳', '桃', '李', '杏', '梨', '橘', '橙',
      '桌', '椅', '板', '柱', '橋', '梯', '框', '棍', '杖', '桿',
    ],
  },
  心: {
    radical: '心',
    label: '心部',
    chars: [
      '心', '思', '想', '念', '意', '忘', '忙', '快', '慢', '怕',
      '恨', '愛', '情', '感', '愁', '悶', '悦', '悲', '怒', '驚',
      '態', '愿', '慮', '憶', '懷', '懼', '戀', '慾', '憤',
    ],
  },
};

const DEFAULTS = {
  difficulty: 'normal',
  radical: '火',
  bossHp: null,
  teamHp: null,
  roundDuration: null,
  spectator: false,
  classHints: true,
  tacticalHints: true,
  teacherMode: false,
};

let current = { ...DEFAULTS };

function parseBool(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

export function loadSettingsFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('difficulty') && DIFFICULTY_PRESETS[params.get('difficulty')]) {
    current.difficulty = params.get('difficulty');
  }
  if (params.has('radical') && RADICAL_THEMES[params.get('radical')]) {
    current.radical = params.get('radical');
  }
  if (params.has('bossHp')) current.bossHp = Number(params.get('bossHp')) || null;
  if (params.has('teamHp')) current.teamHp = Number(params.get('teamHp')) || null;
  if (params.has('roundTime')) current.roundDuration = Number(params.get('roundTime')) || null;
  if (params.has('spectator')) current.spectator = parseBool(params.get('spectator'));
  if (params.has('teacher')) current.teacherMode = parseBool(params.get('teacher'));
  if (params.has('hints')) current.classHints = parseBool(params.get('hints'));
  return current;
}

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  syncSettingsToURL();
  return current;
}

export function getDifficulty() {
  return DIFFICULTY_PRESETS[current.difficulty] || DIFFICULTY_PRESETS.normal;
}

export function getRadicalTheme() {
  return RADICAL_THEMES[current.radical] || RADICAL_THEMES['火'];
}

export function getRoundDuration() {
  return current.roundDuration || getDifficulty().roundDuration;
}

export function getBossHpOverride() {
  return current.bossHp;
}

export function getTeamHpOverride() {
  return current.teamHp;
}

export function syncSettingsToURL() {
  const params = new URLSearchParams();
  if (current.difficulty !== 'normal') params.set('difficulty', current.difficulty);
  if (current.radical !== '火') params.set('radical', current.radical);
  if (current.bossHp) params.set('bossHp', String(current.bossHp));
  if (current.teamHp) params.set('teamHp', String(current.teamHp));
  if (current.roundDuration) params.set('roundTime', String(current.roundDuration));
  if (current.spectator) params.set('spectator', '1');
  if (current.teacherMode) params.set('teacher', '1');
  if (!current.classHints) params.set('hints', '0');
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}
