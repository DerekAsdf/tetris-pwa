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
const J0 = [[0, -1], [0, 0], [1, 0], [2, 0]];
const J180 = [[0, 1], [0, 0], [-1, 0], [-2, 0]];
const J270 = [[-1, 0], [0, 0], [0, -1], [0, -2]];

// 把 J 放在 (cx, cy)，棋盤除了 free（相對座標）以外全部填滿，讓踢牆也推不動
function jBoxed(free) {
  const g = new Game({ rng: rngFor(['J']) });
  const cx = 4, cy = 10;
  g.current.x = cx;
  g.current.y = cy;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.board[y][x] = 'X';
  for (const [dx, dy] of free) g.board[cy + dy][cx + dx] = null;
  return [g, cx, cy];
}
const abs = (cx, cy, rel) => rel.map(([dx, dy]) => [cx + dx, cy + dy]);

test('90 度（含踢牆）放不下時改轉 180 度', () => {
  const [g, cx, cy] = jBoxed([...J0, ...J180]);
  assert.equal(g.rotate(), 2);
  assert.deepEqual(sorted(g.currentCells()), sorted(abs(cx, cy, J180)));
});

test('90、180 度都放不下時改轉 270 度', () => {
  const [g, cx, cy] = jBoxed([...J0, ...J270]);
  assert.equal(g.rotate(), 3);
  assert.deepEqual(sorted(g.currentCells()), sorted(abs(cx, cy, J270)));
});

test('全部放不下就不動', () => {
  const [g] = jBoxed(J0);
  const before = sorted(g.currentCells());
  assert.equal(g.rotate(), 0);
  assert.deepEqual(sorted(g.currentCells()), before);
});

test('踢牆：直立 I 貼左牆旋轉，會往右推進棋盤', () => {
  const g = new Game({ rng: rngFor(['I']) });
  g.softDrop(); g.softDrop(); g.softDrop();
  g.rotate(); // 直立
  while (g.moveLeft());
  assert.equal(g.current.x, 0);
  assert.equal(g.rotate(), 1);
  const cells = g.currentCells();
  assert.ok(cells.every(([x]) => x >= 0 && x < COLS));
  assert.equal(new Set(cells.map(([, y]) => y)).size, 1); // 變回橫的
});

test('踢牆：直立 I 貼右牆旋轉，會往左推進棋盤', () => {
  const g = new Game({ rng: rngFor(['I']) });
  g.softDrop(); g.softDrop(); g.softDrop();
  g.rotate();
  while (g.moveRight());
  assert.equal(g.rotate(), 1);
  assert.ok(g.currentCells().every(([x]) => x >= 0 && x < COLS));
});

test('踢牆：貼地旋轉時往上推', () => {
  const g = new Game({ rng: rngFor(['T']) });
  g.dropToBottom(); // 中心在最底列
  assert.equal(g.current.y, ROWS - 1);
  assert.equal(g.rotate(), 1);
  assert.equal(g.current.y, ROWS - 2);
  assert.ok(g.currentCells().every(([, y]) => y < ROWS));
});

test('dropToBottom 落到底但不鎖定，之後仍可移動', () => {
  const g = new Game({ rng: rngFor(['O', 'T']) });
  const d = g.dropToBottom();
  assert.equal(d, ROWS - 2);
  assert.equal(g.current.type, 'O');
  assert.ok(g.board[ROWS - 1].every((c) => !c));
  assert.equal(g.moveLeft(), true);
  g.hardDrop();
  assert.equal(g.board[ROWS - 1][3], 'O');
  assert.equal(g.current.type, 'T');
});

test('落點預覽在方塊正下方的落地位置', () => {
  const g = new Game({ rng: rngFor(['O']) });
  g.board[ROWS - 1][4] = 'X';
  assert.deepEqual(sorted(g.ghostCells()), sorted([[4, 17], [5, 17], [4, 18], [5, 18]]));
  assert.equal(g.current.y, 1); // 方塊本身沒動
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
