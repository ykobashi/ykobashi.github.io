# drawing-wolf 実装調査メモ

調査対象: `ito-game`、`insider-game`、`word-wolf`。新規ゲームは後者2つの組み合わせにするのが最も自然である。`insider-game` はスター型ロビー・秘密役職配布・投票、`word-wolf` は「人狼を当てた後に本人だけが回答する」逆転処理をすでに持つ。

## 採用するファイルの土台

| 作るファイル | 主な参照元 | 再利用する点 |
| --- | --- | --- |
| `net.js` | `ito-game/net.js` | 複数ゲストを `Map` で保持する `hostRoom` / `joinRoom` 全体 |
| `script.js` | `insider-game/script.js` + `word-wolf/script.js` | ロビー・投票・再戦は前者、逆転回答と結果オーバーレイは後者 |
| `index.html` | `insider-game/index.html` | SEO、広告、セットアップ、ロビー、結果、遊び方の構造 |
| `style.css` | `insider-game/style.css` または `word-wolf/style.css` | 共通カード、投票、オーバーレイ、ライト/ダークモード |
| `logic.js` / `test.js` | `insider-game/logic.js` | DOM なし・CommonJS と `window.DrawingWolfLogic` の二重公開、Node `assert` テスト |

## 通信・ロビー

`net.js` は `ito-game/net.js` をコピーして、次だけ変更する。

- `ROOM_PREFIX = 'drawing-wolf-ykobashi-'`
- 最後の公開名を `window.DrawingWolfNet = { hostRoom, joinRoom }`
- `hostRoom` の `broadcast(data)`、`sendTo(peerId, data)`、`peerIds()`、`destroy()` は維持する。
- `joinRoom` の `onOwnId(id)` は必須。ゲストが自分の描画線と受信した線を照合するために使う。

ロビーは `insider-game/script.js` の状態と手順をそのまま使える。

1. ホストは固定 ID の `HOST_ID = 'host'` を自分に割り当て、`onCode` で自分を `roster` に加える。
2. ゲストは `joinRoom` の `onConnected` 後に `{ type: 'join', name }` を送る。
3. ホストは `addPlayer`、`renderRoster`、`broadcastRoster()`（`{type:'roster', players: roster}`）を行う。
4. 切断時はロビーなら `removePlayer`→名簿再配布、ゲーム中なら既存ゲーム同様に「モード選択に戻ってください」の接続エラーを出す。進行中の盤面や役職は再同期しない。
5. 開始ボタンはホストにだけ表示し、`DrawingWolfLogic.hasMinPlayers(roster)` で有効化する。

PeerJS エラー文言は `insider-game/script.js` の `describePeerError` を転用する。コードコピーも `navigator.clipboard.writeText` の失敗時に手動コピー用の文言を表示する実装を使う。

## 役職・フェーズのメッセージ設計

ホストだけが正解のお題・人狼 ID・投票を保持する。全員にお題を含む開始メッセージを送らないこと。

| 送信元 | メッセージ | 受信側の処理 |
| --- | --- | --- |
| host | `{type:'roster', players}` | 名簿を置換して描画・投票の名前解決にも使う |
| host → 各人 | `{type:'role', role:'wolf'}` または `{type:'role', role:'human', topic}` | `myRole` と `myTopic` を設定。人狼には `topic` を絶対に入れない |
| host | `{type:'turn-state', turnOrder, turnIndex, rounds:3}` | 現在手番を再描画、`currentTurnInfo` で描き手とラウンドを表示 |
| 描き手 → host | `{type:'stroke-segment', playerId, x0,y0,x1,y1}` | host が妥当性を確認して全員へ `broadcast` |
| 描き手 → host | `{type:'turn-done', playerId}` | host が現在手番本人か確認後、次 `turn-state` または投票フェーズへ |
| host | `{type:'phase', phase:'voting'}` | 投票 UI を開く |
| 各人 → host | `{type:'vote', voterId, votedForId}` | host が記録して進捗を更新 |
| host | `{type:'phase', phase:'wolf-guess', wolfId, wolfName, tally}` | 全員を回答画面へ。`myId === wolfId` のみ入力を表示 |
| 人狼 → host | `{type:'wolf-guess', answer}` | host が `isCorrectGuess(answer, topic)` で判定 |
| host | `{type:'result', ...}` | 全員で結果オーバーレイを表示 |

ホスト自身が描く場合は線分送信と `turn-done` をネットワーク経由にせず、同じホスト側処理関数を直接呼ぶ。ゲストの描画線は送信直後にローカル描画し、受信時は `data.playerId === myId` なら描画しないので二重線を防げる。

受信データは既存実装同様、先頭で `!data || typeof data !== 'object'` を弾く。加えて描画ゲームではホスト側で、`playerId` が接続 ID と一致すること、現在の描き手であること、座標が有限数かつ 0〜320 の範囲内であることを確認してから中継する。`turn-done` と `vote` も送信者 ID とデータ中の ID が一致するか、フェーズに合っているかを検証する。

## `script.js` の状態と進行

`insider-game/script.js` の「DOM 参照を先頭に集約し、IIFE 内の状態を更新する」型を踏襲する。主な状態は次で足りる。

```js
let isHost = false, myId = null, myName = '', net = null, conn = null;
let roster = [], myRole = null, myTopic = null;
let wolfId = null, topic = null, turnOrder = [], turnIndex = 0;
let votes = {}, myVoteCast = false;
```

開始時のホスト処理は `hostStartRound()` に集約する。

1. `playerIds = roster.map(p => p.id)` から `assignWolf`、`pickTopic`、`buildTurnOrder` を呼ぶ。
2. 各参加者に個別 `role` を配り、ホスト分はローカル状態へ直接設定する（`insider-game` の `hostStartRound` と同じ方式）。
3. キャンバスをクリアして、票・手番を初期化する。
4. `{type:'turn-state', turnOrder, turnIndex:0, rounds:3}` を `broadcast` し、ホストにも同じ `applyTurnState` を直接適用する。

`turn-done` をホストで受けたら `turnIndex + 1` を計算する。`turnIndex < turnOrder.length * ROUNDS` なら次の `turn-state`、そうでなければ `votes = {}` にして `{type:'phase', phase:'voting'}` を送る。投票 UI は `insider-game` の `enterVotingScreen`、`renderVotingCandidates`、`castVote`、`updateHostVoteProgress` をそのままベースにできる（候補から自分を除外、1 人 1 票、ホストだけ集計ボタン）。

集計では、全票到着を必須にする場合は `word-wolf` の `tally` ハンドラ同様に件数を確認してホスト向け文言を残す。`tallyVotes` と `determineWolfCaught` の結果が false（同率トップを含む）なら即 `result` を broadcast して人狼勝利。true のときだけ `wolf-guess` へ遷移する。回答の正誤と勝者を決めるのはホストのみで、結果 payload には `wolfId`/`wolfName`、`topic`、`wolfCaught`、`guess`、`guessCorrect`、`winner`、`counts`、名前解決用 `roster` を入れる。

再戦は `word-wolf` の `again` と同じくホストだけに表示し、クリック時に `hostStartRound()` を呼ぶ。接続を作り直さず、同一名簿・同一ルームを使う。

## canvas 実装の注意点

- HTML は `<canvas id="drawing-canvas" width="320" height="320"></canvas>` とし、属性サイズを 320 固定にする。CSS は `width: min(100%, 320px); height: auto; touch-action: none;` を付ける。
- ポインター座標は `getBoundingClientRect()` と `canvas.width / rect.width`、`canvas.height / rect.height` の倍率で変換する。画面上の CSS サイズをそのまま送らない。
- `pointerdown` で `setPointerCapture(event.pointerId)` と開始点を記録し、`pointermove` は押下中かつ現在手番だけで線分を作る。`pointerup`/`pointercancel` で終了する。
- 各線分を `ctx.beginPath(); moveTo(x0,y0); lineTo(x1,y1); stroke();` で同じ描画関数に集約する。受信線・ローカル線の見た目を一致させるため、線色・太さ・`lineCap = 'round'` は初期化時に固定する。
- `turn-state` 受信時は「現在の描き手名」「何ラウンド目か」「自分が描けるか」「描き終わったボタン」を更新する。キャンバス全体の `pointer-events` を切るだけでなく、イベント側でも手番 ID を検査する。
- ブラウザ再描画や途中参加の盤面同期は既存ゲームの範囲外。今回も再接続なし仕様に合わせ、盤面スナップショット配布は実装しない。

## HTML / CSS の具体的な再利用

`index.html` は `insider-game/index.html` の以下を残して内容を置換する: `site-nav`、`site-header`、AdSense/GA、canonical/OGP/JSON-LD、`setup-screen`、`lobby-panel`、`result-overlay`、`howto`、footer、末尾の `logic.js → peerjs.min.js → net.js → script.js` の順。

ゲーム領域には次の ID を追加して `script.js` と一対一にする: `role-box` / `role-title` / `topic-box` / `topic-title`、`turn-status`、`drawing-canvas`、`turn-done-btn`、`voting-panel` / `voting-candidates` / `voted-status` / `host-tally-box` / `vote-progress` / `tally-btn`、`wolf-guess-panel` / `wolf-guess-input` / `wolf-guess-btn`、`game-connection-status`、`quit-btn`。画面切替は既存通り `.hidden { display:none !important; }` を使う。

CSS は `insider-game/style.css` をベースに、`canvas-wrap`（中央配置、カード背景）、`drawing-canvas`（白背景、枠、丸角、`touch-action:none`）、`turn-status`、`drawing-controls`、`wolf-guess-panel` を足す。ダークモードではキャンバスだけは白系のままにして黒線の視認性を確保し、周囲のカード・入力・境界線は既存の `@media (prefers-color-scheme: dark)` の対象に追加する。既存の `max-width:520px`、結果の `max-height:85vh; overflow-y:auto` はスマホで有効なので維持する。

## トップページ・テスト

- `index.html` の「🎉 みんなで遊ぶ」カード群に、`drawing-wolf/` へのカードを既存カードと同じ HTML 構造・並び順で追加する。
- `sitemap.xml` には `https://ykobashi.github.io/drawing-wolf/` を既存 URL と同じ書式で追加する。
- `test.js` は `node:assert` で、人狼が 1 人だけであること、手番順とラウンド境界、正規化付き正解判定、最多票と同数票、ロビーの add/remove/min 人数を固定 RNG で検証する。終了行は既存規約どおり `console.log('All tests passed')`。
