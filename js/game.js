/* 畫面、模式、輸入與存檔。核心規則在 core.js */
(function () {
  'use strict';

  const { Game, COLS, ROWS, SHAPES } = window.TetrisCore;

  // ---------- 設定 ----------
  const SPEED_MIN = 1;   // 單位：0.1 秒
  const SPEED_MAX = 50;
  const SPEED_DEFAULT = 10;
  const TIMER_MS = 5 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const LONG_PRESS_MS = 200;  // 按住超過 0.2 秒算長按
  const REPEAT_MS = 100;      // 之後每 0.1 秒移動一格
  const COUNTDOWN_MS = 3000;
  const HARD_DROP_LOCK_MS = 1200; // 硬降後還能左右移動或旋轉的時間，每次成功移動或旋轉都重新計算
  const REPEATABLE = new Set(['left', 'right', 'down']);

  const COLORS = {
    I: '#3fd0e8', O: '#f7d038', Z: '#ef4b4b', S: '#4fd66b',
    L: '#f59a2f', J: '#4a7cf0', T: '#b25ae8',
  };

  // ---------- 存檔（localStorage） ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('tetris.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('tetris.' + key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
    },
  };

  // ---------- 小工具 ----------
  const $ = (id) => document.getElementById(id);

  function speedText(tenths) {
    return (tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1)) + 'sec';
  }

  function clock(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // ---------- 狀態 ----------
  let mode = store.get('mode', 'classic');
  let speed = store.get('speed', SPEED_DEFAULT);
  if (!(speed >= SPEED_MIN && speed <= SPEED_MAX)) speed = SPEED_DEFAULT;

  let game = null;
  let state = 'home'; // home | playing | paused | countdown | over
  let elapsed = 0;     // 實際遊玩時間（毫秒，不含暫停與倒數）
  let gravityAcc = 0;
  let lockDelay = 0;   // 硬降後的剩餘緩衝時間（毫秒），0 表示不在緩衝期
  let countdownLeft = 0;
  let timeUp = false;
  const held = new Map(); // action -> 下一次連續移動的時間

  // ---------- 主畫面 ----------
  function renderHome() {
    document.querySelectorAll('.mode').forEach((el) => {
      el.classList.toggle('selected', el.dataset.mode === mode);
    });
    for (const m of ['classic', 'timer']) {
      const rec = store.get('best.' + m, null);
      $('rec-' + m).textContent = rec ? `${rec.score} ${speedText(rec.speed)}/perblock` : '';
    }
    $('speed-value').textContent = speedText(speed);
    $('speed-up').disabled = speed >= SPEED_MAX;
    $('speed-down').disabled = speed <= SPEED_MIN;
  }

  function changeSpeed(delta) {
    speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed + delta));
    store.set('speed', speed);
    renderHome();
  }

  function showHome() {
    state = 'home';
    held.clear();
    $('play').classList.add('hidden');
    $('home').classList.remove('hidden');
    renderHome();
  }

  // ---------- 遊戲流程 ----------
  function startGame() {
    game = new Game();
    elapsed = 0;
    gravityAcc = 0;
    lockDelay = 0;
    timeUp = false;
    held.clear();
    state = 'playing';
    $('home').classList.add('hidden');
    $('play').classList.remove('hidden');
    $('gameover').classList.add('hidden');
    $('overlay').classList.add('hidden');
    $('menu-controls').classList.add('hidden');
    $('controls').classList.remove('hidden');
    $('pause-btn').classList.remove('is-paused');
    $('menu-speed-value').textContent = speedText(speed) + '/block';
    layout();
    draw();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    releaseAll();
    $('overlay').classList.remove('hidden');
    $('resume-big').classList.remove('hidden');
    $('countdown').classList.add('hidden');
    $('pause-btn').classList.add('is-paused');
    $('controls').classList.add('hidden');
    $('menu-controls').classList.remove('hidden');
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'countdown';
    countdownLeft = COUNTDOWN_MS;
    $('resume-big').classList.add('hidden');
    $('countdown').classList.remove('hidden');
    $('countdown').textContent = '3';
  }

  function finishCountdown() {
    state = 'playing';
    $('overlay').classList.add('hidden');
    $('pause-btn').classList.remove('is-paused');
    $('menu-controls').classList.add('hidden');
    $('controls').classList.remove('hidden');
  }

  function endGame() {
    state = 'over';
    releaseAll();
    const best = store.get('best.' + mode, null);
    // 每個模式只留一筆，以分數高低為準（0 分不算紀錄）
    const isBest = game.score > 0 && (!best || game.score > best.score);
    if (isBest) store.set('best.' + mode, { score: game.score, speed });

    $('go-score').textContent = String(game.score);
    $('go-time').textContent = timeText(true);
    $('go-best').classList.toggle('hidden', !isBest);
    $('gameover').classList.remove('hidden');
    $('overlay').classList.add('hidden');
    $('controls').classList.add('hidden');
    $('menu-controls').classList.remove('hidden');
    draw();
  }

  function timeText(final) {
    if (mode === 'classic') {
      if (elapsed >= HOUR_MS) return 'Above 1 Hour';
      return clock(Math.floor(elapsed / 1000));
    }
    if (final && timeUp) return '0';
    return clock(Math.ceil(Math.max(0, TIMER_MS - elapsed) / 1000));
  }

  // ---------- 操作 ----------
  function doAction(action) {
    if (state !== 'playing') return;
    if (lockDelay > 0) {
      doLandedAction(action);
      return;
    }
    switch (action) {
      case 'left': game.moveLeft(); break;
      case 'right': game.moveRight(); break;
      case 'rotate': game.rotate(); break;
      case 'down': {
        const r = game.softDrop();
        if (r.moved) gravityAcc = 0;
        if (r.locked) { gravityAcc = 0; held.delete('down'); }
        break;
      }
      case 'drop':
        // 先落到底，緩衝時間到了才固定
        game.dropToBottom();
        lockDelay = HARD_DROP_LOCK_MS;
        break;
    }
    if (game.over) endGame();
  }

  // 硬降後的緩衝期：可以左右移動、旋轉（移動後仍貼著底部），成功的話重新倒數；
  // 再按硬降或向下就立刻固定
  function doLandedAction(action) {
    let moved = false;
    switch (action) {
      case 'left': moved = game.moveLeft(); break;
      case 'right': moved = game.moveRight(); break;
      case 'rotate': moved = game.rotate() > 0; break;
      case 'down':
      case 'drop':
        held.delete('down');
        lockNow();
        return;
    }
    game.dropToBottom();
    if (moved) lockDelay = HARD_DROP_LOCK_MS;
  }

  function lockNow() {
    lockDelay = 0;
    gravityAcc = 0;
    game.hardDrop();
    if (game.over) endGame();
  }

  function press(action) {
    if (state !== 'playing') return;
    doAction(action);
    if (REPEATABLE.has(action) && state === 'playing') {
      held.set(action, performance.now() + LONG_PRESS_MS);
    }
  }

  function release(action) {
    held.delete(action);
  }

  function releaseAll() {
    held.clear();
    document.querySelectorAll('.ctl.active').forEach((el) => el.classList.remove('active'));
  }

  function processHeld(now) {
    for (const [action, next] of held) {
      let t = next;
      while (state === 'playing' && held.has(action) && now >= t) {
        doAction(action);
        t += REPEAT_MS;
      }
      if (held.has(action)) held.set(action, t);
    }
  }

  // ---------- 主迴圈 ----------
  let lastFrame = 0;
  function frame(now) {
    const dt = lastFrame ? Math.min(now - lastFrame, 250) : 0;
    lastFrame = now;

    if (state === 'playing') {
      processHeld(now);
    }
    if (state === 'playing') {
      elapsed += dt;
      if (mode === 'timer' && elapsed >= TIMER_MS) {
        elapsed = TIMER_MS;
        timeUp = true;
        endGame();
      } else if (lockDelay > 0) {
        lockDelay -= dt;
        if (lockDelay <= 0) lockNow();
      } else {
        gravityAcc += dt;
        const interval = speed * 100;
        if (gravityAcc >= interval) {
          gravityAcc -= interval;
          const r = game.tick();
          if (r.locked) gravityAcc = 0;
          if (game.over) endGame();
        }
      }
    } else if (state === 'countdown') {
      countdownLeft -= dt;
      if (countdownLeft <= 0) finishCountdown();
      else $('countdown').textContent = String(Math.ceil(countdownLeft / 1000));
    }

    if (state !== 'home') draw();
    requestAnimationFrame(frame);
  }

  // ---------- 繪圖 ----------
  const boardCanvas = $('board');
  const nextCanvas = $('next');
  const bctx = boardCanvas.getContext('2d');
  const nctx = nextCanvas.getContext('2d');
  let cell = 28;

  function sizeCanvas(canvas, ctx, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    const area = $('field-area');
    const borders = 9; // 外框 + 側欄分隔線
    const w = area.clientWidth - borders;
    const h = area.clientHeight - 6;
    cell = Math.max(8, Math.floor(Math.min(w / (COLS + 4.4), h / ROWS)));
    document.documentElement.style.setProperty('--c', cell + 'px');
    sizeCanvas(boardCanvas, bctx, cell * COLS, cell * ROWS);
    const nw = Math.floor(cell * 4.4) - 8;
    sizeCanvas(nextCanvas, nctx, nw, Math.floor(cell * 5.6));
    if (game) draw();
  }

  function drawBlock(ctx, x, y, size, color) {
    const g = Math.max(1, Math.round(size * 0.06));
    ctx.fillStyle = color;
    ctx.fillRect(x + g, y + g, size - 2 * g, size - 2 * g);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + g, y + g, size - 2 * g, Math.max(1, size * 0.14));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + g, y + size - g - Math.max(1, size * 0.14), size - 2 * g, Math.max(1, size * 0.14));
  }

  function draw() {
    if (!game) return;
    const W = cell * COLS;
    const H = cell * ROWS;
    bctx.fillStyle = '#0c0e12';
    bctx.fillRect(0, 0, W, H);

    // 格線
    bctx.strokeStyle = 'rgba(255,255,255,0.05)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let x = 1; x < COLS; x++) { bctx.moveTo(x * cell + 0.5, 0); bctx.lineTo(x * cell + 0.5, H); }
    for (let y = 1; y < ROWS; y++) { bctx.moveTo(0, y * cell + 0.5); bctx.lineTo(W, y * cell + 0.5); }
    bctx.stroke();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = game.board[y][x];
        if (t) drawBlock(bctx, x * cell, y * cell, cell, COLORS[t] || '#888');
      }
    }
    if (!game.over && game.current) {
      drawGhost();
      const color = COLORS[game.current.type];
      for (const [x, y] of game.currentCells()) {
        if (y >= 0) drawBlock(bctx, x * cell, y * cell, cell, color);
      }
    }

    drawNext();
    $('score').textContent = String(game.score);
    $('time').textContent = timeText(false);
  }

  // 落點預覽：灰色虛線框
  function drawGhost() {
    const occupied = new Set(game.currentCells().map(([x, y]) => x + ',' + y));
    const inset = Math.max(2, cell * 0.12);
    bctx.save();
    bctx.strokeStyle = 'rgba(200, 204, 212, 0.75)';
    bctx.lineWidth = Math.max(1.5, cell * 0.06);
    bctx.setLineDash([Math.max(3, cell * 0.16), Math.max(2, cell * 0.1)]);
    for (const [x, y] of game.ghostCells()) {
      if (y < 0 || occupied.has(x + ',' + y)) continue;
      bctx.strokeRect(x * cell + inset, y * cell + inset, cell - 2 * inset, cell - 2 * inset);
    }
    bctx.restore();
  }

  function drawNext() {
    const dpr = window.devicePixelRatio || 1;
    const w = nextCanvas.width / dpr;
    const h = nextCanvas.height / dpr;
    nctx.clearRect(0, 0, w, h);
    const size = Math.floor(cell * 0.7);
    const slotH = h / 2;
    game.getNext().forEach((type, i) => {
      const cells = SHAPES[type];
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pw = (maxX - minX + 1) * size;
      const ph = (maxY - minY + 1) * size;
      const ox = (w - pw) / 2;
      const oy = i * slotH + (slotH - ph) / 2;
      for (const [dx, dy] of cells) {
        drawBlock(nctx, ox + (dx - minX) * size, oy + (dy - minY) * size, size, COLORS[type]);
      }
    });
  }

  // ---------- 事件 ----------
  document.querySelectorAll('.mode').forEach((el) => {
    el.addEventListener('click', () => {
      mode = el.dataset.mode;
      store.set('mode', mode);
      renderHome();
    });
  });
  $('speed-up').addEventListener('click', () => changeSpeed(1));
  $('speed-down').addEventListener('click', () => changeSpeed(-1));
  $('start-btn').addEventListener('click', startGame);

  $('pause-btn').addEventListener('click', () => {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  });
  $('resume-big').addEventListener('click', resume);
  $('home-btn').addEventListener('click', showHome);
  $('restart-btn').addEventListener('click', startGame);

  // 螢幕按鈕：按下立刻動作，長按連續移動
  document.querySelectorAll('.ctl').forEach((el) => {
    const action = el.dataset.action;
    const up = () => { el.classList.remove('active'); release(action); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('active');
      press(action);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // 電腦測試用鍵盤：← → ↓ 移動、↑ / X 旋轉、空白鍵落底、P / Esc 暫停
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'rotate', KeyX: 'rotate', Space: 'drop',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing') pause();
      else if (state === 'paused') resume();
      return;
    }
    const action = KEYS[e.code];
    if (!action || state === 'home') return;
    e.preventDefault();
    if (e.repeat) return;
    press(action);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYS[e.code];
    if (action) release(action);
  });

  // 防止 iPhone Safari 捲動、縮放、雙擊放大
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // 切到背景時自動暫停
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('field-area'));

  // 離線快取
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  renderHome();
  requestAnimationFrame(frame);
})();
