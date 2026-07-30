# オンライン通信信頼性改善: テスト調査・検証計画

## 調査範囲

対象は次の14ゲーム。

`ito-game`, `ng-word-battle`, `taboo-word-game`, `insider-game`,
`one-night-werewolf`, `tahoiya`, `word-wolf`, `word-detective`,
`drawing-wolf`, `accomplice-drawing`, `picture-telephone`,
`ai-nickname-game`, `dictionary-quiz`, `wikipedia-quiz`

2026-07-26、変更着手直後の `feature/online-reliability` で各
`node <slug>/test.js` を実行し、14本すべて `All tests passed` を確認した。
既存テストは `logic.js` の純粋関数が対象であり、DOM、PeerJS、タイマー、
sessionStorage、Wake Lock、メッセージ送受信の結線はテストしていない。

## 現状の構造とテスト上の注意

- 全14ゲームに `index.html`, `logic.js`, `net.js`, `script.js`,
  `style.css`, `test.js` がある。
- `word-wolf` だけローカル `peerjs.min.js` がなく、現在は
  `../insider-game/peerjs.min.js` を参照している。実装後はローカルコピーに
  変わるため、ファイルの存在と既存コピーとのハッシュ一致を検査する。
- 多くのページは通常の複数行HTMLだが、`word-detective`,
  `drawing-wolf`, `accomplice-drawing`, `ai-nickname-game` は大部分が
  1行に圧縮されている。行単位のレビューだけでは script 順や要素重複を
  見落としやすい。
- 既存の通信状態表示候補は二系統ある。
  - `ito-game` 等: `game-connection-status`, `online-status`,
    `online-error`
  - `word-wolf` 等: `disconnect`, `status`, `error`
  新しい不安定通知要素は既存IDと衝突させず、全ページで一意にする。
- 最低人数は2人が9本、3人が4本
  (`insider-game`, `one-night-werewolf`, `word-wolf`, `drawing-wolf`)、
  4人が1本 (`accomplice-drawing`)。全ゲームの実通信確認を厳密に行う場合、
  ブラウザコンテキストを人数分開く必要がある。

## 自動テスト計画

### 1. 既存ロジックの回帰

実装前後で次を全件実行する。

```powershell
$games = @(
  'ito-game','ng-word-battle','taboo-word-game','insider-game',
  'one-night-werewolf','tahoiya','word-wolf','word-detective',
  'drawing-wolf','accomplice-drawing','picture-telephone',
  'ai-nickname-game','dictionary-quiz','wikipedia-quiz'
)
foreach ($game in $games) {
  node "$game/test.js"
  if ($LASTEXITCODE -ne 0) { throw "$game failed" }
}
```

全14本が終了コード0かつ `All tests passed` であることを合格条件にする。
通信改修で `logic.js` を触らなくても必ず回し、状態スナップショット用の
ロジック追加が既存挙動を壊していないことを確認する。

### 2. `common/test.js`

最低限、仕様指定の `PeerErrors.describe` について次を網羅する。

- `peer-unavailable`
- `network`
- `socket-error`
- `unavailable-id`
- `timeout`
- 未知のtype
- `null`

加えて可能なら、DOM/WebRTCに依存しない次のテストを同ファイルに追加すると
回帰検出力が上がる。

- `AckSend.attempt`
  - 呼出直後に `onPending` と `send` が各1回
  - `confirm()` で `onConfirmed` が1回、タイムアウト後も `onFailed` なし
  - 未確認のままタイムアウトすると `onFailed` が1回
  - 二重 `confirm()`、タイムアウト後の `confirm()` が二重完了しない
  - `cancel()` 後にいずれの完了コールバックも呼ばれない
- `RejoinStorage`
  - sessionStorageを小さなfakeで差し替え、save/load/clear
  - 不正JSON、項目不足、Storage例外時に安全に空扱い
  - `newToken()` が空でなく、連続生成で異なる
- `WakeLockHelper`
  - API非対応でも例外にならない
  - enable/disableの冪等性
  - visibility復帰時のみ再取得

後者をNodeから試験できない実装形にした場合は、無理に公開APIを広げず
ブラウザスモークへ回す。

### 3. JavaScript構文検査

新規・変更JavaScript全件に `node --check` を実行する。特に圧縮された
`script.js` は編集時の括弧抜けを目視で見つけにくい。

```powershell
node --check common/net-core.js
node --check common/peer-errors.js
node --check common/wake-lock.js
node --check common/rejoin-storage.js
node --check common/ack-send.js
foreach ($game in $games) {
  node --check "$game/net.js"
  node --check "$game/script.js"
}
```

### 4. `net.js` ラッパーの静的検査

14本すべてについて機械的に次を確認する。

- `NetCore.create({ roomPrefix: ... })` が1回だけ
- 公開グローバル名が既存名から変わっていない
- `hostRoom` と `joinRoom` の両方を公開
- 旧コピー実装の痕跡（`new Peer`, `peer.on`, `conns = new Map`）がない
- room prefix が既存値のまま

期待マッピング:

| game | roomPrefix | global |
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

### 5. HTMLの読み込み順・参照整合性

HTMLパーサ、または簡単なNodeスクリプトで全14ページを検査する。

- 最終的な依存順が
  `peerjs.min.js` →
  `../common/net-core.js` →
  `peer-errors.js` →
  `wake-lock.js` →
  `rejoin-storage.js` →
  `ack-send.js` →
  `logic.js` →
  `net.js` →
  `script.js`
- 各相対パスが実在する
- `word-wolf/peerjs.min.js` が実在し、
  他13本と同じ内容（SHA-256一致）
- 同じ共通スクリプトの二重読み込みがない
- 接続不安定バナーのIDがページ内で一意
- `script.js` が `$()` 等で参照する新規IDがHTMLに存在

`logic.js` と `peerjs.min.js` の現状順はページ間でばらつくが、
今回の共通モジュールはグローバル `Peer` を読み込み時または実行時に使うため、
仕様どおり全ページで統一する。

### 6. 共通化漏れのgrep

次を0件条件またはレビュー対象にする。

```powershell
rg "function (describePeerError|peerError)" `
  ito-game ng-word-battle taboo-word-game insider-game `
  one-night-werewolf tahoiya word-wolf word-detective `
  drawing-wolf accomplice-drawing picture-telephone `
  ai-nickname-game dictionary-quiz wikipedia-quiz

rg "new Peer|peer\.on\('disconnected'" `
  ito-game/net.js ng-word-battle/net.js taboo-word-game/net.js `
  insider-game/net.js one-night-werewolf/net.js tahoiya/net.js `
  word-wolf/net.js word-detective/net.js drawing-wolf/net.js `
  accomplice-drawing/net.js picture-telephone/net.js `
  ai-nickname-game/net.js dictionary-quiz/net.js wikipedia-quiz/net.js
```

1本目はローカルエラー変換関数が消えていること、2本目はPeerJS本体処理が
ラッパーに残っていないことを検出する。`common/net-core.js` 自体は除外する。

## ブラウザスモークテスト

### 実行環境

- `python -m http.server 8000` 等でリポジトリルートをHTTP配信する。
  `file://` は相対パスやブラウザAPIの挙動が本番と異なるので使わない。
- Chromiumの独立コンテキスト（または通常/シークレット）を人数分使う。
  同一コンテキストの複数タブはsessionStorageが複製・共有されるケースがあり、
  「別参加者」としての再参加検証を汚す可能性がある。
- PeerJS公開シグナリングサーバーへの外部通信が必要。自動ブラウザ環境で
  ネットワーク制限がある場合、UIロード試験と実通信試験を分離する。
- console error、page error、失敗したscript requestを記録する。

### 全14ゲームの最低スモーク

各ゲームについて最低人数のコンテキストを開き、次を確認する。

1. ホスト名を入力してルーム作成。6桁コード表示、Wake Lock有効化を確認。
2. ゲストがコードで参加。全タブの名簿が一致し、自分表示も正しい。
3. 規定人数で開始ボタンが有効になり、ゲーム開始。
4. ゲーム固有の主要アクションを1回行い、ホスト側状態と他ゲスト表示が更新。
5. 接続不安定バナーが通常時は非表示。
6. quit操作でWake Lock解放、sessionStorage消去、セットアップ画面復帰。
7. console/page errorなし。

主要アクション:

| game | 最低人数 | 主要アクション |
|---|---:|---|
| ito-game | 2 | 数字公開・結果 |
| ng-word-battle | 2 | claim |
| taboo-word-game | 2 | correct |
| insider-game | 3 | vote |
| one-night-werewolf | 3 | seer-pick と vote |
| tahoiya | 2 | submit-fake と vote |
| word-wolf | 3 | vote（必須代表） |
| word-detective | 2 | guess |
| drawing-wolf | 3 | 描画1ストローク、turn-done、vote |
| accomplice-drawing | 4 | 描画1ストローク、turn-done、vote |
| picture-telephone | 2 | submit（必須代表） |
| ai-nickname-game | 2 | fake と vote |
| dictionary-quiz | 2 | answer |
| wikipedia-quiz | 2 | answer |

### ACK試験

全ゲームで通常の主要アクション後に以下を確認する。

- 押下直後: 送信中表示になり、多重送信できない
- ホスト受理後: 対応する `*-ack` により確定表示
- 同じメッセージが重複到着しても投票数・回答数・スコアが二重加算されない
- ACKを意図的に落とす（DevToolsで該当 `sendTo` を一時的に無効化、
  またはローカルデバッグ用に応答を抑止）と約10秒後に失敗表示
- 失敗後に再送でき、再送のACKで正常に確定

代表必須は `word-wolf` と既存ACK実装を移植する
`picture-telephone`。残り12本も主要アクションごとに1回確認する。
ACK喪失試験は単なるoffline切替ではDataConnection自体が閉じて別分岐に入る
可能性があるため、「送信はホストへ届くがACKだけ返らない」状態を作る。

### heartbeat・再接続試験

1. ホスト/ゲストのどちらかでPeerのシグナリングsocketを切断し、
   `peer.reconnect()` が呼ばれ同じPeer IDで再登録する。
2. DataConnection上のpongを抑止し、12秒超で不安定バナーが出る。
3. pongを再開し、バナーが自動で消える。
4. quit/destroy後はタイマー送信や状態コールバックが続かない。

ブラウザをofflineにするとDataConnection自体も失われるため、
シグナリング再接続とheartbeat timeoutは別試験として扱う。

### 30秒以内のrejoin

各ゲームで進行中のゲストタブをreloadする。

- セットアップ画面を一瞬表示せず保存済みroomへ自動接続
- 同じ名前・tokenで復帰し、roster人数が増えない
- oldPeerIdをキーにした進行状態がnewPeerIdへ移動
- 本人だけの秘密情報を他参加者へbroadcastしない
- 現在フェーズから再開し、既投票・既提出なら二重操作できない
- 他プレイヤー画面に致命的な切断・abort表示が出ない

特に次を重点確認する。

- `one-night-werewolf`: 役職、占い先選択済み状態
- `insider-game`: 役職とお題
- `drawing-wolf` / `accomplice-drawing`: 描画履歴、手番、秘密の共犯情報
- `picture-telephone`: assignment、提出済み状態
- `ai-nickname-game` / `dictionary-quiz` / `wikipedia-quiz`:
  token基準のスコア維持
- `wikipedia-quiz`: 同じroundId/excerpt/choicesを復元し、再fetchしない
- `word-detective`: currentRoundIdを維持し、古いメッセージを受理しない

### 30秒超の最終切断

ゲーム別分類に沿って元の最終挙動が30秒後に一度だけ発火することを確認する。

- 即時除去型: `ito-game`, `ng-word-battle`, `tahoiya`,
  `word-wolf`, `ai-nickname-game`
- 警告して続行型: `insider-game`, `one-night-werewolf`,
  `taboo-word-game`, `drawing-wolf`
- 全員abort型: `word-detective`, `accomplice-drawing`,
  `picture-telephone`

切断中はタイマー満了まで既存の除去・警告・abortが発火しないこと、
満了後の遅いrejoinが古い状態を乗っ取らず通常joinとして処理されることも確認する。

## 自動ブラウザ化の現実的な切り分け

PeerJS公開サーバーを使うE2Eは外部状態に依存し、CIの必須ゲートにすると
flakyになりやすい。次の二層が妥当。

1. 毎回必須: 全ページロード、script 404なし、console errorなし、
   DOM要素存在、共通ヘルパーglobal存在、ボタン初期状態をPlaywrightで確認。
2. リリース前/手動: 実PeerJSで複数コンテキスト接続し、
   ACK喪失、heartbeat、reload rejoin、30秒timeoutを確認。

将来的に安定した自動E2Eが必要なら、Peer/DataConnectionとfake clockを注入可能に
した `net-core.js` テストハーネスを別途作る。今回の実装でそのためだけに
公開APIや本番コードを複雑化するのはスコープ外。

## 最終合格条件

- 14既存テスト + `common/test.js` がすべて成功
- 変更JS全件が `node --check` 成功
- 14 `net.js` が薄いラッパーで、prefix/globalの互換性維持
- 全HTMLの依存順、参照先、DOM ID、PeerJSコピーが静的検査成功
- 全14ゲームで最低スモーク成功
- `word-wolf` と `picture-telephone` でACK喪失・再送、30秒内rejoin、
  30秒超最終切断を必須確認
- 残り12本で通常ACK、rejoin snapshot、分類どおりの最終切断を各1回確認
- sessionStorageがquit/正常終了/rejoin失敗時に残存しない
- 通常操作中にconsole error、未処理Promise rejection、script 404がない
