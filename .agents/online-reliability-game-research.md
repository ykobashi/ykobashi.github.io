# オンライン通信信頼性改善: 14ゲームの `script.js` 調査

## 調査範囲と共通方針

対象は `ito-game`, `ng-word-battle`, `taboo-word-game`, `insider-game`,
`one-night-werewolf`, `tahoiya`, `word-wolf`, `word-detective`,
`drawing-wolf`, `accomplice-drawing`, `picture-telephone`,
`ai-nickname-game`, `dictionary-quiz`, `wikipedia-quiz` のコミット済み版
`script.js`。

共通実装では次の点を崩さないこと。

- 再参加トークンは名簿の `{id, name, token}` に保持する。ゲーム開始後の名簿は
  途中参加を防ぐため固定し、再参加時だけ同一トークンの `id` を置換する。
- `pendingRejoins` は `token -> {oldPeerId, timer}` とする方が仕様記載の
  `token -> oldPeerId` より実装しやすい。タイマー完了後に必ずエントリを削除する。
- ACK は「ホストが妥当なメッセージを受理し、状態へ反映した後」に返す。不正値、
  期限切れラウンド、重複提出には ACK を返さない。再送可能にするため、ゲストの
  `onFailed` は送信済みフラグと入力ボタンを元に戻す。
- ACK タイムアウト後の再送は重複し得る。ホスト側の受理処理は
  `peerId + gameId/roundId/round + action type` で冪等にする。上書き投票を許すゲームは
  同じ投票を再受信しても副作用が増えないようにする。
- スナップショットには `snapshotVersion` と現在フェーズ識別子を入れ、
  ゲスト側で想定外フェーズを拒否できる形が安全。
- `RejoinStorage.save` は DataConnection の open 直後ではなく、ホストから
  `join-ack` または最初の `roster` を受けた後に行う方が、存在しない部屋の古い
  セッションを残しにくい。指示書には join ACK がないため、実装時に `join-ack` を
  追加するか、roster 内に自分の token があることを成功条件にする必要がある。
- 再参加時の `newPeerId` 置換は roster だけでなく、ゲーム開始時に複製した
  roster、投票・回答・役職・割当・描画 Map/Set、メッセージ内の author/player ID
  すべてが対象。
- ロビー中の切断は現状どおり即除去。30秒猶予はゲーム進行中だけ。
- ゲスト側 `onDisconnected` は現在ほぼ全ゲームで致命表示にするため、リロード復帰とは
  別に一時切断時の画面を破棄しないよう注意する。ハートビート不調バナーと
  DataConnection close は区別する。

## ゲーム別調査

### 1. ito-game

- 現在状態: `roster`, `orderBuilding`, ホスト専用 `currentNumberMap`,
  共通 `currentTheme`。明示的な `phase` 変数がなく、DOMの表示状態でロビー、
  数字確認、並べ替え、結果を表す。
- 主要ACK: 指示書のACK対応表には ito がない。ゲストからホストへのゲーム中の
  主要送信もなく、数字の並べ替えはホスト操作だけなので、今回は ACK 対象なしでよい。
  `join` の成功確認だけは共通 rejoin 保存条件として別途必要。
- 現在の切断: 常に roster から即除去し broadcast。ゲーム中も人数と
  `currentNumberMap` の対応が崩れ得る。
- 猶予切れ後: 現在どおり roster から除去。`orderBuilding` から切断 ID も除去し、
  `currentNumberMap` のキーも削除しないと並べ替え完了条件が詰まるため、現状挙動の
  単純移植だけでは不十分。
- ID付替え: `roster[].id`, `orderBuilding[]`, `currentNumberMap[oldId]`。
- snapshot: `phase` をDOMから逆算せず、実装時に明示状態
  (`lobby|number|ordering|result`) を導入する。ゲーム中なら
  `{phase, roster, theme: currentTheme, myNumber: currentNumberMap[newId],
  orderBuilding}`。本人の数字は `sendTo` のみ。結果画面に復帰可能にするなら確定順序と
  判定結果もホスト状態として保持する必要がある。
- リスク: 現コードはホスト以外に並べ替え中の順序を同期しない。再参加者を同じ画面へ
  戻せてもリアルタイムの並びが見えない設計なので、snapshot適用関数の新設が必要。

### 2. ng-word-battle

- 現在状態: `roster`, `currentPlayers[{id,name,word}]`,
  `currentClaim {catcherId,targetId}`。明示 phase なし。
- 主要ACK: 指示書では `claim` とあるが、実コードのメッセージ型は **`catch`**。
  `catch-ack` を返す。早い者勝ちなので、受理済み `currentClaim` がある場合は
  後続へ ACK を返さず、`claim-rejected` のような明示応答を返す方がUIが詰まらない。
  `catcherId` はクライアント値を信用せず送信元 `peerId` を使用する。
- 現在の切断: 常に即除去。
- 猶予切れ後: roster から除去。進行中に対象を除去すると `currentPlayers` との
  不整合が出るため、既存挙動維持なら表示用 `currentPlayers` も除去するか、ラウンドを
  そのまま終了させるかを明示する必要がある。
- ID付替え: `roster[].id`, `currentPlayers[].id`, `currentClaim.catcherId/targetId`。
- snapshot: `{phase:'playing'|'result', roster, players: currentPlayers,
  currentClaim/result}`。各プレイヤーは他人のNGワードだけを見るゲームなので、
  現行 `words` payload と同じ情報公開範囲か確認して再利用する。
- リスク: ACKの再送と早い者勝ち判定が競合する。ホスト到着順を唯一の確定順序とし、
  ACK未達で同じ人が再送しても既に確定した本人には同一結果を返す冪等処理が必要。

### 3. taboo-word-game

- 現在状態: `roster`, `leaderboard`, `describerId/name`, `roundWords`,
  `currentIndex`, `usedWords`, `attemptStartTime`, `timerId`, `pendingResult`。
  phase変数はなくDOMで画面を管理。
- 主要ACK: 実メッセージは `correct`。ホストが `peerId === describerId` を確認し
  `hostAdvanceWord()` を実行した後に `correct-ack`（問題index付き）を返す。
  再送による二問進行を防ぐため、送信時indexを含め、ホストで
  `data.index === currentIndex` を必須にする。
- 現在の切断: rosterから即除去。切断者が出題者なら警告表示して続行困難を知らせる。
- 猶予切れ後: 同じ警告継続。非出題者は従来どおり roster から除去。
- ID付替え: `roster[].id`, `describerId`。leaderboardは名前だけなので置換不要。
- snapshot:
  - 出題者本人: `{phase:'attempt', describerId, describerName, index,
    word: roundWords[index].word, banned, elapsedMs}` を本人だけへ送る。
  - 他参加者: `{phase:'attempt', describerId, describerName, index, elapsedMs}`。
  - 選択待ち/結果では `leaderboard`, `pendingResult` も含める。
- リスク: タイマーは再参加者側でゼロから開始せず、ホストの
  `Date.now() - attemptStartTime` から復元する。秘密のお題を非出題者へ送らない。

### 4. insider-game

- 現在状態: `roster`, ゲスト `myRole/myTopic/myVoteCast`、ホスト
  `currentRoleMap`, `currentTopic`, `votes`。phaseはrole/topic/discussion/voting/resultを
  DOMで表す。
- 主要ACK: 指示対象は `vote`。`voterId` は送信元IDを採用し、妥当な候補へ反映後
  `vote-ack`。なお `correct-guess` もゲーム進行を切り替える重要操作なので、
  指示表外だが `correct-guess-ack` またはホストからの次phase受信を確定扱いにしないと
  同じ信頼性穴が残る。
- 現在の切断: rosterから即除去し、ゲーム画面では警告して継続。
- 猶予切れ後: 同じ警告継続。ゲーム開始時のメンバーを維持するなら roster を即削除する
  現挙動と矛盾するため、猶予切れ時だけ削除し votes/currentRoleMap も合わせて整理する。
- ID付替え: `roster[].id`, `currentRoleMap` のキー, `votes` の voter key と votedFor value。
- snapshot: 本人専用に
  `{phase, roster, role: currentRoleMap[newId], topic:
  roleがinsider/masterならcurrentTopic、votes, hasVoted}`。
  topic公開後は全員に topic を含めてよい。role/topic は必ず `sendTo`。
- リスク: `currentRoleMap` と `votes` の両方でキー・値を置換する。役職漏洩、
  再参加前の投票二重計上、投票済みUIの再有効化に注意。

### 5. one-night-werewolf

- 現在状態: `roster`, `currentRoleMap`, `votes`, `gameInProgress`,
  ゲスト `hasPickedSeerLocally/hasVotedLocally`, discussion timer。
- 主要ACK: `vote` 受理後 `vote-ack`。`seer-pick` も秘密情報を変える重要操作なので
  `seer-result` 自体をACK相当とし、タイムアウト時に再試行可能にする。
- 現在の切断: ロビー中は即除去。ゲーム中は roster を保持し警告のみ。
- 猶予切れ後: 現状どおり警告して続行（削除しない）。
- ID付替え: `roster[].id`, `currentRoleMap` のキー, `votes` のキーと値。
- snapshot: 本人だけへ
  `{phase, roster, role: currentRoleMap[newId], hasPickedSeer,
  seerResult?, hasVoted, discussionEndsAt}`。投票フェーズでは候補、結果フェーズでは
  公開済み結果も含める。
- 必須追加状態: ホスト側に `seerPickByPlayer` または少なくとも
  `hasPickedSeer` をID/token単位で保持し、対象と結果も保存する。ローカル変数だけでは
  再参加した占い師が再占いできる。
- リスク: role map と占い結果は `broadcast` 厳禁。discussion timerは残り秒を
  snapshot送信時に計算する。占い師がいないケース、占い師以外の forged `seer-pick`
  を拒否する。

### 6. tahoiya

- 現在状態: `roster`, `currentWordEntry`, `fakeSubmissions`,
  `currentEntries`, `votes`, ゲスト `hasSubmittedFake/hasVoted`。
- 主要ACK: 指示表は `vote` だが、回答提出 `submit-fake` も同等に重要。
  `submit-fake-ack` と `vote-ack` の両方を付けるべき。各ACKにフェーズ/entry idを含める。
- 現在の切断: 常に roster から即除去。
- 猶予切れ後: 同じ即除去。ただし提出済み人数と投票完了条件を再計算し、
  `fakeSubmissions`, `votes` の切断者エントリをどう扱うかは現行のゲーム継続に合わせる。
- ID付替え: `roster[].id`, `fakeSubmissions[].authorId`,
  `currentEntries[].authorId`, `votes` の voter key。投票先はentry idで置換不要。
- snapshot:
  - submit: `{phase:'submit', word, hasSubmitted, submittedCount,total}`
  - voting: `{phase:'voting', entries:匿名化済みentries, hasVoted,
    votedEntryId?}`
  - result: 既存result payload。
  正解definitionは結果前に送らない。
- リスク: 指示書の「主要アクション1つ」を文字どおり vote だけにすると、偽定義未達で
  全員待ちが詰む問題が残る。ACK再送時に `fakeSubmissions` を二重追加しない。

### 7. word-wolf

- 現在状態: `roster`, `round`（wolfId、単語、各人word）, `speakingOrder`,
  `votes`, `voted`, `myWord`。密な一行コード。
- 主要ACK: `vote` -> `vote-ack`。人狼の最後の `guess` も勝敗決定操作なので、
  `guess-ack` または result 受信をACK扱いにするのが安全。
- 現在の切断: 常に即除去。
- 猶予切れ後: 現状どおり roster から除去。進行中なら votes と speakingOrder の
  整合も取る。
- ID付替え: `roster[].id`, `round.wolfId`, `round.words` のキー,
  `speakingOrder[]`, `votes` の voter key と target value。
- snapshot: 本人だけへ
  `{phase:'discussion'|'voting'|'guess'|'result', roster,
  word: round.words[newId], speakingOrder, hasVoted, ownVote,
  wolfId/wolfNameはguess公開後のみ, tally/result}`。
- リスク: 参加者ごとの単語は秘密。snapshotの `round` 丸ごと送信は禁止。
  投票は現在変更可能なので ACK failure で `voted=false` に戻すだけでなく、既存選択の
  上書きと複数のACKの対応をaction idで識別する必要がある。

### 8. word-detective

- 現在状態: `currentRoundId`, `roundActive/roundEnded`, `roundRoster`,
  `wordMap`, `targetOf`, `pendingOrder`, `pendingPrivate`。`tryEnter(roundId)` で
  公開orderと本人用round-startの両方が揃ってから開始。
- 主要ACK: `guess`。不正解時の `wrong-guess`、正解時の `game-over` が実質応答だが、
  指示に合わせるならホストが検証を開始した時点で `guess-ack` を返し、その後結果を返す。
  `roundId` とクライアント生成 action id を含める。
- 現在の切断: rosterから即除去。`roundActive` 中なら全員へ `round-aborted`。
- 猶予切れ後: 初めて既存 `abortRound()` を呼ぶ。猶予中は roster/roundRosterを保持。
- ID付替え: `roster[].id`, `roundRoster[].id`, `wordMap` key,
  `targetOf` key/value、pending payload内のorder/roster/target。
- snapshot: 既存の `order` と本人用 `round-start` を再構成し、
  **同じ `currentRoundId`** で本人へ送る。追加で
  `{type:'state-snapshot', roundId, order, roster, privateWord/target,
  phase, roundEnded/result}` とし、受信側で既存 `pendingOrder`,
  `pendingPrivate`, `tryEnter` を利用できる。
- リスク: 新しい roundId を発行するとステールガードが全員でずれる。再参加中に
  roundが終了した場合はresult snapshotへ切り替える。秘密単語は本人だけへ送る。

### 9. drawing-wolf

- 現在状態: `roster`, `myRole/myTopic`, ホスト `wolfId/topic`,
  `turnOrder/turnIndex`, `votes/voted`, `phase`, 全描画 `segments`, `strokeSeq`。
- 主要ACK: `vote` -> `vote-ack`。描画中の `turn-done` もフェーズを進めるため
  `turn-done-ack` が望ましい。strokeは高頻度なので個別ACK対象外。
- 現在の切断: ロビーは即除去。ゲーム中は警告だけ表示。
- 猶予切れ後: 現状どおり警告継続。
- ID付替え: `roster[].id`, `wolfId`, `turnOrder[]`, `votes` key/value,
  `segments[].playerId`（存在するもの）。
- snapshot: 本人だけへ
  `{phase, roster, role, topic（roleに応じた公開範囲）, turnOrder,
  turnIndex, segments, hasVoted, ownVote, result?}`。
  canvasは `segments` を検証後に全再描画。
- リスク: segmentsのサイズ上限・形式検証をsnapshotにも適用。狼のお題情報を市民へ
  漏らさない。再参加者が現在drawerなら操作を再度有効化する。

### 10. accomplice-drawing

- 現在状態: `phase/gameId/round/topic`, ローカル描画
  `allSegments/currentRoundSegments/latestDrawings/submitted`,
  投票 `selectedCandidateIds/voted`、ホスト
  `hostState{roster, accomplicePair, topics, drawings, roundSubmissions, votes}`。
- 主要ACK: 指示対象 `vote` -> `vote-ack`。さらに `turn-done` は全員待ちを解消する
  提出なので必ず `turn-done-ack` が必要。
- 現在の切断: ロビー中は即除去、ゲーム中は全員abort。
- 猶予切れ後: 初めて既存 `abortGame` と `aborted` broadcast。
- ID付替え: 外側 `roster`, `hostState.roster`, `accomplicePair`,
  `hostState.topics` key, `drawings` Map key, `roundSubmissions` Map key,
  `votes` Map keyと各投票target配列、`latestDrawings` key。
- snapshot:
  - topic-reveal: 本人のtopicだけ。
  - drawing: `{phase,gameId,round,topic, drawings:本人の累積描画,
    currentRoundSegments:提出前なら必要, alreadySubmitted}`。
    ホストはクライアントの未提出ローカル線を持たないため、リロード前の
    `currentRoundSegments` は復元不能。未提出なら描き直しになる旨を仕様化する。
  - reveal/voting: `latestDrawings` 全体、`hasVoted/ownVote`。
- リスク: `accomplicePair` と個別topicは非共犯者へ漏らさない。snapshotへ
  `hostState` を丸ごと入れてはいけない。描画payloadは大きく、PeerJS message sizeと
  検証コストに注意。

### 11. picture-telephone

- 現在状態: `roster/gameRoster/playerOrder/submissions`,
  `currentRound/totalRoundsCount`, `assignments Map`,
  `roundSubmittedIds Set`, `phase`, 描画ローカル状態、reveal状態。
- 主要ACK: 既存 `submit` / `submit-ack(round)` / 10秒手動再送がある。
  `AckSend.attempt` へ移植し、現行の round照合を維持する。ホストの
  `acceptSubmission` は `roundSubmittedIds` で既に重複排除する。
- 現在の切断: lobbyは即除去、playingは即 `game-aborted` broadcast。
- 猶予切れ後: 初めて既存abort。
- ID付替え: `roster/gameRoster/playerOrder`, `assignments` key,
  `roundSubmittedIds`, `submissions[*][*].authorId`。指示書はauthorIdを表示名解決だけと
  しているが、履歴の一貫性のため置換推奨。
- snapshot: 指示書どおり、現在assignment
  `{round,total,contributionType,prevContent,alreadySubmitted}`。
  reveal中はassignmentではなく `{phase:'reveal', submissions, roster, revealIndex}`。
- リスク: `applyAssignment()` は入力UIを初期化するため、alreadySubmitted時は
  直後に `markSubmitted()`。未提出のローカル描画/文章はホストにないので復元不能。
  古いsubmit ACKを新roundのattemptへconfirmしないよう roundとaction idを照合する。

### 12. ai-nickname-game

- 現在状態: `phase`, `currentCharacter/currentRealNickname/currentRound`,
  `fakes/entries/votes/scores`, `myEntryId`, `submitted/voted`。
- 主要ACK: 指示表は `fake`。`fake-ack` を受理後返す。投票も全員待ち対象なので
  `vote-ack` を追加するのが安全。
- 現在の切断: 常に roster から即除去。
- 猶予切れ後: 現状どおり除去。submit/vote中は完了条件を roster 更新後に再評価する。
- ID付替え: `roster[].id`, `fakes[].authorId`, `entries[].authorId`,
  `votes` key, `scores` key, `myEntryId` はentry IDなので通常置換不要。
- snapshot:
  - submit: character（公開可）、本人が提出済みなら `hasSubmitted` のみ。実際のfakeは
    投票前に他者へ漏らさない。
  - vote: 匿名 entries, 本人 `myEntryId`, `hasVoted/ownVote`。
  - result/final: 既存payloadとscores。
- スコア: 指示どおり tokenを恒久キーにするのが安全。roster entryから
  `token -> id/name` を解決し、Logicへ渡す表示用payloadは必要に応じてIDキーへ変換する。
- リスク: currentRealNickname とentriesの author対応は投票前のsnapshotで秘匿。
  一行コードが多く差分衝突・レビュー難度が高い。

### 13. dictionary-quiz

- 現在状態: `phase`, `scores`, `usedWords`, `currentRound`,
  `currentEntry`, `answers`, `tallied`, ゲスト `answered`。
- 主要ACK: `answer` -> `answer-ack`。answer payloadに `round` が現在含まれないため、
  ACK導入と同時に `roundId/currentRound` を付け、古い回答が次ラウンドへ入らないようにする。
- 現在の切断: 常に roster から即除去し、question中は `maybeAutoTally()`。
- 猶予切れ後: 除去後にauto tally再評価。猶予中は回答待ち人数を変えない。
- ID付替え: `roster[].id`, `answers` key, `scores` key。
- snapshot:
  - question: `{phase,round, question payload（正解を含まない選択肢）,
    hasAnswered, ownAnswer?, answeredIds, scores}`
  - result/final: 既存payload。
  `currentEntry` 丸ごとは正解を含むためquestion中に送らない。
- スコア: tokenキー化推奨。少なくとも再参加時に `scores[oldId]` を
  `scores[newId]` へ移す必要がある。
- リスク: 現在round識別がないのが最大の問題。ACK再送で次問へ回答が混入しないよう
  wikipedia-quiz同様のroundIdガードを導入する。

### 14. wikipedia-quiz

- 現在状態: `phase`, `scores`, `usedTitles`, `currentRound/currentRoundId`,
  `currentCorrectTitle/currentSourceUrl`, `answers`, `tallied`, `myAnswer`。
- 主要ACK: `answer` -> `answer-ack`。既存 `roundId` をそのまま照合し、
  ACKにも含める。
- 現在の切断: 常に roster から即除去。question中は tallyボタン状態を更新。
- 猶予切れ後: 現状どおり除去し完了条件を再評価。
- ID付替え: `roster[].id`, `answers` key, `scores` key。
- snapshot:
  - loading: `{phase:'loading', round}`（fetchの再実行は禁止）。
  - question: **確定済み** `{roundId,round,excerpt,choices,hasAnswered,
    ownAnswer,answeredIds,scores}`。そのためホストは現在broadcast後に
    `excerpt/choices` を保持するフィールドを追加する。
  - result/final: 既存payload。
  正解 `currentCorrectTitle` はquestion中に送らない。
- スコア: tokenキー化推奨。表示payloadへ変換する層が必要。
- リスク: `fetchRoundContent` をrejoinで呼ぶと別問題になる。非同期fetch完了と
  rejoin受理が競合した場合、loading snapshotを送り、確定後に通常round broadcastを
  受けさせる。roundIdで古いACK/回答を排除する。

## 実装上の重要な差分・追加提案

1. 指示書の `ng-word-battle claim` は実コードでは `catch`。名前を変更せず
   `catch-ack` とする。
2. 指示書のACK表は「最も重要な1操作」だけだが、全員待ちを本当に解消するには
   `tahoiya: submit-fake`, `accomplice-drawing: turn-done`,
   `ai-nickname-game: vote`, `drawing-wolf: turn-done` も対象にすべき。
3. `dictionary-quiz` のanswerにはround識別がない。ACK/再送導入前に roundId を追加する。
4. 再参加成功を保存するための `join-ack` が仕様に欠けている。roster確認方式より
   専用 `join-ack` の方が明快。
5. 明示phaseを持たずDOM表示で状態管理するゲームが複数ある。rejoin実装ではホスト側に
   明示phaseを追加しないと正確なsnapshotを作れない。
6. 未提出の文章・描画はホストへ届いていないため復元できない。再参加時は描き直し/
   入力し直しになることをUIで明示する。
7. 30秒猶予中にゲームが次phaseへ進んだ場合、再参加者へ送るsnapshotは「切断時」ではなく
   「rejoin受理時の最新状態」にする。
8. hostが一時不健全になった場合に複数connへ警告が出る。ホストUIは不健全peerのSetを持ち、
   1人でもfalseならバナー表示、全員true/切断処理完了で非表示にする。

