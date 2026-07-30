# オンライン通信基盤・共通化 調査メモ

対象は「みんなで遊ぶ」14ゲームのみ。`gomoku` / `memory-match` および創作ゲーム3本は対象外。

## 結論

14本の `net.js` は公開名と `ROOM_PREFIX` を除けばほぼ同型であり、`common/net-core.js` に安全に集約できる。ただし `word-wolf/net.js` は圧縮気味の別記法、`word-detective/net.js` だけは `send()` の例外捕捉が先行実装されている。共通化時は後者を標準にする。

`net-core.js` は既存 API の引数・戻り値を保ったまま、(1) Peer signaling の `disconnected` で `peer.reconnect()`、(2) ping/pong による健康状態通知、(3) `send()` 例外捕捉を追加する。DataConnection 自体が切断済みの場合の再接続を行う機能ではない点は明記が必要。

## 対象14本と固定すべき識別子

| slug | roomPrefix | 公開グローバル |
|---|---|---|
| ito-game | `ito-ykobashi-` | `ItoNet` |
| ng-word-battle | `ngwordbattle-ykobashi-` | `NgWordBattleNet` |
| taboo-word-game | `tabooword-ykobashi-` | `TabooWordNet` |
| insider-game | `insidergame-ykobashi-` | `InsiderGameNet` |
| one-night-werewolf | `werewolf-ykobashi-` | `WerewolfNet` |
| tahoiya | `tahoiya-ykobashi-` | `TahoiyaNet` |
| word-wolf | `wordwolf-ykobashi-` | `WordWolfNet` |
| word-detective | `worddetective-ykobashi-` | `WordDetectiveNet` |
| drawing-wolf | `drawing-wolf-ykobashi-` | `DrawingWolfNet` |
| accomplice-drawing | `accomplice-drawing-ykobashi-` | `AccompliceDrawingNet` |
| picture-telephone | `picture-telephone-ykobashi-` | `PictureTelephoneNet` |
| ai-nickname-game | `ai-nickname-game-ykobashi-` | `AiNicknameGameNet` |
| dictionary-quiz | `dictionary-quiz-ykobashi-` | `DictionaryQuizNet` |
| wikipedia-quiz | `wikipedia-quiz-ykobashi-` | `WikipediaQuizNet` |

各 `net.js` は次の薄いラッパーだけにする。

```js
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: '...' });
  window.XxxNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
```

## `common/net-core.js` の具体仕様

- IIFE で `window.NetCore = { create }` を公開。ブラウザ専用でよく、Node export は不要。
- `create({ roomPrefix })` は `{ hostRoom, joinRoom }` を返す。
- ルームコードは従来通り `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` から6文字。ホストは ID 重複時に最大5回再生成。
- `hostRoom(handlers, attemptsLeft)` の返却値は従来通り `{ peer, broadcast, sendTo, peerIds, destroy }`。
- `joinRoom(code, handlers)` の返却値は従来通り `Peer` オブジェクト（この契約を変えると各 `script.js` の `peer.destroy()` 等が壊れる可能性がある）。
- host/guest の `peer` に次を登録する。

```js
peer.on('disconnected', () => {
  if (!peer.destroyed) peer.reconnect();
});
```

- heartbeat 定数は `HEARTBEAT_INTERVAL_MS = 5000`、`HEARTBEAT_TIMEOUT_MS = 12000`。
- 内部メッセージは `{ __netcore: 'ping' }` / `{ __netcore: 'pong' }`。受信時は内部で消費し、ゲーム側の `onPeerMessage` / `onMessage` へ流さない。
- host は接続ごとに最終応答時刻と健康状態を管理し、任意ハンドラ `onConnectionHealthChange(peerId, isHealthy)` を状態変化時に呼ぶ。
- guest はホスト接続について任意ハンドラ `onConnectionHealthChange(isHealthy)` を状態変化時に呼ぶ。
- ping の受信側は即座に pong を返す。pong または有効な受信で最終応答時刻を更新する設計が安全。
- `destroy()`、guest の close/destroy 相当、connection close 時には interval/timeout を必ず解放する。特に再帰的な hostRoom 再試行で古いタイマーを残さない。
- `broadcast` / `sendTo` は `c.open` を確認し、`c.send(data)` を `try/catch`。例外時に `handlers.onError(err, peerId)`。これは現行 `word-detective` の実装を全体へ展開するもの。

### net-core の互換性リスク

1. `peer.reconnect()` は signaling server への再登録だけで、切れた DataConnection を張り直さない。rejoin プロトコルとは別物。
2. `handlers.onConnectionHealthChange` は optional にしないと全既存ゲームが即時に例外化する。
3. host の `unavailable-id` 再試行では最初に返した controller と再生成した Peer/controller が一致しない現行問題がある。既存 API を厳密維持するなら、controller 内部の `peer` 参照を差し替える設計が望ましい。単純な再帰呼び出しは呼び出し元が古い `peer` を保持する。
4. heartbeat メッセージをゲームハンドラに通すと、type 未定義メッセージとして誤処理され得る。
5. `onConnectionHealthChange(false)` の連続発火を避け、状態が変わった時だけ通知する。

## `index.html` の統一

全14本で末尾の script 順を次に統一する。

```html
<script src="peerjs.min.js"></script>
<script src="../common/net-core.js"></script>
<script src="../common/peer-errors.js"></script>
<script src="../common/wake-lock.js"></script>
<script src="../common/rejoin-storage.js"></script>
<script src="../common/ack-send.js"></script>
<script src="logic.js"></script>
<script src="net.js"></script>
<script src="script.js"></script>
```

`Peer` は `net-core.js` より先、`NetCore` は各 `net.js` より先が必須。`ai-nickname-game` の `characters.js` はゲーム固有依存なので残し、`logic.js` より前の現行位置を維持する。

`word-wolf` は現在 `../insider-game/peerjs.min.js` を参照しており、ローカル `word-wolf/peerjs.min.js` が存在しない。指示通り `insider-game/peerjs.min.js` をコピーし、自前参照へ変更する。調査時点のコピー元 MD5 は `D7785173F2C5A4DE1718786C8B2291E1`。

## `common/peer-errors.js`

IIFE で `window.PeerErrors.describe(err)` を公開し、以下へ統一する。

- `peer-unavailable`: `部屋が見つかりません。コードを確認してください。`
- `network` / `socket-error`: `ネットワークエラーが発生しました。通信環境をご確認ください。`
- `unavailable-id`: `部屋を作れませんでした。もう一度お試しください。`
- `timeout`: `接続がタイムアウトしました。同じWi-Fi内でも接続できないことがあります。`
- その他/null: `接続できませんでした。ルームコードや通信状態を確認してください。`

`common/test.js` は上記4系統に加え未知 type と null を Node 標準 `assert` で確認し、最後に `All tests passed`。ブラウザ公開とテストを両立させるなら、実装関数を `module.exports` にも条件付き公開するか、テスト側で VM を使う必要がある。指示文には common はブラウザ専用ともあるため、最小なのは条件付き export（ブラウザ挙動に影響なし）。

各 `script.js` の `describePeerError` / `peerError` / `errorText` は名称が不統一。削除して `PeerErrors.describe(err)` に寄せる際、ボタン再有効化や `console.error` など副作用は残すこと。

## `common/wake-lock.js`

公開 API は `window.WakeLockHelper = { enable, disable }`。

- `enable()` は visibilitychange listener を一重登録し、`navigator.wakeLock` があれば screen lock を acquire。
- sentinel の `release` 発火で sentinel を null にする。
- 非表示→表示へ戻り、enabled かつ sentinel が null なら再 acquire。
- `disable()` は listener を解除、sentinel があれば `release()`、null 化。
- 非対応ブラウザ・拒否・権限エラーは握り、ゲーム進行を止めない。

ゲーム側はホストで `onCode` 直後に `enable()`、明示 quit/終了で `disable()`。ホストのページ更新中はブラウザ側が解放するため、再ロード後の自動取得は今回の「ホストrejoin対象外」と整合する。

## `common/rejoin-storage.js`

sessionStorage 専用。公開 API:

```js
window.RejoinStorage = {
  load(gameKey),
  save(gameKey, session),
  clear(gameKey),
  newToken()
};
```

- キーはゲーム間衝突を避け `ykobashi-rejoin-` + gameKey。
- `load` は JSON parse エラー、storage 例外、形式不正なら `null`（可能なら破損値を削除）。
- `save` / `clear` は SecurityError・quota 等を握り、ゲームを止めない。
- `newToken` は `crypto.getRandomValues` を優先。token は推測困難で URL-safe な十分長い文字列（例: 16 bytes → hex 32文字）。fallback は `Math.random` と時刻。
- 保存値は最低 `{ roomCode, token, name }`。タブ内の再読み込みに限定され、sessionStorage の性質上別タブ共有はしない。

### rejoin 側の重大な統合リスク

- token を roster に保持するが、roster broadcast に token を含めると全員へ再参加資格を漏らす。ホスト内部 roster と公開 roster を分けるか、broadcast 時に token を除去すべき。
- `pendingRejoins` は `Map<token, { oldPeerId, timer... }>` の方がタイマー解除に必要。
- 新 Peer ID へ Map/Set/オブジェクトキーを移す処理はゲーム固有。単なる roster ID 差替えだけでは votes/assignments/scores が壊れる。
- rejoin 失敗時は保存を clear して通常セットアップへ戻さないと無限再試行になる。
- quit/正常終了時の全導線で clear が必要。取りこぼしは「新しい部屋を作り直したのに古い部屋へ戻る」不具合になる。

## `common/ack-send.js`

公開 API は `window.AckSend.attempt(options)`。想定契約:

```js
const attempt = AckSend.attempt({
  send,
  timeoutMs: 10000,
  onPending,
  onConfirmed,
  onFailed
});
attempt.confirm();
attempt.cancel(); // 画面遷移・終了時の後始末用に用意すると安全
```

- 呼出直後に `onPending()`、`send()` を実行。
- timeout までは一定間隔で再送する（例 2秒）。`send()` 例外は最終 timeout までは再試行可能。
- `confirm()` は冪等、タイマーを全解除し `onConfirmed()` は1回だけ。
- timeout 到達でタイマー解除、`onFailed()` は1回だけ。
- `send`、各 callback の例外でタイマー管理が壊れないよう try/finally または個別 catch。
- ack 消失による再送を前提に、ホスト受信処理は冪等化必須。少なくとも `actionId` を送信に付け、ホストは `(peerId, actionId)` の処理済み集合を持ち、重複時は再処理せず ack だけ返す。指示の worked example のように actionId なしで vote を再送すると、投票は代入なので偶然安全でも、スコア加算・提出配列 append は二重処理になる。

対象 action:

- `vote`: word-wolf, drawing-wolf, insider-game, one-night-werewolf, tahoiya, accomplice-drawing
- `answer` / `submit` / `fake`: ai-nickname-game, dictionary-quiz, wikipedia-quiz, taboo-word-game, picture-telephone（既存方式を移植）
- `claim`: ng-word-battle
- `guess`: word-detective

## 実装順の推奨

1. common 5ファイルと `common/test.js`
2. 14ラッパーと index script 順、word-wolf の PeerJS コピー
3. 全ゲームの従来テスト＋2タブ基本接続
4. PeerErrors / WakeLock / health banner
5. ACK（actionId による受信冪等性をセットで）
6. rejoin（word-wolf、picture-telephoneで型を固めてから残りへ）

共通化と game-specific rejoin/ACK を一度に混ぜると障害箇所を分離しにくい。まず既存 API 互換の net-core を確認してから上位プロトコルを載せるべき。
