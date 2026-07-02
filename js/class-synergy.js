/**
 * 雙人職業協同提示
 */

const SYNERGY_MAP = {
  'warrior+mage': '⚔️🔮 碎甲 + 法術暴破：戰士破甲後法師下回合高傷收割',
  'mage+warrior': '🔮⚔️ 法師先凍結減傷，戰士安心疊擊破甲',
  'knight+assassin': '🛡️🗡️ 騎士開盾反傷，刺客趁 Boss 失血收割',
  'assassin+knight': '🗡️🛡️ 刺客輸出，騎士扛 Boss 大招並反彈',
  'knight+mage': '🛡️🔮 騎士擋招 + 法師凍結，雙重減傷',
  'mage+knight': '🔮🛡️ 法師凍結後騎士安心疊反傷盾',
  'warrior+assassin': '⚔️🗡️ 戰士碎甲 + 刺客暴擊，爆發雙核',
  'assassin+warrior': '🗡️⚔️ 刺客先削血，戰士補碎甲',
  'knight+warrior': '🛡️⚔️ 騎士防禦反傷，戰士專心輸出',
  'warrior+knight': '⚔️🛡️ 戰士破甲，騎士扛傷反彈',
  'mage+assassin': '🔮🗡️ 法師凍結減傷 + 刺客高傷',
  'assassin+mage': '🗡️🔮 刺客暴擊後法師補刀',
};

export function getSynergyHint(classIds) {
  if (!classIds || classIds.length < 2) return '';
  const key = `${classIds[0]}+${classIds[1]}`;
  return SYNERGY_MAP[key] || '🤝 分工合作：一防一攻，互相掩护！';
}

export function getClassPickHint(classId, pickedIds) {
  if (!pickedIds.length) return '點選第一個職業';
  if (pickedIds.includes(classId)) return '再點一次可取消選擇';
  if (pickedIds.length === 1) {
    return getSynergyHint([pickedIds[0], classId]);
  }
  return '';
}
