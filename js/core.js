/*
 * 俄羅斯方塊核心邏輯（不含任何畫面程式碼）
 * 瀏覽器：window.TetrisCore；Node：require('./core.js')
 *
 * 座標：x 向右、y 向下。每個方塊以「旋轉中心格」為原點 (0, 0)，
 * 其他格子以相對位置 (dx, dy) 表示；順時針轉 90 度：(dx, dy) -> (-dy, dx)。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TetrisCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const TYPES = ['I', 'O', 'Z', 'S', 'L', 'J', 'T'];

  // 出現時的形狀，(0, 0) 為旋轉中心格（見「方塊種類.png」的 X 標記）
  const SHAPES = {
    // 一排 4 格，中心為左數第 3 格
    I: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
    // 2x2，中心為右下格
    O: [[-1, -1], [0, -1], [-1, 0], [0, 0]],
    // 上排左 2 格、下排中右 2 格，中心為下排左邊那格
    Z: [[-1, -1], [0, -1], [0, 0], [1, 0]],
    // 上排中右 2 格、下排左中 2 格，中心為下排右邊那格
    S: [[0, -1], [1, -1], [-1, 0], [0, 0]],
    // 上排最右 1 格、下排 3 格，中心為下排最右格
    L: [[0, -1], [-2, 0], [-1, 0], [0, 0]],
    // 上排最左 1 格、下排 3 格，中心為下排最左格
    J: [[0, -1], [0, 0], [1, 0], [2, 0]],
    // 上排中間 1 格、下排 3 格，中心為下排中間格
    T: [[0, -1], [-1, 0], [0, 0], [1, 0]],
  };

  // 一次消除 n 列的得分
  const LINE_SCORES = [0, 10, 25, 40, 55];

  const PREVIEW_COUNT = 2;

  function rotateCW(cells) {
    return cells.map(([dx, dy]) => [-dy, dx]);
  }

  function rotateTimes(cells, times) {
    let out = cells;
    for (let i = 0; i < times; i++) out = rotateCW(out);
    return out;
  }

  function randomType(rng) {
    return TYPES[Math.floor(rng() * TYPES.length)];
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  class Game {
    /**
     * @param {object} [opts]
     * @param {() => number} [opts.rng] 回傳 [0, 1) 的亂數函式，測試時可替換
     */
    constructor(opts = {}) {
      this.rng = opts.rng || Math.random;
      this.board = emptyBoard();
      this.queue = [];
      this.score = 0;
      this.lines = 0;
      this.over = false;
      this.current = null;
      for (let i = 0; i < PREVIEW_COUNT; i++) this.queue.push(randomType(this.rng));
      this.spawn();
    }

    /** 接下來兩個方塊的種類 */
    getNext() {
      return this.queue.slice();
    }

    /** 從佇列取出下一個方塊放到頂端中央，並補一個新的隨機方塊（完全隨機，不使用 7-bag） */
    spawn(type) {
      if (!type) {
        type = this.queue.shift();
        this.queue.push(randomType(this.rng));
      }
      const cells = SHAPES[type].map((c) => c.slice());
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs);
      const width = Math.max(...xs) - minX + 1;
      const left = Math.floor((COLS - width) / 2);
      this.current = { type, x: left - minX, y: -Math.min(...ys), cells };
      if (this.collides(cells, this.current.x, this.current.y)) this.over = true;
      return this.current;
    }

    /** 牆壁、地板或已堆疊的方塊會擋住；棋盤上方（y < 0）視為空 */
    collides(cells, x, y) {
      for (const [dx, dy] of cells) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
        if (cy >= 0 && this.board[cy][cx]) return true;
      }
      return false;
    }

    /** 目前方塊在棋盤上的絕對座標 */
    currentCells() {
      if (!this.current) return [];
      const { x, y, cells } = this.current;
      return cells.map(([dx, dy]) => [x + dx, y + dy]);
    }

    move(dir) {
      if (this.over) return false;
      const p = this.current;
      if (this.collides(p.cells, p.x + dir, p.y)) return false;
      p.x += dir;
      return true;
    }

    moveLeft() { return this.move(-1); }
    moveRight() { return this.move(1); }

    /**
     * 順時針轉 90 度；被擋住就改試 180 度、再試 270 度，都不行就不動（不踢牆）。
     * @returns {number} 實際轉了幾個 90 度（0 表示沒轉）
     */
    rotate() {
      if (this.over) return 0;
      const p = this.current;
      for (let times = 1; times <= 3; times++) {
        const cells = rotateTimes(p.cells, times);
        if (!this.collides(cells, p.x, p.y)) {
          p.cells = cells;
          return times;
        }
      }
      return 0;
    }

    /**
     * 往下一格；已經到底就鎖定。
     * @returns {{moved: boolean, locked: boolean, cleared: number}}
     */
    softDrop() {
      if (this.over) return { moved: false, locked: false, cleared: 0 };
      const p = this.current;
      if (!this.collides(p.cells, p.x, p.y + 1)) {
        p.y += 1;
        return { moved: true, locked: false, cleared: 0 };
      }
      const cleared = this.lock();
      return { moved: false, locked: true, cleared };
    }

    /** 自動下落一格（與 softDrop 相同） */
    tick() {
      return this.softDrop();
    }

    /** 直接落到底並鎖定 */
    hardDrop() {
      if (this.over) return { distance: 0, cleared: 0 };
      const p = this.current;
      let distance = 0;
      while (!this.collides(p.cells, p.x, p.y + 1)) {
        p.y += 1;
        distance++;
      }
      const cleared = this.lock();
      return { distance, cleared };
    }

    /** 鎖定目前方塊、消行、計分、產生下一個方塊。回傳消除列數 */
    lock() {
      const p = this.current;
      let aboveTop = false;
      for (const [cx, cy] of this.currentCells()) {
        if (cy < 0) aboveTop = true;
        else this.board[cy][cx] = p.type;
      }
      const cleared = this.clearLines();
      this.lines += cleared;
      this.score += LINE_SCORES[cleared] || 0;
      if (aboveTop) {
        // 方塊鎖定在棋盤外 → 堆滿
        this.over = true;
        return cleared;
      }
      this.spawn();
      return cleared;
    }

    clearLines() {
      const remaining = this.board.filter((row) => row.some((c) => !c));
      const cleared = ROWS - remaining.length;
      while (remaining.length < ROWS) remaining.unshift(new Array(COLS).fill(null));
      this.board = remaining;
      return cleared;
    }
  }

  return { COLS, ROWS, TYPES, SHAPES, LINE_SCORES, PREVIEW_COUNT, Game, rotateCW, rotateTimes };
});
