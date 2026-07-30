# online-reliability 実装レビュー後の修正指示

## 背景

`feature/online-reliability`ブランチで実装された14ゲームの再接続/リロード復帰機能をレビューした結果、
`common/`側の設計・ロジック(net-core.js, peer-errors.js, wake-lock.js, rejoin-storage.js, ack-send.js)
は問題無く、`node common/test.js`・全14ゲームの`node <slug>/test.js`も通過している。

ただし、各ゲームの`script.js`側で**「参加者の保存済みルームが完全に消滅していた場合の失敗処理」が
14ゲーム中11ゲームで未実装**という不具合を発見した。以下の3点を修正すること。
新規機能の追加ではなく、既存実装の一部ゲームで抜けているパターンを他ゲームに揃えるだけの
バグ修正である。

## 修正1(最優先): 参加者の保存ルームが消滅している場合にRejoinStorageをクリアしていない

### 症状

参加者がゲーム中にリロードすると、`RejoinStorage.load(gameKey)`で保存済みセッションを検知し、
ページ読み込み直後に自動で`join`ボタンをクリックして同じ部屋への`rejoin`を試みる仕組みになっている
(例: [word-wolf/script.js:99](../word-wolf/script.js)
`if (savedSession && ...) { ...; setTimeout(() => $('join').click(), 0); }`)。

このとき、**ホストの部屋が完全に無くなっている**(ホストがタブを閉じた、シグナリングサーバーから
消えた等)場合、PeerJSは`joinRoom`の`onError`に`{type:'peer-unavailable'}`を渡す。この時点では
まだホストに一切届いていない(host側の`rejoin-rejected`応答が来る前の、より手前の失敗)。

現在、11ゲームの`onError`はエラーメッセージを表示するだけで**`RejoinStorage.clear()`を呼んでいない**。
そのため`sessionStorage`の保存内容が残り続け、**次にページをリロードしても同じ死んだ部屋への
自動再参加を延々と繰り返す**(手動でDevToolsからsessionStorageを消さない限り復帰できない)。

### 正しい実装(既に3ゲームで実装済み、これをコピーする)

[accomplice-drawing/script.js](../accomplice-drawing/script.js)の`connectGuest`内`onError`:
```js
onError(err){
  if(rejoining && err && err.type === 'peer-unavailable'){
    RejoinStorage.clear(GAME_KEY);
    showSection('setup');
    $('host').disabled = false;
    $('join').disabled = false;
  }
  peerError(err);
}
```
[drawing-wolf/script.js:224](../drawing-wolf/script.js)も同じパターン。
[ai-nickname-game/script.js:115-122](../ai-nickname-game/script.js)も同等(セットアップ画面を出す部分の
実装は異なるが、`savedSession`一致 + `peer-unavailable`でclearする点は同じ)。

**重要な事実確認**: `lobby`/`enterLobby()`的な画面遷移は、いずれのゲームも`onConnected`の中でのみ
行っている。`peer-unavailable`エラーは`onConnected`が一度も呼ばれないまま`peer.on('error')`側で
発生するため、**setup画面は元々一度も隠されていない**。したがって「setup画面に戻す」ための
特別な画面遷移コードは(既にsetup画面が表示されたままなので)ほとんどのゲームで不要であり、
実際に必要なのは (a) `RejoinStorage.clear`の呼び出しと (b) ボタンの再有効化 の2点のみである。
念のため各ゲームで対象の画面が実際にsetup状態のままになっているかを目視確認すること。

### 対象ファイルと修正方法

以下11ゲームの`script.js`で、**ゲスト側`joinRoom(...)`に渡す`onError`コールバック**(ホスト側の
`hostRoom`のonErrorではない)を特定し、既存のエラー表示呼び出しの前に以下のガードを追加する。
`savedSession`とルームコードの変数名は各ファイルの既存コードに合わせる(`onConnected`内で
`rejoin`か`join`かを分岐している条件と全く同じ条件を使うこと)。

```js
onError(err) {
  if (savedSession && savedSession.roomCode === <そのゲームでコードを保持している変数> && err && err.type === 'peer-unavailable') {
    RejoinStorage.clear(<そのゲームのgameKey文字列>);
    savedSession = null;
    // 既存のエラー表示関数が host/join ボタンの disabled=false を行っていない場合はここでも行う(修正2参照)
  }
  <既存のエラー表示関数呼び出し>(err);
}
```

対象ファイル一覧(変数名・表示関数は各ファイルを実際に読んで合わせること):

- [word-wolf/script.js:50](../word-wolf/script.js) — 表示関数`peerError`(修正2で併せて直す)
- [ito-game/script.js:190](../ito-game/script.js) — 表示関数`showOnlineError`(既にボタン再有効化あり)
- [dictionary-quiz/script.js:279](../dictionary-quiz/script.js) — 表示関数`showOnlineError`
- [picture-telephone/script.js:243](../picture-telephone/script.js) — 表示関数`peerError`(既にボタン再有効化あり)
- [tahoiya/script.js:240](../tahoiya/script.js) — 表示関数`showOnlineError`
- [word-detective/script.js](../word-detective/script.js)(1行目付近、`$('join').onclick=...`内`onError(e)`) — 表示関数`fail`
- [taboo-word-game/script.js](../taboo-word-game/script.js) — join用`onError`を特定して追加
- [wikipedia-quiz/script.js](../wikipedia-quiz/script.js) — join用`onError`を特定して追加
- [insider-game/script.js:278](../insider-game/script.js) — 表示関数は現状`describePeerError`(修正3で`PeerErrors.describe`に差し替えるのと同時に対応)
- [one-night-werewolf/script.js:287](../one-night-werewolf/script.js) — 同上
- [ng-word-battle/script.js:235](../ng-word-battle/script.js) — 表示関数`showOnlineError`

**修正しないこと**: `rejoin-rejected`メッセージ受信時の処理(既に全ゲームで正しく
`RejoinStorage.clear`している)。`err.type`が`peer-unavailable`以外(`network`/`timeout`等)の場合は
一時的な通信不良の可能性があるため、`RejoinStorage`をクリアしない(既存の正しい3ゲームと同じ
条件を厳密に踏襲する)。

## 修正2: word-wolfはエラー時にボタンが再有効化されない

[word-wolf/script.js:33](../word-wolf/script.js)
```js
function peerError(err) { showError(PeerErrors.describe(err)); console.error(err); }
```
他の全ゲームの表示関数(`showOnlineError`/`fail`/他ゲームの`peerError`)は`disabled = false`で
host/joinボタンを再有効化しているが、word-wolfだけこれが無い。以下のように修正する:

```js
function peerError(err) { showError(PeerErrors.describe(err)); $('host').disabled = false; $('join').disabled = false; console.error(err); }
```

これは`hostRoom`・`joinRoom`双方の`onError`から呼ばれる共通関数なので、この1箇所を直せば
両方のケースに効く。修正1のガード処理とは独立して、必ず両方とも行うこと。

## 修正3: 共有モジュールへの移行漏れ・デッドコードの削除

### 3a. insider-game / one-night-werewolf が common/peer-errors.js を使っていない

以下2ファイルは`common/peer-errors.js`が存在するにもかかわらず、旧来の自前関数
`describePeerError(err)`をそのまま呼び続けている(動作は壊れていないが、共通化の目的に反する):

- [insider-game/script.js:83](../insider-game/script.js) `function describePeerError(err) {...}`
- [one-night-werewolf/script.js:85](../one-night-werewolf/script.js) `function describePeerError(err) {...}`

対応: 両ファイルで`describePeerError(err)`の呼び出し箇所(host側onError・join側onError、
それぞれ1箇所ずつ、計2箇所)を`PeerErrors.describe(err)`に置き換え、その後
不要になった`function describePeerError(err) {...}`の定義自体を削除する。

### 3b. 他ゲームに残っている未使用の旧describePeerError関数を削除

`PeerErrors.describe`へ移行済みだが、置き換え前の`function describePeerError(err) {...}`定義
そのものが削除されずデッドコードとして残っているファイルがある。確認済み:

- [ito-game/script.js:59-64](../ito-game/script.js)
- [picture-telephone/script.js:20-25](../picture-telephone/script.js)

対応: 上記2ファイルに加え、残り12ゲーム全てで`grep -n "function describePeerError"`を実行し、
ヒットした場合はそのファイル内で`describePeerError(`という呼び出しが他に残っていないことを
確認した上で(念のため`PeerErrors.describe`に置き換わっていることを確認)、関数定義を削除する。
呼び出し箇所が残っている場合は先に3aと同様の置き換えを行ってから削除すること。

## 動作確認

1. `node common/test.js` と 全14ゲームの `node <slug>/test.js` が引き続き`All tests passed`であること
   (ロジック自体は変更しないため、通っていて当然だが確認する)。
2. 各ゲームで以下を手動確認する(最低でも word-wolf, ito-game, insider-game, one-night-werewolf の
   4本は必須。残り10本は代表的に2〜3本スモークテスト):
   - 参加者としてルームに参加し、ゲームを開始する。
   - **ホスト側のタブを閉じる(部屋を完全に消す)**。
   - 参加者側のタブをリロードする。
   - 「部屋が見つかりません」等のエラーが表示され、host/joinボタンが押せる状態に戻ること。
   - ブラウザDevTools の Application → Session Storage で `rejoin:<gameKey>` キーが
     消えていることを確認する。
   - **もう一度リロードしても、今度は自動再参加が発生せず、通常のセットアップ画面が表示される**こと
     (直っていない場合はここで再度自動join→失敗のループが再現する)。
3. insider-game・one-night-werewolfについては、上記に加えて`grep -n "describePeerError"`で
   呼び出し箇所が残っていないこと、`PeerErrors.describe`に置き換わっていることを確認する。
4. 全14ゲームで `grep -rn "function describePeerError"` を実行し、ヒットしないことを確認する。
5. 修正1・2の対象ではない正常系(部屋がまだ生きている状態でのリロード→正常に復帰できるケース)が
   壊れていないことも、上記4本のうち最低2本で再確認する(デグレ防止)。
