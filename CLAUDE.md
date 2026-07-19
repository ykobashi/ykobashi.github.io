# ykobashi.github.io

日本語ユーザー向けの「ミニツール&ゲーム集」。GitHub Pagesでホストする静的サイト（ビルド工程なし、フレームワーク不使用）。Google AdSenseで収益化している個人開発プロジェクト。

- 公開URL: https://ykobashi.github.io/
- トップページ [index.html](index.html) が全ツール・ゲームへのハブ（カード一覧）
- 各機能は `<slug>/` ディレクトリに独立配置され、そのまま `https://ykobashi.github.io/<slug>/` として公開される

## 各ディレクトリの共通構成

すべてのツール/ゲームディレクトリは同じファイル構成に従う。

- `index.html` — ページ本体・メタタグ（title/description/OGP）
- `logic.js` — DOM に依存しない純粋なロジック関数群。`module.exports` でNode/テストからも参照できるようにする
- `script.js` — DOM操作・イベントハンドラ。IIFEで囲みグローバルを汚染しない
- `style.css` — スタイル
- `test.js` — Node標準の `assert` だけで書かれたロジックのユニットテスト（テストフレームワーク不使用）。`node <slug>/test.js` で実行し `console.log("All tests passed")` が出れば成功

新しいツール/ゲームを追加する際もこのパターンを踏襲し、[index.html](index.html) のカード一覧に追記する。

## テストの実行

```bash
node bmi-calculator/test.js
```
のように各ディレクトリで個別に実行する（一括実行スクリプトは未整備）。

## ツール一覧（便利ツール）

| ディレクトリ | 内容 |
|---|---|
| [bmi-calculator](bmi-calculator/) | 身長体重からBMIと適正体重を計算 |
| [warikan-calculator](warikan-calculator/) | 割り勘計算（端数配分あり） |
| [char-counter](char-counter/) | 文字数カウンター（原稿用紙換算・SNS文字数） |
| [unit-converter](unit-converter/) | 長さ・重さ・温度の単位変換 |
| [password-generator](password-generator/) | 乱数によるパスワード生成 |

## 診断・エンタメ

| ディレクトリ | 内容 |
|---|---|
| [past-life-diagnosis](past-life-diagnosis/) | 名前と生年月日から前世を診断 |
| [daily-fortune](daily-fortune/) | 日替わりの運勢おみくじ |
| [personality-type-quiz](personality-type-quiz/) | 質問に答えて性格タイプを診断 |
| [nickname-generator](nickname-generator/) | 名前からあだ名を生成 |
| [chuuni-name-generator](chuuni-name-generator/) | 厨二病風の二つ名を生成 |

## ゲーム

| ディレクトリ | 内容 |
|---|---|
| [gomoku](gomoku/) | 五目並べ。2人対戦・CPU対戦・オンライン対戦（PeerJS/WebRTC）に対応 |
| [memory-match](memory-match/) | 神経衰弱。2人オフライン・CPU対戦・オンライン対戦（PeerJS/WebRTC）に対応 |
| [game-2048](game-2048/) | 2048 |
| [lights-out](lights-out/) | ライツアウトパズル |
| [snake-game](snake-game/) | 矢印キー操作のスネークゲーム |

## 創作ゲーム

既存のゲームを掛け合わせたオリジナルルールの対戦ゲーム。トップページでは「ゲーム」とは別カテゴリとしてカード表示している。

| ディレクトリ | 内容 |
|---|---|
| [gomoku-othello](gomoku-othello/) | 五目並べ×オセロのオリジナル対戦ゲーム。石を置くとオセロのように挟んだ相手の石を反転させつつ、五目並べのように5連で勝利を狙う |
| [gravity-othello](gravity-othello/) | コネクト4×オセロのオリジナル対戦ゲーム。列に石を落として重力で積み上げつつ、挟んだ相手の石を反転させて4連を狙う |
| [nested-tic-tac-toe](nested-tic-tac-toe/) | 3×3の小盤が入れ子になった○×ゲーム(Ultimate Tic-Tac-Toe)。置いた位置が相手の打つべき小盤を強制し、小盤を3つ獲得して大盤の3並びを狙う |

## みんなで遊ぶ（オンライン会話・party game）

友達とオンラインで一緒に遊ぶ、有名なボードゲーム・会話ゲームの再現。会話（実際のトーク）は対面やビデオ通話など別手段で行う前提で、アプリはロビー・秘密情報の配布・フェーズ管理・投票判定だけを担当し、アプリ内チャットは実装しない。

| ディレクトリ | 内容 |
|---|---|
| [ito-game](ito-game/) | ito。数字を言わずに1〜100の順番を当てる協力ゲーム（2人〜） |
| [ng-word-battle](ng-word-battle/) | NGワード対戦版。自分だけ知らない単語を相手に言わせたら勝ち（2人〜、スコア加算なし） |
| [taboo-word-game](taboo-word-game/) | NGワードゲーム（タブー形式）。禁止ワードを避けてお題を説明する10問タイムアタック（2人〜） |
| [insider-game](insider-game/) | インサイダーゲーム。マスター・インサイダー・庶民に分かれるお題当てゲーム（3人〜） |
| [one-night-werewolf](one-night-werewolf/) | ワンナイト人狼（簡易版）。人狼・占い師・村人に分かれる正体隠匿ゲーム（3〜8人） |
| [tahoiya](tahoiya/) | たほいや。難読語のニセ定義をでっち上げて本物を当てる辞書ゲーム（2人〜、お題はアプリが自動選出するためホストも含め全員が毎回プレイヤーとして参加する） |
| [word-wolf](word-wolf/) | ワードウルフ。少数派だけ違うお題を配られ、会話と投票で人狼を探すゲーム（3人〜） |
| [word-detective](word-detective/) | ワード探偵。全員に別々の単語を配り、YES/NOの質問で相手の単語を当てる推理ゲーム（2人〜） |
| [drawing-wolf](drawing-wolf/) | お絵描き人狼。お題を知らない人狼を絵と投票で見つけるゲーム（3人〜） |
| [picture-telephone](picture-telephone/) | お絵描き伝言ゲーム。文章と絵を交互に伝えて変化を楽しむゲーム（2人〜） |

### オンライン対戦（gomoku / memory-match）

この2つのゲームだけ追加で以下のファイルを持つ：

- `net.js` — PeerJS(WebRTC)を使った1対1専用の接続管理。DOM操作は行わず、コールバック経由で `script.js` に状態を伝える
- `peerjs.min.js` — PeerJSライブラリ本体（vendored）
- 無料の公開シグナリングサーバー（0.peerjs.com）を利用し、6桁のルームコードで接続する

### オンライン対戦（みんなで遊ぶ、3人以上対応）

上記「みんなで遊ぶ」ディレクトリは、3人以上でも遊べるよう `net.js` をスター型トポロジーに拡張した別バリアントを持つ（ゲスト同士は直接つながらず、必ずホスト経由で中継する）。

- `hostRoom(handlers)` はホストが複数のゲスト接続をMapで保持し、`broadcast(data)`（全員に送信）・`sendTo(peerId, data)`（1人にだけ秘密裏に送信）を持つコントローラーオブジェクトを返す
- `joinRoom(code, handlers)` はゲスト側で、既存の1対1版と同様にホスト1人にのみ接続するが、`onOwnId(id)` で自分自身のPeerIDを受け取れるようになっている（ロビーの名簿でどの参加者が自分かを識別するために使う）
- 各ディレクトリの `net.js` は `ROOM_PREFIX` と `window.<Name>Net` の名前だけが異なり、実装はito-gameのものを基準に同一
- ロビーの流れは全ゲーム共通: 名前入力(ホスト・ゲスト共通) → ホストが部屋作成/ゲストがコード入力で参加 → ゲストが`join`メッセージで名前を送信 → ホストが名簿を`roster`としてbroadcast → ホストの「ゲーム開始」ボタン(規定人数で有効化)を押すとゲーム固有データを`sendTo`/`broadcast`で配布
- フェーズ進行(集計・次へ進む等)は基本的にホスト操作のトリガー式(自動集計ではない)。切断は再接続なしの仕様（ロビー中は名簿から削除して再同期、ゲーム中は「モード選択に戻ってください」的な案内のみ）

## その他のルート直下ファイル

- [privacy.html](privacy.html) — プライバシーポリシー
- `ads.txt` / `sitemap.xml` / `robots.txt` / `favicon.*` / `og-image.png` — SEO・広告関連
- `google*.html` — Google Search Console のサイト確認用ファイル
