// 執行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, COLS, ROWS, TYPES, rotateCW } = require('../js/core.js');

// 依序回傳指定種類的亂數產生器
function rngFor(types) {
  let i = 0;
  return () => {
    const t = types[i++ % types.length];
    return (TYPES.indexOf(t) + 0.5) / TYPES.length;
  };
}

function sorted(cells) {
  return cells.map((c) => c.join(',')).sort();
}

function fillRow(game, y, exceptX = []) {
  for (let x = 0; x < COLS; x++) if (!exceptX.includes(x)) game.board[y][x] = 'X';
}

test('棋盤 10 寬 20 高', () => {
  const g = new Game();
  assert.equal(g.board.length, ROWS);
  assert.equal(g.board[0].length, COLS);
  assert.equal(ROWS, 20);
  assert.equal(COLS, 10);
});

test('順時針旋轉公式 (dx, dy) -> (-dy, dx)', () => {
  assert.deepEqual(rotateCW([[1, 0]]), [[-0, 1]]);
  assert.deepEqual(rotateCW([[0, 1]]), [[-1, 0]]);
});

test('預覽佇列永遠有兩個方塊，取出後補上', () => {
  const g = new Game({ rng: rngFor(['I', 'O', 'T', 'S', 'Z']) });
  assert.equal(g.current.type, 'I');
  assert.deepEqual(g.getNext(), ['O', 'T']);
  g.hardDrop();
  assert.equal(g.current.type, 'O');
  assert.deepEqual(g.getNext(), ['T', 'S']);
});

test('出現在頂端中央', () => {
  const g = new Game({ rng: rngFor(['I']) });
  assert.deepEqual(sorted(g.currentCells()), sorted([[3, 0], [4, 0], [5, 0], [6, 0]]));
  const t = new Game({ rng: rngFor(['T']) });
  assert.deepEqual(sorted(t.currentCells()), sorted([[4, 0], [3, 1], [4, 1], [5, 1]]));
  const o = new Game({ rng: rngFor(['O']) });
  assert.deepEqual(sorted(o.currentCells()), sorted([[4, 0], [5, 0], [4, 1], [5, 1]]));
});

test('I 以左數第 3 格為中心旋轉', () => {
  const g = new Game({ rng: rngFor(['I']) });
  g.softDrop(); g.softDrop(); g.softDrop(); // 中心移到 (5, 3)
  assert.equal(g.rotate(), 1);
  assert.deepEqual(sorted(g.currentCells()), sorted([[5, 1], [5, 2], [5, 3], [5, 4]]));
});

test('T 以下排中間格為中心旋轉', () => {
  const g = new Game({ rng: rngFor(['T']) });
  g.softDrop(); // 中心 (4, 2)
  g.rotate();
  // 凸出的格子從上方轉到右方
  assert.deepEqual(sorted(g.currentCells()), sorted([[5, 2], [4, 1], [4, 2], [4, 3]]));
});

test('O 以右下格為中心旋轉（形狀不變但位置會移動）', () => {
  const g = new Game({ rng: rngFor(['O']) });
  g.softDrop(); g.softDrop(); // 中心 (5, 3)
  g.rotate();
  assert.deepEqual(sorted(g.currentCells()), sorted([[5, 2], [6, 2], [5, 3], [6, 3]]));
});

// J 出現時：中心 (cx, cy)，格子相對位置 (0,-1)(0,0)(1,0)(2,0)
//   90 度 → (1,0)(0,0)(0,1)(0,2)
//  180 度 → (0,1)(0,0)(-1,0)(-2,0)
//  270 度 → (-1,0)(0,0)(0,-1)(0,-2)
function jAt(dy) {
  const j = new Game({ rng: rngFor(['J']) });
  for (let i = 0; i < dy; i++) j.softDrop();
  return [j, j.current.x, j.current.y];
}

test('90 度被擋住時改轉 180 度', () => {
  const [j, cx, cy] = jAt(2);
  j.board[cy + 2][cx] = 'X'; // 只擋 90 度
  assert.equal(j.rotate(), 2);
  assert.deepEqual(sorted(j.currentCells()), sorted([[cx, cy + 1], [cx, cy], [cx - 1, cy], [cx - 2, cy]]));
});

test('90、180 都被擋住時改轉 270 度；全部被擋住就不動', () => {
  const [j, cx, cy] = jAt(2);
  j.board[cy + 1][cx] = 'X'; // 擋 90 與 180 度
  assert.equal(j.rotate(), 3);
  assert.deepEqual(sorted(j.currentCells()), sorted([[cx - 1, cy], [cx, cy], [cx, cy - 1], [cx, cy - 2]]));

  const [k, kx, ky] = jAt(2);
  k.board[ky + 1][kx] = 'X';
  k.board[ky][kx - 1] = 'X'; // 再擋 270 度
  const before = sorted(k.currentCells());
  assert.equal(k.rotate(), 0);
  assert.deepEqual(sorted(k.currentCells()), before);
});

test('不踢牆：靠牆旋轉被擋住時不位移', () => {
  const g = new Game({ rng: rngFor(['I']) });
  g.softDrop(); g.softDrop(); g.softDrop();
  g.rotate(); // 直立，中心 x=5
  while (g.moveLeft());
  const x = g.current.x;
  g.rotate();
  assert.equal(g.current.x, x);
  for (const [cx] of g.currentCells()) assert.ok(cx >= 0 && cx < COLS);
});

test('左右移動被牆擋住', () => {
  const g = new Game({ rng: rngFor(['O']) });
  let n = 0;
  while (g.moveLeft()) n++;
  assert.equal(n, 4);
  assert.equal(g.moveLeft(), false);
});

test('計分：消 1/2/3/4 列 = 10/25/40/55', () => {
  for (const [n, score] of [[1, 10], [2, 25], [3, 40], [4, 55]]) {
    const g = new Game({ rng: rngFor(['I']) });
    g.rotate(); // 直立 I，佔 x=5，y 從 -2 到 1
    for (let i = 0; i < n; i++) fillRow(g, ROWS - 1 - i, [5]);
    const r = g.hardDrop();
    assert.equal(r.cleared, n);
    assert.equal(g.score, score);
    // 消掉的列都清空
    for (let i = 0; i < n; i++) assert.ok(g.board[ROWS - 1 - i].every((c) => !c || c === 'I' || c === 'X'));
  }
});

test('消行後上方的列往下掉', () => {
  const g = new Game({ rng: rngFor(['O']) });
  fillRow(g, 19, [4, 5]);
  g.board[18][0] = 'X';
  g.hardDrop(); // O 填 (4,18)(5,18)(4,19)(5,19) → 消第 19 列
  assert.equal(g.score, 10);
  assert.equal(g.board[19][0], 'X');
  assert.equal(g.board[19][4], 'O');
  assert.equal(g.board[18][0], null);
});

test('出生位置被佔用就結束', () => {
  const g = new Game({ rng: rngFor(['O']) });
  for (let y = 2; y < ROWS; y++) fillRow(g, y, [0]);
  g.hardDrop();
  g.hardDrop();
  assert.equal(g.over, true);
});

test('soft drop 到底時鎖定', () => {
  const g = new Game({ rng: rngFor(['O']) });
  let r;
  do r = g.softDrop(); while (r.moved);
  assert.equal(r.locked, true);
  assert.equal(g.board[19][4], 'O');
});
