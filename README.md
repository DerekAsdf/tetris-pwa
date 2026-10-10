# Tetris（PWA）

可自訂下落速度的俄羅斯方塊，CLASSIC / TIMER 兩種模式，可加入 iPhone 主畫面離線遊玩。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 主畫面、遊戲畫面、暫停與結算畫面 |
| `style.css` | 樣式 |
| `js/core.js` | 核心規則（棋盤、方塊、旋轉、消行、計分、預覽佇列），不含畫面 |
| `js/game.js` | Canvas 繪圖、模式與計時、觸控按鈕、長按連續移動、最高分存檔 |
| `manifest.webmanifest` | 讓 iPhone 把它當成 App |
| `sw.js` | 離線快取 |
| `icons/` | 主畫面圖示（`tools/make_icons.py` 產生） |
| `tests/` | 核心邏輯測試 |

## 在電腦上測試

在這個資料夾開終端機：

```bash
python -m http.server 8000
```

- 遊戲：<http://localhost:8000/>（用開發者工具切換成手機尺寸）
- 測試：<http://localhost:8000/tests/>（有裝 Node 也可以跑 `node --test tests/`）

鍵盤：← → ↓ 移動、↑ 或 X 旋轉、空白鍵直接落底、P 或 Esc 暫停。

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository（例如 `tetris`）。
2. 把這個資料夾裡的所有檔案上傳到 repository 根目錄（`index.html` 要在最外層）。
3. Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`，按 Save。
4. 幾分鐘後會得到網址，例如 `https://你的帳號.github.io/tetris/`。

## 安裝到 iPhone

1. 用 Safari 開啟上面的網址。
2. 分享 → 加入主畫面（若有「以網頁 App 開啟」請保持開啟）。
3. 從主畫面圖示開啟就是全螢幕。開啟過一次之後即可離線玩。

## 更新遊戲

改完檔案重新上傳到 GitHub 即可；有網路時 App 會抓最新版（有時要關掉重開一次）。
如果新增或改名了檔案，記得同步修改 `sw.js` 裡的 `FILES` 清單，並把 `CACHE` 的版本號 +1。
