# マインスイーパー + お絵かきの森 実装統合レビュー

作成日: 2026-07-27

参照:

- 添付の「実装プラン: マインスイーパー + お絵かきの森」
- `.agents/minesweeper-research.md`
- `.agents/drawing-forest-research.md`
- 現行の `drawing-wolf`、`picture-telephone`、`dictionary-quiz`、`common/net-core.js`、`wikipedia-quiz`、ルート `index.html` / `sitemap.xml`

## 結論

両ゲームとも実装可能で、全体構成も既存サイトに適合している。ただし、そのまま実装すると仕様違反または同期不良になる箇所がある。特に次の修正を実装の前提とする。

1. **お絵かきの森の1点は描き手ではなく正解した回答者へ加点する。** 添付仕様の確定事項を優先する。`drawing-forest-research.md` の「drawerId に1点」は誤り。
2. `drawing-forest/net.js` は `ito-game/net.js` の旧実装を丸ごと複製せず、現行と同じ `NetCore.create(...)` の薄いラッパーにする。
3. お絵かきの森の全ゲーム内メッセージを `gameId` と `turnIndex` でスコープし、ホストが送信者・フェーズ・座標・件数を検証する。クライアント申告の `playerId` は信用しない。
4. ホストの `broadcast()` はホスト自身へループバックしない。ホスト発のターン開始、描画、Undo、全消去、結果表示は、必ずローカル適用してから broadcast する。
5. マインスイーパーでは、初回オープン前に立てたフラグを地雷生成時に消さない。フラグ済みセルの通常クリックは盤面生成もタイマー開始も行わない。
6. `sitemap.xml` には `/minesweeper/` と `/drawing-forest/` の両方を追加する。

以下を実装担当者向けの統合仕様とする。

---

## 1. マインスイーパー

### 作成・更新ファイル

```text
minesweeper/
├── index.html
├── logic.js
├── script.js
├── style.css
└── test.js

index.html
sitemap.xml
```

`net.js` と `peerjs.min.js` は作成しない。

### 確定ルール

- 初級: 9行 × 9列、地雷10個
- 中級: 16行 × 16列、地雷40個
- 上級: 16行 × 30列、地雷99個
- 初回に実際に開くセルと、その8近傍を地雷配置対象から除外する。
- 通常クリック／タップで開く。フラグモード中の通常クリックと右クリックでフラグを切り替える。
- 0セルは反復処理で連鎖展開する。チョードは実装しない。
- タイマーは最初の有効なオープン操作で開始する。フラグ操作、開放済みセル、フラグ済みセルのクリックでは開始しない。
- 残り地雷表示は `地雷数 - フラグ数` とし、負数も許容する。
- 勝利条件は「非地雷セルがすべて開いていること」。フラグの正誤は条件に含めない。

「上級の列数を16に抑える」という添付文は行列の説明が逆転している。実データはクラシックどおり **16行 × 30列** とし、スマホでは盤面ラッパーを横スクロールさせる。30列を画面幅へ無理に縮めて操作不能にしない。

### `logic.js` の契約

セル:

```js
{ mine: false, adjacent: 0, opened: false, flagged: false }
```

公開API:

```js
DIFFICULTIES
createEmptyBoard(rows, cols)
cloneBoard(board)
getNeighbors(rows, cols, r, c)
placeMines(board, mineCount, rng, safeCells)
computeAdjacentCounts(board)
generateBoard(rows, cols, mineCount, firstClick, rng)
floodOpen(board, r, c)
toggleFlag(board, r, c)
countFlags(board)
remainingMineCount(board, mineCount)
isWin(board)
revealAllMines(board)
formatTime(seconds)
```

実装上の不変条件:

- 盤面を返す関数は入力盤面を変更せず、新しい盤面を返す。
- `cloneBoard` は各セルまで複製する。
- `getNeighbors` は盤内の8方向のみを返し、自セルを含めない。
- `placeMines` は `safeCells` を座標キーで重複排除し、盤外座標を安全セル数として数えない。
- 配置候補数より `mineCount` が多い場合は黙って減らさず `RangeError` にする。負数、非整数、不正寸法も同様に明示的に拒否する。
- 地雷配置は候補配列から取り除きながら選ぶか、候補をshuffleして先頭から採用し、重複と無限ループを防ぐ。
- `computeAdjacentCounts` は地雷セルの `adjacent` を0のままにしてよい。非地雷セルのみ周囲地雷数を設定する。
- `floodOpen` はキューまたはスタックによる反復処理にする。フラグ、地雷、既開放セルは展開しない。0セルから到達できる境界数字は開く。
- `toggleFlag` は未開放セルだけを変更する。
- `revealAllMines` は地雷セルだけを `opened: true` にし、非地雷やフラグ状態を不要に変更しない。
- `formatTime` は少なくとも `0 -> "00:00"`、`65 -> "01:05"` を満たす。負数・非有限値は0秒相当に正規化すると安全。
- 末尾で `module.exports` と `window.MinesweeperLogic` の両方へ同じAPIを公開する。

### `script.js` の状態とイベント順

最低限の状態:

```js
let difficultyKey = 'beginner';
let board;
let boardInitialized = false;
let flagMode = false;
let elapsedSeconds = 0;
let timerId = null;
let gameOver = false;
let gameWon = false;
let explodedCell = null;
let cellEls = [];
```

`explodedCell` は敗北時にクリックした地雷だけを強調表示するためのUI状態とする。セルモデルに描画専用の `exploded` を混ぜない。

有効な通常オープンの処理順:

1. `gameOver`、開放済み、フラグ済みをガードする。
2. 未初期化なら現在のフラグ座標を退避する。
3. `generateBoard(...)` で地雷を生成する。
4. 退避したフラグを新盤面へ再適用する。
5. `boardInitialized = true` とし、タイマーを開始する。
6. 地雷なら `explodedCell` を記録して敗北処理、非地雷なら `floodOpen`。
7. 非地雷を開いた後だけ `isWin` を判定する。
8. `render()` する。

これにより、初回オープン前にユーザーが立てたフラグが消える問題を防ぐ。別案として初回オープン前のフラグを禁止する実装は、現行UI仕様から予測しづらいため採用しない。

その他:

- `newGame()` と難易度変更時は必ず既存のintervalを停止し、経過時間、盤面、終了状態、`explodedCell` を初期化する。
- タイマーの二重起動を防ぐ。
- ゲーム終了後の全盤面操作はno-opにする。
- DOMセルは `<button type="button">`。座標と状態を含む `aria-label` を更新する。
- `disabled` だけに依存せずイベント側でも状態をガードする。
- CSSクラスは少なくとも `opened`、`flagged`、`mine`、`exploded`、`number-1`〜`number-8` を使い分ける。
- 地雷は敗北時だけ表示する。色だけでなく 🚩 / 💣 / 数字も併用する。

### UI / HTML

- 現行ページに合わせて `../theme.js` と `../theme-toggle.css`、テーマ切替ボタンを置く。
- canonical、OGP、favicon、JSON-LD (`Game`)、GA、AdSense、広告枠、トップ導線、遊び方、プライバシーポリシーを現行ページの形式で含める。
- 難易度ボタンには選択状態を見た目と `aria-pressed` の両方で示す。
- 盤面ラッパーは `overflow-x: auto`。上級盤面は横スクロール可能にする。
- 結果オーバーレイは勝敗、難易度、時間、再挑戦を表示する。

### 自動テスト

添付計画のケースに加え、次を必須にする。

- 盤面を返す全主要関数が入力を変更しない。
- `safeCells` の重複・盤外を含めても正しい候補数で判定する。
- 配置不能な地雷数が `RangeError` になる。
- `generateBoard` の角クリック、辺クリック、中央クリックで存在する安全域すべてが非地雷。
- `floodOpen` がフラグを越えてそのセルを開かず、地雷起点は地雷1セルだけを開く。
- 空盤面に対してUIが初期化前に `isWin` を呼ばないことをコードレビューで確認する。
- `formatTime` は0秒、65秒、10分以上、負数を確認する。

実行:

```bash
node minesweeper/test.js
```

---

## 2. お絵かきの森

### 作成・更新ファイル

```text
drawing-forest/
├── index.html
├── logic.js
├── net.js
├── peerjs.min.js
├── script.js
├── style.css
└── test.js

index.html
sitemap.xml
```

`peerjs.min.js` は既存オンラインゲームの同一vendoredファイルをコピーする。`net.js` は次の薄いラッパーだけにする。

```js
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'drawing-forest-ykobashi-' });
  window.DrawingForestNet = {
    hostRoom: core.hostRoom,
    joinRoom: core.joinRoom,
  };
})();
```

### ルールの正本

- 2人以上。
- ゲーム開始時に描く順番を一度だけランダム化する。
- 全員が1回ずつ描くまとまりを1周とし、3周する。総ターン数は `参加人数 × 3`。
- 各ターンで現在の描き手だけにお題を送る。他の参加者は回答者になる。
- 正規化後の完全一致で自動正解判定する。
- ホストが最初に受信・受理した正解回答で即ターン終了する。
- **正解した回答者へ1点。描き手は加点しない。**
- 不正解は送信した本人だけに返す。
- 描き手は回答フォームを表示せず、ホスト側でも描き手からの回答を拒否する。
- 描き手は諦めてスキップできる。スキップは0点でお題を公開してターン終了する。
- 正解またはスキップ後は全員にターン結果を表示し、ホストだけが「次のターン」を押せる。
- 最終ターン後は得点順、同率順位、同率優勝者を表示する。

### フェーズ

```text
setup → lobby → drawing → round-result → drawing ... → final-result
                                      ↘ aborted
```

独立した操作待ちの `topic-reveal` フェーズは必須ではない。ターン開始時に描き手へ秘密のお題を送って `drawing` に入り、描き手にはお題、他の人には「○○さんが描いています」と表示すれば十分である。追加する場合も、全員の進行を止める新しいホスト操作は増やさない。

「round-result」は実質1人分の描画ターンの結果である。UI上は、`currentTurnInfo` の `round` を「第n周」、`turnInRound` を「この周のn人目」と表示すると誤解が少ない。

### `logic.js` の契約

公開API:

```js
MIN_PLAYERS = 2
ROUNDS = 3
TOPIC_BANK
shuffle(array, rng)
selectRoundTopic(rng, bank, usedTopics)
buildTurnOrder(playerIds, rng)
totalTurns(turnOrder, rounds)
currentTurnInfo(turnOrder, turnIndex, rounds)
normalizeAnswer(value)
isCorrectGuess(guess, topic)
undoLastStroke(segments)
applyScoreDeltas(scores, deltas)
buildScoreboard(scores, roster)
getWinners(scoreboard)
addPlayer(roster, player)
removePlayer(roster, id)
hasMinPlayers(roster, min)
```

要件:

- すべて非破壊。
- `TOPIC_BANK` は絵にしやすい名詞を40〜50語。空文字と正規化後重複を入れない。
- `selectRoundTopic` は未使用を優先し、使い切ったときだけ履歴をリセットする。空バンクは明示的に例外にする。
- `buildTurnOrder` は入力の順列で、入力を変更しない。
- `currentTurnInfo` は空配列、負数、総ターン数以上で `null`。0除算や `undefined` のplayerIdを返さない。
- `normalizeAnswer` は少なくとも NFKC、英字小文字化、trim、全半角、カタカナ→ひらがな、空白・対象記号の除去を行う。空回答は正解にしない。
- `undoLastStroke` は渡された現在ターンの線分配列から、末尾の同一 `strokeId` 群だけを除く。
- `applyScoreDeltas` は未知IDも0点から加算できるが、実際のハンドラではroster内の正解者だけを渡す。
- `buildScoreboard` は得点降順、同点は標準競技順位（1, 1, 3）。同点内はroster順を維持して表示を安定させる。
- `module.exports` と `window.DrawingForestLogic` へ同じAPIを公開する。

### ホスト権威の状態

```js
const HOST_ID = 'host';
let gameId = 0;
let roster = [];
let phase = 'lobby';
let turnOrder = [];
let turnIndex = 0;
let scores = {};
let usedTopics = [];
let currentTopic = null;       // ホストのみ
let segments = [];             // 現在ターンのみ
let processedActions = new Set();
```

各クライアントは `myTopic` を現在ターンだけ保持し、次ターン開始・結果・中断時に必ず消す。`currentTopic` はホスト以外へ公開状態として配信しない。

rosterは開始時に固定する。ゲーム中の新規 `join` は拒否または無視する。切断時にゲーム途中のrosterやturnOrderを変更しない。

### 推奨メッセージ契約

クライアント → ホスト:

```text
join { name }
stroke-segment { gameId, turnIndex, strokeId, x0, y0, x1, y1 }
undo-stroke { gameId, turnIndex }
reset-turn { gameId, turnIndex }
guess { gameId, turnIndex, text, actionId, scopeId }
skip-round { gameId, turnIndex, actionId, scopeId }
```

ホスト → 全員:

```text
roster { players }
turn-state { gameId, turnOrder, turnIndex, rounds, scores }
stroke-segment { gameId, turnIndex, playerId, strokeId, x0, y0, x1, y1 }
undo-stroke { gameId, turnIndex, playerId }
reset-turn { gameId, turnIndex, playerId }
round-result {
  gameId, turnIndex,
  drawerId, drawerName,
  winnerId, winnerName,
  topic, correct, skipped,
  scores, isLastTurn
}
final-result { gameId, scoreboard, winners }
aborted { gameId, reason }
```

ホスト → 特定ゲスト:

```text
topic { gameId, turnIndex, topic }
guess-feedback { gameId, turnIndex, correct: false, text }
guess-ack { gameId, turnIndex, actionId, scopeId, accepted }
skip-ack { gameId, turnIndex, actionId, scopeId, accepted }
```

正解結果のフィールド名は `winnerId` でも `guesserId` でもよいが、実体は正解した回答者である。描き手のIDは必ず別の `drawerId` にする。

`scopeId` は `${gameId}:${turnIndex}`。`actionId` は `crypto.randomUUID()` を優先し、非対応時だけ時刻＋乱数のフォールバックを使う。

### 受信検証

ホストはゲーム内操作を受理する前に、すべて次を確認する。

- `phase === 'drawing'`
- `data.gameId === gameId`
- `data.turnIndex === turnIndex`
- 送信Peer IDがrosterに存在する
- 描画／Undo／全消去／スキップは送信Peer IDが現在の描き手
- 回答は送信Peer IDが現在の描き手ではない
- 回答は `String(...).trim().slice(0, 30)` の範囲
- 線分座標は有限数で `0..320`
- `strokeId` は安全な整数
- 現在ターンの線分数が上限以下

ゲストから `playerId` が届いても使用しない。ホストが接続元の `id` を `playerId` として付け直してからbroadcastする。

正解とスキップがほぼ同時に届いた場合は、ホストのイベントループで最初に受理した操作だけが勝つ。受理した瞬間に `phase = 'round-result'` へ変更してから得点・broadcastを行い、後続操作を拒否する。

`processedActions` は `senderId:type:scopeId:actionId` をキーにする。重複したguess/skipでは得点や結果を再適用せずackだけ再送する。正解時も不正解時もackを返し、送信ボタンの多重押下を防ぐ。

### ターン開始と結果処理

`hostStartGame()`:

1. 最低人数を再確認。
2. `gameId += 1`、rosterを固定。
3. `turnOrder` を一度だけshuffle。
4. 全員のscoreを0で初期化。
5. `usedTopics = []`、`turnIndex = 0`、action履歴を初期化。
6. `hostBeginTurn()`。

`hostBeginTurn()`:

1. `selectRoundTopic` で未使用お題を選ぶ。
2. `phase = 'drawing'`、`segments = []`、`myTopic = null`、描画中状態をリセット。
3. 描き手がホストならローカルにtopicを設定し、ゲストなら `sendTo(drawerId, topicMessage)`。
4. topicを含めない `turn-state` をbroadcast。
5. 同じstateをホスト自身にもローカル適用。

topicとturn-stateは別通信なので受信順が逆転してもよいようにする。どちらも `gameId` / `turnIndex` を照合し、描き手の画面は両方が揃った時点でお題を表示する。

`hostHandleGuess(senderId, text)`:

1. 上記検証と重複検証。
2. 不正解なら本人だけにfeedbackとack。phaseは継続。
3. 正解なら直ちに `phase = 'round-result'`。
4. `scores = applyScoreDeltas(scores, { [senderId]: 1 })`。
5. お題、正解者、描き手、累計点を含む結果をホストへローカル適用し、全員へbroadcast。

`hostHandleSkip(senderId)`:

1. 描き手・スコープ・重複を検証。
2. 直ちに `phase = 'round-result'`。
3. 加点せず、`skipped: true`、`winnerId: null` で結果をローカル適用＋broadcast。

`hostAdvanceTurn()`:

1. ホストだけ、かつ `phase === 'round-result'` のときだけ実行。
2. `turnIndex += 1`。
3. 総ターン数に達したらscoreboard/winnersを作り、`phase = 'final-result'` としてローカル適用＋broadcast。
4. 未到達なら `hostBeginTurn()`。

「同じ部屋でもう一度」はホストだけが実行でき、rosterを維持して `hostStartGame()` を呼ぶ。

### 描画同期

- canvas論理サイズは320×320、CSS表示はレスポンシブ。
- Pointer座標は `getBoundingClientRect()` から論理座標へ変換する。
- `pointerdown` で `setPointerCapture` し、新しい `strokeId` を割り当てる。
- クリックだけでも点が残るよう、`pointerdown` 時にゼロ長線分を1つ作る。`drawSegment` はゼロ長線分を小円として描く。
- `pointermove` は前点から次点の線分を送る。極端に近い点は距離閾値で間引く。
- `pointerup` / `pointercancel` / 権限喪失 / ターン終了でdrawing状態を破棄する。
- 1ターンの線分上限を設ける（目安5,000〜6,000）。ローカル送信側とホスト受信側の両方で制限し、上限到達を描き手へ通知する。
- `segments` は現在ターンだけを保持すればよい。新ターン時に空にすることで、過去ターンのUndo混入を避ける。
- Undoは末尾の同一strokeId群を削除後、全消去して再描画する。
- 全消去は `segments = []` として全員へ同期する。

ホストの `net.broadcast(data)` はホストへ届かないため、次の形を徹底する。

```js
applyStroke(data);
net.broadcast(data);
```

ターンstate、Undo、reset、round result、final result、abortも同様である。

### 切断方針

添付仕様を優先し、30秒再参加やsnapshot復帰は今回のスコープに入れない。

- ロビー中: ホストが切断者をrosterから削除してrosterを再配信。
- ゲーム中: ホストが `phase = 'aborted'` にし、全員へ `aborted` をbroadcastして「参加者が切断したため中断しました。最初からやり直してください」と表示。
- ホスト切断: ゲスト側の `onDisconnected` で同じ中断案内を表示。
- 中断後はゲーム操作をすべて無効化し、初期画面へ戻る／再読み込みボタンを出す。

`NetCore` のheartbeatとシグナリング再登録はそのまま使うが、これはゲームDataConnectionの再参加機能ではない。

再参加を実装しないため `rejoin-storage.js` は不要。guess/skipの送信確認を実装する場合は `ack-send.js` を読み込む。推奨スクリプト順:

```text
peerjs.min.js
../common/net-core.js
../common/peer-errors.js
../common/wake-lock.js
../common/ack-send.js
logic.js
net.js
script.js
```

### UI / HTML

- setup: 名前、ホスト作成、6桁コード参加、エラー。
- lobby: コード、コピー、名簿、2人以上で有効な開始ボタン。
- drawing: 第n周／この周の順番、描き手名、canvas、累計得点。
- 描き手のみ: 秘密のお題、Undo、全消去、諦める。
- 回答者のみ: 回答input、送信、不正解feedback。
- round-result: お題、正解者またはスキップ、得点変化、累計得点。次へはホストのみ。
- final-result: 順位、点数、同率優勝、同じ部屋でもう一度（ホストのみ）。
- aborted: 中断理由とやり直し導線。

通信状態、ターン、回答feedback、結果は適切な `role="status"` / `aria-live="polite"` を使う。入力にはlabelまたはaria-label、ボタンには `type="button"`、canvasにはaria-labelを付ける。

秘密のお題はDOM上でも描き手だけに設定する。`turn-state`、roster、スコア、通常のログに含めない。ただし固定のお題バンク自体が配信JavaScriptから読めることは静的サイトの性質上許容する。

### 自動テスト

添付計画のケースに加え、次を必須にする。

- `selectRoundTopic` の空バンクと、正規化後重複がないバンク。
- `currentTurnInfo([], 0)` と負数・上限ちょうどで `null`。
- `normalizeAnswer` の半角カナ、全角英数、空白、長音・記号の方針を固定したテスト。
- 空回答同士が正解にならない。
- `undoLastStroke` が同じstrokeIdを持つ末尾の連続群だけを取り除き、入力を変更しない。
- scoreは**正解者ID**へ1点加算される前提でテストする。
- score 0を含む同点順位と、複数優勝者。
- 名簿のID重複を拒否し、入力名簿を変更しない。

実行:

```bash
node drawing-forest/test.js
```

ロジックテストだけでは通信契約を保証できないため、可能なら `validSegment`、操作受理条件、scope照合を純粋関数として切り出してNodeテストする。少なくともブラウザ2タブでホスト／ゲスト双方が描き手になるケースを確認する。

---

## 3. ルート統合

`index.html`:

- `#games` のスネークゲーム付近にマインスイーパー。
- `#party-games` のお絵描きウルフ／共犯ドローイング付近にお絵かきの森。
- 件数バッジは既存JavaScriptが `.card` を数えるため手更新しない。

`sitemap.xml`:

```xml
<url><loc>https://ykobashi.github.io/minesweeper/</loc></url>
<url><loc>https://ykobashi.github.io/drawing-forest/</loc></url>
```

カード文言:

```html
<a class="card" href="minesweeper/index.html">
  <h3>マインスイーパー</h3>
  <p>数字を頼りに地雷を避けて全マス開放を目指す定番パズル</p>
</a>

<a class="card" href="drawing-forest/index.html">
  <h3>お絵かきの森</h3>
  <p>描かれていく絵からお題を早当てするお絵描きクイズ(2人〜)</p>
</a>
```

---

## 4. 完了判定

自動確認:

```bash
node minesweeper/test.js
node drawing-forest/test.js
```

両方が `All tests passed` を出すこと。

ブラウザ確認:

### マインスイーパー

- 全難易度の寸法・地雷数
- 初回セル＋8近傍の安全性（角・辺・中央）
- 初回前フラグの保持
- 右クリックとフラグモード
- 0連鎖、勝利、地雷クリック、爆発セル強調、全地雷公開
- タイマー開始・停止・リセット
- 上級盤面のスマホ横スクロール
- ライト／ダークテーマ

### お絵かきの森

- 2タブ以上で入室、名簿、開始可否
- ホストが描き手のターンとゲストが描き手のターン
- お題が描き手以外へ表示・broadcastされない
- 点、線、Undo、全消去の全画面同期
- 不正解が本人だけに見える
- 正解者だけに1点入り、即ターン終了する
- 描き手の回答拒否
- スキップは0点
- ホストだけが次ターンへ進める
- 全員3回ずつ描いた後の順位・同率優勝
- 同じ部屋でもう一度
- 古い `gameId` / `turnIndex` の操作が無視される
- ロビー切断とゲーム中断
- canvasのスマホ座標ずれ、スクロール抑止、ライト／ダークテーマ

この完了判定を満たすまで、トップカードだけ存在してゲーム本体が不完全な状態にしないこと。
