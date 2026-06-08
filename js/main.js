/**
 * 語文防衛戰 — Defend
 * 入口模組
 */

import { Game } from './game.js';
import { APP_VERSION } from './version.js';

const badge = document.getElementById('version-badge');
if (badge) badge.textContent = APP_VERSION;

const game = new Game();
game.init();
