# お絵かきの森（`drawing-forest/`）実装調査

## 結論

既存の `drawing-wolf` を画面・キャンバス・ホスト主導のターン制の土台にし、ネットワークは現在の共通 `NetCore` を使う小さなラッパーにするのが最も整合的です。`ito-game/net.js` を旧来どおり丸ごと複製するのではなく、現行の同ファイルと同じラッパー形式にします。

```js
// drawing-forest/net.js
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'drawing-forest-ykobashi-' });
  window.DrawingForestNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
```

`common/net-core.js` は PeerJS のスター型通信を提供し、ホストには `broadcast` / `sendTo`、ゲストにはホストへの単一接続を渡します。6文字コード、最大12ゲスト、heartbeat とシグナリング再登録もここで処理済みです。

## 参照した既存実装

- `drawing-wolf/`: 共有320x320キャンバス、ストローク単位のUndo、ロビー、ホスト権威、ターン順・結果画面の基本形。
- `picture-telephone/`: Pointer Events の座標正規化、キャンバス再描画、ストローク上限・データ検証の参考。
- `accomplice-drawing/`: `gameId` / ラウンドをスコープにしたメッセージ検証、再接続用snapshotと切断中断の扱い。
- `dictionary-quiz/logic.js`: `selectRoundWord`、得点差分の非破壊適用、同点順位を含むスコアボードの形。
- `common/net-core.js`, `ack-send.js`, `wake-lock.js`, `rejoin-storage.js`: 通信・送信確認・画面スリープ抑止・再参加トークンの共通部品。

## 推奨する状態遷移

`setup → lobby → topic-reveal → drawing → round-result → drawing ... → final-result`

1. ホストが開始時に roster を固定し、`turnOrder = buildTurnOrder(ids)`、`scores = {id: 0}`、`usedTopics = []`、`turnIndex = 0` を作る。
2. `hostBeginTurn()` が未使用のお題を1つ選び、**現在の描き手だけ**へ `topic` を `sendTo` する。同時に全員へ `turn-state` を broadcast する。
3. 描き手だけが描画・Undo・全消去・「このターンをスキップ」・回答欄を操作できる。回答送信は描き手からホストのみへ送る。
4. ホストは回答を正規化してお題と比較する。正解なら即 `round-result`、不正解は描画と回答を継続させ、当人だけに `guess-feedback` を返す。
5. スキップ時も回答正解時も、そのターンの結果を全員へ表示し、ホストの「次のターン」で `turnIndex + 1`。`totalTurns(turnOrder, ROUNDS)` 到達で `final-result`。

仕様に「回答を当てたら得点」と明記されているため、推奨スコアは `correct ? { [drawerId]: 1 } : {}` です。`applyScoreDeltas` で更新して結果payloadへ累計を載せれば、全クライアントの表示が同一になります。スキップは0点です。

## 描画同期の設計

キャンバス自体（PNG/Base64）を送らず、次のような小さな線分だけを送ります。

```js
{ type: 'stroke-segment', gameId, turnIndex, playerId, strokeId,
  x0, y0, x1, y1 }
```

- Pointer座標は `canvas.getBoundingClientRect()` を基に、CSS表示サイズから固定論理サイズ `320 x 320` に変換する。高DPI/CSS縮小でも全員が同じ座標で再生できる。
- `pointerdown` で `setPointerCapture`、`pointermove` ごとに前点→次点を送信、`pointerup` と `pointercancel` で終了する。描画の権限は `phase === 'drawing' && currentTurn.playerId === myId` で厳密に判定する。
- ゲストの線分はホストで `gameId`、`turnIndex`、送信者ID＝現描き手、数値有限、範囲 `0..320`、件数上限を検証してから `broadcast` する。ホスト自身の線分はローカルに描いてから broadcast する。
- 受信側は `segments` に保存して直ちに描画する。Undo/全消去ではキャンバスを `clearRect` 後に `segments` から再描画する。対象ターン以外の線分を消さない。
- `undo-stroke{gameId,turnIndex,playerId}` は現在ターンの末尾の同一`strokeId`群だけを削除、`reset-turn{...}` は当該turnの線分だけを削除する。いずれもホストが検証してから broadcast する。

注意: クリックだけでは `pointermove` が発火せず点が残らない。必要なら `pointerdown` 時にごく短いゼロ長線分を記録し、`drawSegment` 側で最小の点を描くか、仕様上「線のみ」として受容するかを決める。既存ゲームと同じ線分方式なら後者でも動作は一貫する。

## メッセージ契約

クライアント→ホスト:

- `join {name, token, joinRequestId}`
- `stroke-segment {...}`
- `undo-stroke {gameId, turnIndex}`
- `reset-turn {gameId, turnIndex}`
- `skip-round {gameId, turnIndex, actionId, scopeId}`
- `guess {gameId, turnIndex, text, actionId, scopeId}`

ホスト→全員:

- `roster {players}`
- `turn-state {gameId, turnOrder, turnIndex, rounds, scores}`
- 検証済みの描画変更（`stroke-segment` / `undo-stroke` / `reset-turn`）
- `round-result {gameId, turnIndex, drawerId, drawerName, topic, correct, skipped, scores, isLastTurn}`
- `final-result {gameId, scoreboard, winners}`

ホスト→描き手だけ:

- `topic {gameId, turnIndex, topic}`
- `guess-feedback {gameId, turnIndex, correct:false, text}`
- 必要なら送信確認の `guess-ack` / `skip-ack`。

`gameId` と `turnIndex` をすべてのゲーム内操作に含める。遅延した前ターンの線・Undo・回答を受け入れないために必要で、`drawing-wolf` より安全です。ゲスト側も受信時に両方を照合します。

## UIの推奨構成

`drawing-wolf/index.html` の構成を基準に以下を置く。

- setup: ニックネーム、ホスト作成、6桁コード参加、エラー表示。
- lobby: 共有コード、コピー、名簿、ホストの開始ボタン（2人以上）。
- topic reveal: 描き手だけにお題を大きく表示。他プレイヤーには「○○さんがお題を受け取りました」。
- drawing: ターン/ラウンド表示、共有canvas、描き手限定のUndo/全消去/スキップ、描き手限定の回答input・送信。全員に累計得点を小さく表示する。
- round result: お題、正解者、得点増減、次へ（ホスト限定）。これを一度挟めば、正解・スキップとも進行を参加者が確認できる。
- final result: `buildScoreboard` の順位・点数、同率優勝者、同じ部屋でもう一度（ホスト限定）。

アクセシビリティとして、通信エラーとターン・結果の通知領域は `role="status" aria-live="polite"`、canvasには `aria-label`、操作ボタンには `type="button"` を付与する。テーマは `../theme.js` と `../theme-toggle.css` を読み込む。スクリプト順は PeerJS → common依存 → `logic.js` → `net.js` → `script.js`。

## logic.js / test.js

純粋関数は添付計画どおり、`MIN_PLAYERS = 2`、`ROUNDS = 3`、お題バンク、`shuffle`、`selectRoundTopic`、`buildTurnOrder`、`totalTurns`、`currentTurnInfo`、`normalizeAnswer`、`isCorrectGuess`、`undoLastStroke`、`applyScoreDeltas`、`buildScoreboard`、`getWinners`、名簿関数を export する。

テストはNode標準`assert`のみで、少なくとも次を固定乱数で確認する。

- お題重複なしの選択と、バンクを使い切ったときの再利用規則。
- 全プレイヤーを一回ずつ含むターン順、人数×3のターン数、最終ターンの境界。
- ひらがな/カタカナ/全半角・空白を吸収する回答一致。
- 末尾ストロークだけを非破壊で取り消すこと。
- 複数ターンの得点差分、同点を含む順位と優勝者。
- 名簿の重複防止、削除、2人以上の開始可否。

完了条件は `node drawing-forest/test.js` が `All tests passed` を出すこと。最後にトップの `#party-games` 内で `drawing-wolf` / `accomplice-drawing` の近くへカードを追加する。

## 切断・安全性の注意

添付仕様の「ロビー中は名簿から削除、ゲーム中は中断」を優先するなら、既存の30秒再参加機能は導入しない。`onPeerDisconnected` で lobby は `removePlayer` + roster再配信、ゲーム中はホストが `aborted` をbroadcastして「モード選択に戻る」を表示する。

ただし `NetCore` 自体のheartbeat/reconnect機構は共通基盤なので残る。これはDataConnectionのゲーム再接続を実現するものではない。ゲーム途中で名簿を変えたり、現在の描き手以外の操作を受け入れたりしないことが重要。

Canvas線分はメッセージ頻度が高い。座標・文字列長・線分数を検証し、1ターン当たりの線分数（例: 5,000）を上限にする。回答は`trim().slice(0, 30)`、名前は既存と同じ10文字に制限する。秘密のお題は `sendTo` 以外に含めず、`turn-state`・snapshot・ブラウザの通常表示にも入れない。
