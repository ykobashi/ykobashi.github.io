# minesweeper 実装調査メモ

調査日: 2026-07-27。添付仕様と、現在の `lights-out` / `snake-game` / `game-2048` / `wikipedia-quiz` / ルート `index.html` を確認した。マインスイーパーは 1 人用なので通信ファイルは不要で、`lights-out` の構成を土台にするのが最も一貫している。

## 作成・更新対象

| 対象 | 内容 | 参照元 |
| --- | --- | --- |
| `minesweeper/index.html` | SEO、テーマ切替、難易度、ステータス、盤面、説明、広告 | `wikipedia-quiz/index.html` + `lights-out/index.html` |
| `minesweeper/logic.js` | DOM 非依存の盤面生成・開放・勝敗ロジック | `lights-out/logic.js`、`snake-game/logic.js` |
| `minesweeper/script.js` | DOM 構築、クリック／右クリック／フラグモード、タイマー | `lights-out/script.js` |
| `minesweeper/style.css` | レスポンシブ盤面と状態別セル表示 | `lights-out/style.css` |
| `minesweeper/test.js` | Node の `assert` による純粋ロジック検証 | 各ゲームの `test.js` |
| `index.html` | `#games` へカードを追加 | 既存ゲームカード |
| `sitemap.xml` | `/minesweeper/` を追加 | 既存 URL 一覧 |

`net.js`、`peerjs.min.js` は作らない。現在のオンラインゲーム群はすでに `common/net-core.js` を共通化しているが、このゲームには通信自体が不要である。

## 既存の実装規約

- `logic.js` はグローバル変数を最小化した純粋関数だけで構成し、末尾で `module.exports` と `window.MinesweeperLogic` の両方に公開する。`lights-out/logic.js` と `snake-game/logic.js` がそのままの形式。
- `script.js` は `(() => { 'use strict'; ... })();` で囲む。状態を IIFE 内に置き、`logic.js` の公開オブジェクトだけに依存する。
- `test.js` は `const assert = require('assert')`、`require('./logic.js')`、ブロック単位のテスト、最後の `console.log('All tests passed')` が標準。乱数を使う関数は `rng` 引数を受け、固定列 RNG でテストする。
- 新しいページは現在の最新ページに合わせて、`<head>` 冒頭で `../theme.js`、`../theme-toggle.css` を読み、`body` のテーマ切替ボタンを置く。添付案の「lights-out は旧形式」は実際その通りであり、コピー元を丸写しにしない。
- 個別ページには GA、AdSense、favicon、canonical、OGP、JSON-LD (`Game`) を含める。トップへ戻るナビ、広告プレースホルダー、遊び方、プライバシーポリシーも既存形式に合わせる。

## 推奨データモデルと `logic.js` API

セルは `{ mine, adjacent, opened, flagged }` のオブジェクトにする。描画状態とゲーム状態が混ざらず、テスト時にも意図が読みやすい。

```js
const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};
```

| 関数 | 期待する責務 |
| --- | --- |
| `createEmptyBoard(rows, cols)` | 全セルを未開放・未フラグ・非地雷・`adjacent: 0` で生成する。 |
| `cloneBoard(board)` | セルオブジェクトまで複製する。開放／フラグ処理の非破壊性を保つ。 |
| `getNeighbors(rows, cols, r, c)` | 8 方向の盤内座標だけを返す。角・辺の検証対象。 |
| `placeMines(board, mineCount, rng, safeCells)` | `safeCells` を除外して一意の地雷を配置する。残り候補を列挙して RNG で選ぶ方式なら重複や無限ループを避けられる。 |
| `computeAdjacentCounts(board)` | 各非地雷セルに周囲地雷数をセットする。 |
| `generateBoard(rows, cols, mineCount, firstClick, rng)` | 初回クリック地点とその周囲 8 マスを安全地帯にして、地雷配置と数字計算まで済ませる。 |
| `floodOpen(board, r, c)` | フラグ・地雷・既開放セルを除外し、0 の連結領域とその境界数字を開く。キューを使う反復 BFS にして再帰の深さを避ける。 |
| `toggleFlag(board, r, c)` | 未開放セルだけフラグを反転する。開放済みセルは no-op。 |
| `countFlags(board)` / `remainingMineCount(board, mineCount)` | ステータス表示用。後者は `mineCount - countFlags(board)`。 |
| `isWin(board)` | 地雷以外がすべて開放済みなら `true`。フラグの正誤を勝利条件にしない。 |
| `revealAllMines(board)` | 敗北時に全地雷を開放状態にする。 |
| `formatTime(seconds)` | `mm:ss`。例: `0 => '00:00'`, `65 => '01:05'`。 |

`generateBoard` は初回クリック時まで呼ばない。開始時に地雷を置くと、初回クリックが地雷になる可能性を排除できず、仕様と矛盾する。

### 地雷数の安全性

標準難易度では「初回セル＋周囲」を除外しても候補数が十分にある。ただし API を汎用化するなら `mineCount <= rows * cols - safeCells.length` を満たすよう、`placeMines` で候補数を上限にするか明示的な例外にする。UI は標準難易度だけなので、カスタム値を受け取らない限り入力バリデーションは不要。

## `script.js` の状態と進行

主要状態は次で足りる。

```js
let difficultyKey = 'beginner';
let rows = 9, cols = 9, mineCount = 10;
let board = MinesweeperLogic.createEmptyBoard(rows, cols);
let boardInitialized = false;
let flagMode = false;
let elapsedSeconds = 0, timerId = null;
let gameOver = false, gameWon = false;
const cellEls = [];
```

1. `newGame()` は難易度から寸法を設定し、空盤面・タイマー・ゲーム終了状態をリセットして `buildBoard()` と `render()` を行う。地雷はまだ生成しない。
2. `buildBoard()` は CSS Grid の列数を `cols` に合わせ、各セルを `<button type="button">` として生成する。`cellEls[r][c]` に参照を保持すると `render()` が簡潔になる。
3. 左クリック／タップは通常時に開く。未初期化なら `generateBoard(..., {r, c}, Math.random)` を呼び、タイマーを開始してから開放する。地雷なら敗北、そうでなければ `floodOpen`、その後 `isWin` を確認する。
4. 右クリックは `contextmenu` を `preventDefault()` してフラグ切替。モバイル向けの「🚩 フラグモード ON/OFF」中の通常クリックも同じフラグ操作にする。ゲーム終了後はどちらも no-op。
5. `triggerLoss()` はタイマー停止、`revealAllMines`、結果オーバーレイ表示。`triggerWin()` もタイマー停止、クリア時間／難易度を表示する。再挑戦は同じ `newGame()` を呼ぶ。

セルの `aria-label` は座標に加え、開放済みなら周囲地雷数、フラグなら「フラグ」、未開放なら「未開放」を反映するとよい。ボタンの `disabled` は全盤面を止める必要があるため、イベント側の `gameOver` ガードを主にする。

## UI / CSS の要点

- 難易度切替は 3 個のボタン（初級 9×9・10、中級 16×16・40、上級 16×30・99）。上級は横 30 マスなので、盤面の親要素に横スクロールを許可し、セル幅を CSS 変数で縮小する。`min-width` 固定だけにするとスマホで画面外に切れる。
- ステータスは「残り地雷数」（フラグ数を差し引く）とタイマー、`新しいゲーム`、フラグモードのトグルを同じ操作帯に置く。
- `render()` はクラス (`opened`, `flagged`, `mine`, `number-1`〜`number-8`, `exploded`) と `textContent` を差し替える。数字色をクラスに分けると視認性が良い。地雷は敗北後だけ見せる。
- 初回クリック前は地雷を表示せず、残り地雷数は難易度の地雷数を表示する。
- ルートのテーマ対応に合わせて CSS 変数と `data-theme="dark"` を使い、色だけでフラグ／地雷を区別しない（🚩、💣、数字を併用）。
- 結果オーバーレイと「他のゲーム」導線、遊び方、広告枠は `lights-out` の構造をベースにする。ただしテーマ読み込み・トグルは現行規約に更新する。

## テスト範囲

`node minesweeper/test.js` で次を固定 RNG つきで検証する。

- `createEmptyBoard` の寸法・セル初期値と `cloneBoard` の深い非破壊性。
- `getNeighbors` の角（3）、辺（5）、中央（8）と盤外不在。
- `placeMines` の地雷数、一意性、`safeCells` に地雷が置かれないこと。
- `computeAdjacentCounts` の既知配置（角地雷・中央地雷）。
- `generateBoard` の初回セルと隣接 8 マスがすべて非地雷であること。
- `floodOpen` が 0 領域と境界数字を開き、フラグセル・地雷を開かないこと。
- `toggleFlag` の切替と開放済みセル no-op、残り地雷数の計算。
- `isWin` が「非地雷全開放」でのみ真になること、`revealAllMines` が地雷だけを開くこと。
- `formatTime` の 0 秒・65 秒・10 分以上。

## トップページと公開面の注意

`index.html` の `#games` に次の構造で、ライツアウト／スネーク周辺へ追加する。

```html
<a class="card" href="minesweeper/index.html">
  <h3>マインスイーパー</h3>
  <p>地雷を避けながら全マスを開く定番パズル</p>
</a>
```

同時に `sitemap.xml` に `https://ykobashi.github.io/minesweeper/` を追加する。トップの件数バッジは JavaScript が `.card` 数を数えるため、手作業の件数更新は不要。

実装後の最低確認は `node minesweeper/test.js`。ブラウザでは初回クリックの安全地帯、右クリック、フラグモード、0 連鎖開放、各難易度、敗北時の全地雷表示、クリア時のタイマー停止を手動確認する。
