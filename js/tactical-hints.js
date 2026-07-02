/**
 * 戰術預告 — 回合提示與 Boss 下招預覽
 */

import { getBossRoundInfo } from '@/combat.js';
import { getRadicalTheme } from '@/settings.js';

const CLASS_HINTS = {
  knight: (score) => {
    if (score >= 6) return '護盾已厚！Boss 攻擊時將大量反彈';
    const need = 6 - score;
    return need > 0 ? `再點 ${need} 次可疊更多反傷盾` : '繼續開盾強化反彈';
  },
  warrior: (score) => {
    if (score >= 7) return '碎甲已觸發！下回合隊友傷害 +3';
    return `再點 ${7 - score} 次觸發碎甲（下回合 Boss +3 傷）`;
  },
  mage: (score) => {
    if (score >= 6) return '寒冰凍結已就緒！Boss 下輪攻擊 -4';
    return `再點 ${6 - score} 次必定凍結 Boss`;
  },
  assassin: (score) => `每下 35% 暴擊 ×2，目前已點 ${score} 次`,
  rage_hero: (score) => score >= 6 ? '狂暴加成可能觸發！' : `再點 ${6 - score} 次有機會觸發加成`,
};

export function getBossAttackBanner(round, combat) {
  const info = getBossRoundInfo(round, combat.isSolo);
  let dmg = info.rawDamage;
  if (combat.bossFreezeReduction > 0) {
    dmg = Math.max(0, dmg - combat.bossFreezeReduction);
  }
  const icons = { normal: '👊', lifesteal: '🧛', ultimate: '💥' };
  const extra = info.type === 'lifesteal' ? '（只吸真正扣血）' : '';
  const freeze = combat.bossFreezeReduction > 0 ? ' ❄️-4' : '';
  return `${icons[info.type] || '👹'} 下招：${info.label} ${dmg} 傷${freeze}${extra}`;
}

export function getRoundTacticalHint(combat, cls, playerScore) {
  const boss = getBossRoundInfo(combat.round, combat.isSolo);
  const radical = getRadicalTheme().label;
  const fn = CLASS_HINTS[cls?.id];
  const classLine = fn ? fn(playerScore || 0) : '';

  let bossLine = '';
  if (boss.type === 'ultimate') {
    bossLine = '⚠️ 本回合結束 Boss 將蓄力重擊！騎士開盾／法師凍結';
  } else if (boss.type === 'lifesteal') {
    bossLine = 'Boss 將吸血，全擋則吸不到血';
  }

  const lines = [
    `找「${radical}」字`,
    classLine,
    bossLine,
  ].filter(Boolean);

  return lines.join(' · ');
}

export function getEducationalRecap(stats, combat, classes, radicalLabel) {
  const topChars = stats.getTopChars(5);
  const charList = topChars.length
    ? topChars.map(([c, n]) => `「${c}」×${n}`).join('、')
    : '（本局無）';

  const classNames = classes.map((c) => c.name).join('、');
  const lines = [
    `<p><strong>📚 識字回顧</strong> — ${radicalLabel}部共答對 <strong>${stats.totalCorrect}</strong> 字</p>`,
    `<p>最常點的字：${charList}</p>`,
    `<p><strong>⚔️ 戰術亮點</strong></p>`,
    `<ul class="recap-list">`,
    `<li>經過 ${combat.round} 回合 · 隊伍：${classNames}</li>`,
    stats.thornsCount > 0
      ? `<li>🛡️ 騎士反傷 ${stats.thornsCount} 次，共 ${Math.round(stats.thornsTotal)} 傷</li>` : '',
    stats.armorBreakCount > 0
      ? `<li>⚔️ 碎甲觸發 ${stats.armorBreakCount} 次</li>` : '',
    stats.freezeCount > 0
      ? `<li>❄️ 寒冰凍結 ${stats.freezeCount} 次</li>` : '',
    stats.critCount > 0
      ? `<li>🗡️ 暴擊 ${stats.critCount} 次</li>` : '',
    `<li>累計傷害 ${Math.round(combat.battleTotalDamage)} · 護盾 ${Math.round(combat.battleTotalShield)}</li>`,
    `</ul>`,
  ];
  return lines.filter(Boolean).join('');
}
