/**
 * 語文防衛戰 — Defend
 * 入口模組
 */

import { Game } from '@/game.js';
import { APP_VERSION } from '@/version.js';
import { loadSettingsFromURL } from '@/settings.js';

loadSettingsFromURL();

const badge = document.getElementById('version-badge');
if (badge) badge.textContent = APP_VERSION;
const checkVer = document.getElementById('check-version');
if (checkVer) checkVer.textContent = APP_VERSION;

if (/Windows/i.test(navigator.userAgent)) {
  document.body.classList.add('platform-windows');
}

if (navigator.maxTouchPoints > 0 || /iPad|iPhone|Android/i.test(navigator.userAgent)) {
  document.body.classList.add('platform-touch');
}

/** 禁止 iPad / 手機雙擊縮放 */
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

const game = new Game();
game.init();
