# オンライン対戦（みんなで遊ぶ）通信信頼性改善 実装計画

## 1. 結論

対象は次の14ゲームだけとする。

`ito-game`, `ng-word-battle`, `taboo-word-game`, `insider-game`,
`one-night-werewolf`, `tahoiya`, `word-wolf`, `word-detective`,
`drawing-wolf`, `accomplice-drawing`, `picture-telephone`,
`ai-nickname-game`, `dictionary-quiz`, `wikipedia-quiz`

実装は一括置換せず、次の順で進める。

1. 共通基盤と単体テスト
2. `net.js` の薄いラッパー化とHTML依存順の統一
3. エラー表示・Wake Lock・heartbeat
4. `actionId` を含むACKプロトコル
5. `join-ack` と安全なrejoin共通契約
6. 代表2ゲーム（`word-wolf`, `picture-telephone`）のrejoin
7. 状態構造の単純なゲームから複雑なゲームへ段階展開
8. 静的検査、既存テスト、ブラウザ実通信確認

ACK再送とrejoinは、元指示の例をそのまま実装せず、本書で確定した追加条件を必須とする。

- 主要アクションは全て同一attempt中に固定した `actionId` を送る。
- ホストは「検証・状態反映・処理済み記録」の後にACKを返す。
- 同じアクションの再受信時は状態を再変更せず、同じACKだけ返す。
- tokenはホスト内部だけに保持し、公開rosterやbroadcast payloadには絶対に含めない。
- sessionStorageへの保存はDataConnectionのopen時ではなく、ホストの `join-ack` /
  `rejoin-ack` を受信した後だけ行う。
- rejoinはロビー参加の再実行ではなく、ホスト側の状態ID付替えと秘密情報を絞った
  snapshot送信を一つの処理として行う。

## 2. 元指示と実コード・調査結果の差

### ACK関連

- 元指示のworked exampleは `actionId` を持たない。このまま自動再送すると、配列append、
  スコア加算、フェーズ進行が二重に実行される。全ACK対象へ `actionId` を追加する。
- `ng-word-battle` の実メッセージ名は指示の `claim` ではなく `catch`。
  `catch` / `catch-ack` を維持する。
- `taboo-word-game` の主要操作は一般的な `answer` / `submit` ではなく `correct`。
  問題indexも送って古い再送による二問進行を防ぐ。
- 指示表の1操作だけでは「全員待ち」が残るゲームがある。最低限、
  `tahoiya` の `submit-fake`、`drawing-wolf` と `accomplice-drawing` の
  `turn-done`、`ai-nickname-game` のvote、役職ゲームの勝敗を変える操作も
  ACKまたは結果応答をACK相当として扱う。
- `picture-telephone` は既存の `submit-ack(round)` と手動再送を持つ。
  重複排除の `roundSubmittedIds` は残し、`AckSend`、`actionId`、round照合へ移植する。

### rejoin関連

- 元指示はroster entryを `{id,name,token}` とするが、そのままroster broadcastすると
  他参加者の再参加資格が漏れる。内部rosterと公開rosterを明確に分離する。
- 元指示はjoin送信後の「成功」でstorage保存としているが、DataConnectionのopenは
  部屋への登録成功を意味しない。専用の `join-ack` を追加する。
- 公開rosterからtokenを除くため、「最初のrosterに自tokenがあること」を保存条件には
  できない。保存条件は `join-ack` / `rejoin-ack` のみとする。
- 元指示は期限切れrejoinを通常joinとして扱うが、ゲーム中の途中参加禁止と衝突する。
  ロビー中なら新規joinへフォールバック可能、ゲーム中または最終切断処理後なら
  `rejoin-rejected` としてstorageをclearし、セットアップへ戻す。
- 元指示の `Map<token, oldPeerId>` だけではタイマーを解除できない。
  `Map<token,{oldPeerId,timer,disconnectedAt}>` とする。
- 多くのゲームはphaseをDOM表示状態で表している。snapshot復元のため、ホスト側に
  明示的なphaseと必要な結果状態を追加する。
- ホスト自身のreload復帰、別端末・別タブからの復帰、ロビーUI共通化は対象外。
  sessionStorageによる同一タブのゲストreloadだけを保証する。

### net.js共通化関連

- 14本はprefixと公開global以外ほぼ同じだが、`word-detective` のsend例外捕捉を
  共通版の標準とする。
- `peer.reconnect()` はsignaling再登録だけで、切れたDataConnectionを復旧しない。
  heartbeat、signaling reconnect、reload rejoinを別機能として扱う。
- `hostRoom` の `unavailable-id` 再試行で古いcontrollerを返さないよう、
  controller内部のpeer参照を差し替える。既存の返却APIは維持する。
- `word-wolf` は他ディレクトリのPeerJSを参照しているため、同一内容をローカルコピーし、
  自ディレクトリ参照へ変更する。

## 3. 確定する共通プロトコル

### 3.1 公開roster

ホスト内部では次を保持する。

```js
{ id, name, token }
```

broadcast、ゲーム開始payload、snapshot内の一覧には必ず変換関数を通し、次だけを出す。

```js
{ id, name }
```

`token`、tokenをキーにしたMap、個別役職・個別お題を含むホスト状態全体を
`broadcast()`してはならない。各ゲームに `publicRoster()` 相当を一つ置き、
roster送信箇所を全てそこへ集約する。

### 3.2 joinと保存条件

新規ゲスト:

1. tokenと `joinRequestId` を生成する。
2. `{type:'join', name, token, joinRequestId}` を送る。
3. ホストは名前・token・接続元peerIdを検証し、内部rosterへ追加する。
4. ホストはそのpeerだけへ
   `{type:'join-ack', joinRequestId, roomCode}` を送る。
5. ゲストはrequest IDが一致するACKを受けて初めて
   `{roomCode,token,name}` をsessionStorageへ保存する。

ACK未達時はjoinを同じrequest IDで再送できる。ホストは
`(peerId, joinRequestId)` またはtokenで重複追加を防ぎ、ACKだけ再送する。

rejoinゲスト:

1. 保存値があればセットアップ画面を出す前に自動接続する。
2. `{type:'rejoin', token, name, rejoinRequestId}` を送る。
3. ホストはpending entryと内部rosterのtokenが一致する場合だけ受理する。
4. 全ゲーム固有状態のIDを旧peerIdから新peerIdへ付け替える。
5. pending timerを解除してentryを削除する。
6. 公開rosterをbroadcastする。
7. 本人へ `rejoin-ack` と秘密範囲を絞った `state-snapshot` を送る。
8. ゲストは両者の整合を確認して画面を復元し、保存値を更新する。

`join-ack` / `rejoin-ack` の送信失敗時にもホスト状態は重複させない。
同じrequest IDの再送にはACKとsnapshotを再送する。

### 3.3 ACKと冪等性

各操作payloadには最低限、次を含める。

```js
{
  type: 'vote',
  actionId: '...',
  scopeId: gameId || roundId || String(round),
  // 操作固有データ
}
```

- `actionId` は1回のUI操作で一度だけ生成し、`AckSend`の全再送で同じ値を使う。
- ユーザーが失敗後に明示的に再試行する場合も、同じ論理操作なら同じactionIdを保持する。
  入力を変更して新規操作する場合だけ新しいactionIdを作る。
- ACKは `{type:'<action>-ack',actionId,scopeId}` とし、クライアントは両方一致する
  pending attemptだけをconfirmする。古いroundのACKを現在操作へ適用しない。
- ホストの重複判定キーは原則
  `playerToken + actionType + scopeId + actionId`。
  tokenを持たない過渡状態だけpeerIdを使う。rejoinでpeerIdが変わっても同一参加者として
  扱えるため、ゲーム開始後はtoken基準を優先する。
- 処理済み記録はACK送信前に残す。重複受信時は妥当性を再評価して副作用を起こさず、
  同じACKを再送する。
- 処理済み集合はgame/round終了時に破棄し、無制限に増やさない。
- 送信元ID、役職、対象候補、phase、scopeIdを検証し、クライアントが送った
  `voterId` / `catcherId` 等は信用しない。
- 不正操作にはACKを返さないだけで放置せず、可能なら
  `<action>-rejected` を返してpending UIを解除する。

### 3.4 切断猶予

- ロビー中は従来どおり即時除去する。
- ゲーム中だけ30秒猶予を開始する。
- 猶予中はroster、投票、提出、役職、割当、スコアを削除せず、既存のabortや警告を
  発火しない。
- 同じtokenのrejoin成功時にタイマーを必ずcancelする。
- 満了処理は一度だけ実行し、そのゲームの従来方針（除去、警告継続、全員abort）へ進む。
- 満了後の古いtokenによるゲーム中rejoinは拒否する。

## 4. 実装フェーズ

### Phase A: 共通基盤

1. `common/net-core.js`
   - 既存API互換
   - signaling `peer.reconnect()`
   - 5秒ping、12秒timeout、状態変化時だけhealth callback
   - 内部ping/pongをゲームhandlerへ流さない
   - send例外捕捉とtimer cleanup
2. `common/peer-errors.js`
3. `common/wake-lock.js`
4. `common/rejoin-storage.js`
5. `common/ack-send.js`
   - 即時送信、一定間隔再送、10秒timeout
   - `confirm()` / `cancel()` 冪等
6. `common/test.js`

この段階でcommon単体テストと `node --check` を通す。

### Phase B: transport共通化

1. 14本の `net.js` をprefix/globalだけのラッパーにする。
2. 14本のHTMLを所定のscript順へ統一する。
3. `word-wolf/peerjs.min.js` を既存コピーと同一内容で配置する。
4. 既存14テスト、全ページロード、2タブ基本接続を確認する。

この時点ではゲームプロトコルを変えない。共通化による回帰を先に分離する。

### Phase C: 横断UI

1. ローカルのPeerJSエラー文言関数を `PeerErrors.describe` へ置換する。
2. ホストの部屋作成成功時にWake Lockをenableし、quit/終了全導線でdisableする。
3. 全ページに一意な接続不安定バナーを追加する。
4. optional health callbackから表示し、healthy復帰時に消す。

### Phase D: ACK

実装単位は必ず「クライアント送信 + ホスト検証/重複排除 + ACK +
pending/confirmed/failed UI + phase終了時cancel」の一組とする。

先に `picture-telephone` で既存方式を移植し、次に `word-wolf` で投票上書きと
actionId対応を固める。その後、単純な単発操作から複合操作へ展開する。

1. `picture-telephone`: submit
2. `word-wolf`: vote、必要ならguess結果をACK相当化
3. `dictionary-quiz`, `wikipedia-quiz`: answer（round ID追加）
4. `ng-word-battle`: catch（早い者勝ちの同一結果再ACK）
5. `word-detective`: guess（currentRoundId維持）
6. `taboo-word-game`: correct（currentIndex必須）
7. `ai-nickname-game`: fake、vote
8. `tahoiya`: submit-fake、vote
9. `insider-game`, `one-night-werewolf`: vote、秘密操作の結果応答
10. `drawing-wolf`, `accomplice-drawing`: turn-done、vote

`ito-game` はゲストからホストへの主要ゲーム操作がないため、join/rejoin確認だけでよい。

### Phase E: rejoin代表実装

まず `word-wolf` と `picture-telephone` に実装する。

- `word-wolf` で、秘密単語、投票、手番、wolf IDの公開タイミング、peerId付替えを検証する。
- `picture-telephone` で、Map/Set/authorId、assignment、提出済み、abort猶予を検証する。
- 共通のjoin/rejoinメッセージ形、storage保存条件、公開roster変換、timer管理、
  snapshotVersionをこの2本で確定してから残りへ展開する。

snapshotは必ず `{snapshotVersion:1, phase, scopeId,...}` を持ち、想定外version/phaseは
適用せずrejoin失敗として安全に戻す。

### Phase F: 残り12ゲームのrejoin展開順

実装難度と秘密情報漏洩リスクに基づき、次の順とする。

#### F1: 比較的単純

1. `dictionary-quiz`
2. `wikipedia-quiz`
3. `ai-nickname-game`
4. `ng-word-battle`
5. `tahoiya`

この群ではphase、round、answer/submission、token基準scoreのパターンを固める。
`wikipedia-quiz` はrejoin時に再fetchせず同じround ID、excerpt、choicesを送る。

#### F2: 明示phase導入が必要

6. `ito-game`
7. `taboo-word-game`

DOM表示からphaseを推測せず、ホスト状態としてphaseを追加する。
タイマーは開始時刻/終了時刻から残りを復元する。

#### F3: 秘密役職

8. `insider-game`
9. `one-night-werewolf`

role/topic/seer結果は本人へ `sendTo` だけで送る。role Map、votesのキーと値、
占い済み状態を旧IDから新IDへ移す。ホストに占い結果を保持し、
再参加後の二重占いを防ぐ。

#### F4: 大きい状態・描画

10. `drawing-wolf`
11. `accomplice-drawing`

描画履歴、手番、投票、秘密topic/共犯関係を移す。snapshotの描画データにも
通常受信と同じサイズ・形式検証を適用する。ホストが受信していない未提出ローカル線は
復元不能なので、再描画になることを仕様とする。

#### F5: 独自round同期

12. `word-detective`

既存の `pendingOrder` / `pendingPrivate` / `tryEnter` を活用し、
同じ `currentRoundId` の公開orderと本人専用情報を再送する。新round IDは発行しない。
30秒満了時だけ既存abortを行う。

## 5. ゲーム別ID付替えチェックリスト

| game | 旧IDから新IDへ移す主要状態 |
|---|---|
| ito-game | roster, orderBuilding, currentNumberMap |
| ng-word-battle | roster, currentPlayers, currentClaim |
| taboo-word-game | roster, describerId |
| insider-game | roster, currentRoleMap key, votes key/value |
| one-night-werewolf | roster, currentRoleMap key, votes key/value, seer状態 |
| tahoiya | roster, fakeSubmissions.authorId, currentEntries.authorId, votes key |
| word-wolf | roster, wolfId, words key, speakingOrder, votes key/value |
| word-detective | roster, roundRoster, wordMap, targetOf key/value, pending payload |
| drawing-wolf | roster, wolfId, turnOrder, votes key/value, segments.playerId |
| accomplice-drawing | roster群, accomplicePair, topics, drawings, submissions, votes |
| picture-telephone | roster群, playerOrder, assignments, roundSubmittedIds, authorId |
| ai-nickname-game | roster, fakes/entries.authorId, votes, scores |
| dictionary-quiz | roster, answers, scores |
| wikipedia-quiz | roster, answers, scores |

スコアを持つ3ゲームはtokenを恒久キーにし、表示時だけ現在のrosterから名前へ解決する。

## 6. 検証ゲート

各Phase終了時に変更範囲の `node --check` と関連テストを実行し、次Phaseへ進む。

最終合格条件:

- 14本の既存 `test.js` と `common/test.js` が全て `All tests passed`
- 変更JavaScript全件が `node --check` 成功
- 14本の `net.js` に旧PeerJS実装が残らず、prefix/globalが既存値のまま
- 全HTMLのscript順、参照先、DOM IDが整合
- 公開payloadを静的・実通信で確認し、tokenや他人の秘密情報が含まれない
- 重複action受信で投票数、回答数、提出数、スコア、phaseが二重更新されない
- ACK喪失後に再送でき、古いACKは別round/別attemptをconfirmしない
- 30秒以内のreloadで人数が増えず、旧ID状態が新IDへ移る
- 30秒満了後にゲーム別の最終切断処理が一度だけ発火する
- quit、正常終了、rejoin拒否でsessionStorageがclearされる
- console error、未処理Promise rejection、script 404がない

実通信の代表必須ケースは `word-wolf` と `picture-telephone`。残り12本も最低人数で
通常ACK、reload rejoin、最終切断を各1回確認する。PeerJS公開サーバー依存の試験は
CI必須ゲートにせず、ページロード等の決定的な検査と分離する。

## 7. 実装時の禁止事項

- tokenを公開rosterやbroadcastへ含めない。
- snapshotにホスト状態オブジェクトを丸ごと入れない。
- `actionId` なしで自動再送しない。
- ACKを状態反映前に返さない。
- rejoin時に新しいround IDやゲームIDを発行しない。
- 接続openだけでsessionStorageへ保存しない。
- ロビー中の通常切断まで30秒待たせない。
- `peer.reconnect()` をDataConnection復旧とみなさない。
- 14ゲームを同時に編集してから初めて試験する進め方をしない。
