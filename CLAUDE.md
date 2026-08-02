# ykobashi.github.io

日本語ユーザー向けの「AsobiLabo」。GitHub Pagesでホストする静的サイト（ビルド工程なし、フレームワーク不使用）。Google AdSenseで収益化している個人開発プロジェクト。

- 公開URL: https://ykobashi.github.io/
- トップページ [index.html](index.html) が全ツール・ゲームへのハブ（カード一覧）
- 各機能は `<slug>/` ディレクトリに独立配置され、そのまま `https://ykobashi.github.io/<slug>/` として公開される

## push/マージルール(グローバルルールをこのプロジェクト用に上書き)

このプロジェクトに`develop`ブランチは存在せず、`main`がそのままGitHub Pagesの公開ブランチ(本番)。グローバルルールでは「プッシュして」は作業中のfeature/<内容>ブランチのpushに留め、developへのマージは「マージして」等の明示指示があった時のみ、としているが、このプロジェクトでは以下のように上書きする。

- 「プッシュして」「本番反映して」等の指示は、feature/<内容>ブランチのpushだけでなく、**`main`へのマージ＋`origin/main`へのpushまで含むもの**と解釈する（都度「mainにマージしていいですか」とは確認しない）
- 理由: このプロジェクトでは未完成の段階でプッシュを依頼されることが基本的にないため、「プッシュして」は実質「完成した内容を本番に出して」という意味で使われる
- マージ完了後、そのfeatureブランチ・使用したworktreeは都度確認せず削除する(グローバルルールの通常運用と同じ)
- ただし`git push --force`や`--no-verify`は明示指示があった場合のみ行う、という制約はグローバルルール通り変更しない

## 並行作業(worktree)

グローバルルールでは「worktreeは使わない」がデフォルトだが、このプロジェクトは静的サイトでnode_modules等のビルド成果物を持たず、作業ツリー全体が数MB程度と小さい（複製してもディスクコストがほぼ無視できる）ため、例外としてworktreeを使う。

- 複数セッションを並行して進める場合、リポジトリ直下を使い回さず、セッションごとに専用のworktreeを作る。Claude Codeアプリはリポジトリ内 `.claude/worktrees/<slug>` に自動でworktreeを作成する（`git worktree list` で実態を確認できる）ため、手動で作る場合もこのパスに揃える
  ```bash
  git worktree add .claude/worktrees/<slug> -b feature/<内容> --no-track
  ```
- 作業はそのworktreeディレクトリの中で行う。同じブランチを複数worktreeで同時にチェックアウトすることはGitの仕様上できないため、セッション同士が同じ作業ディレクトリを取り合うことはない
- mainへのマージ後、使い終わったworktreeは片付ける
  ```bash
  git worktree remove .claude/worktrees/<slug>
  ```
- worktreeはGitの機能でありエージェント側の設定ではないため、Claude Code以外のツール(Codex CLIなど)で並行作業する場合も同じ手順でよい。各ツールをそのworktreeディレクトリをカレントディレクトリにして起動するだけで、Git的には独立したブランチ・作業ディレクトリとして扱われる。Codexに渡すPlanの書き方（worktreeパスの明記・移動手順の自己完結化など）はグローバルルールの「Planの書き方(Codexへの引き継ぎ前提)」を参照

## 各ディレクトリの共通構成

すべてのツール/ゲームディレクトリは同じファイル構成に従う。

- `index.html` — ページ本体・メタタグ（title/description/OGP）
- `logic.js` — DOM に依存しない純粋なロジック関数群。`module.exports` でNode/テストからも参照できるようにする
- `script.js` — DOM操作・イベントハンドラ。IIFEで囲みグローバルを汚染しない
- `style.css` — スタイル
- `test.js` — Node標準の `assert` だけで書かれたロジックのユニットテスト（テストフレームワーク不使用）。`node <slug>/test.js` で実行し `console.log("All tests passed")` が出れば成功

新しいツール/ゲームを追加する際もこのパターンを踏襲し、[index.html](index.html) のカード一覧に追記する。

## 全ツール・ゲーム共通のデザインシステム

各ディレクトリのstyle.cssは独立ファイルだが、色相以外は同じCSS変数設計をコピーして使う。

- `:root`にアクセントカラー`--accent`/`--accent2`とその合成`--grad`（`linear-gradient(120deg, var(--accent), var(--accent2))`）、ボタン用に`--btn-c1`/`--btn-c2`/`--btn-grad`、背景・カード・文字色に`--bg`/`--card-bg`/`--text`/`--muted`/`--card-border`、エラー色に`--danger`、背景の粒状テクスチャに`--hero-grid`を定義し、ゲームごとに色の値だけ変える
- `:root[data-theme="dark"]`で同じ変数をダーク値に再定義する。ボタンの塗り(`--btn-c1`/`--btn-c2`)は文字色用の`--accent`よりトーンを落とし、暗い背景で発光しすぎないようにする
- ダークモード切り替え自体はルート直下の[theme.js](theme.js)・[theme-toggle.css](theme-toggle.css)が担当する（localStorage保存・OS設定への追従・他タブ同期込み）。各ゲームは`<script src="../theme.js"></script>`と`<link rel="stylesheet" href="../theme-toggle.css">`をheadで読み込み、bodyの先頭に`<button class="theme-toggle-btn" type="button" aria-label="ダークモードに切り替え">🌙</button>`を置くだけでよく、ゲーム側で再実装しない
- フォントは全ゲーム共通で`font-family:"Hiragino Sans","Yu Gothic",Meiryo,sans-serif`
- カード/パネル類は`border-radius:12px`・`box-shadow:0 4px 16px rgba(0,0,0,.06)`・`border:1px solid var(--card-border)`・`text-align:center`、ボタンは角丸+`--btn-grad`背景+hoverで`transform:translateY(-1px)`と`box-shadow`（`color-mix(in srgb, var(--btn-c1) 35%, transparent)`程度）、`:disabled`は`opacity:.5;cursor:not-allowed`が定番。演出はこのレベルのCSSトランジションに留め、`@keyframes`アニメーション・効果音・バイブレーション・紙吹雪のような演出は現状使っていないので、新規追加でも過剰な演出は避ける
- レスポンシブは`@media(max-width:480px)`の一段のみ（見出しのフォントサイズ縮小、結果画面ボタンの`flex-direction:column`化など）
- `index.html`のhead側も共通パターン: `theme.js`→`theme-toggle.css`→`<title>`/`description`→OGP一式(`og:title`/`og:description`/`og:type`/`og:image`/`og:url`)→`canonical`→`application/ld+json`(schema.org `Game`型、`price:"0"`)→favicon→GA4の`gtag`→AdSenseスクリプト。body側は`.theme-toggle-btn`→`.site-nav`(トップページへの戻りリンク)→`.site-header`(h1+subtitle)→広告枠→`<main>`→`footer`(著作権表示+プライバシーポリシーへのリンク)の順

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
| [billiards](billiards/) | ビリヤード。本格8ボールルールで1〜4人・2vs2チーム戦・CPU対戦・オンライン対戦（PeerJS/WebRTC）に対応 |
| [game-2048](game-2048/) | 2048 |
| [lights-out](lights-out/) | ライツアウトパズル |
| [snake-game](snake-game/) | 矢印キー操作のスネークゲーム |
| [minesweeper](minesweeper/) | マインスイーパー。初級・中級・上級から選べる1人用パズル |

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
| [accomplice-drawing](accomplice-drawing/) | 共犯ドローイング。同じお題を持つ2人の共犯を、3ターンの絵と投票から見つけるゲーム（4人〜） |
| [picture-telephone](picture-telephone/) | お絵描き伝言ゲーム。文章と絵を交互に伝えて変化を楽しむゲーム（2人〜） |
| [ai-nickname-game](ai-nickname-game/) | AIあだ名当てゲーム。AIが名付けたキャラの本当のあだ名をニセのあだ名に紛れ込ませて当てるウソ当てゲーム（2人〜、8ラウンド制で得点を競う） |
| [dictionary-quiz](dictionary-quiz/) | 辞書定義当てクイズ。辞書のような一文の意味説明から、それが示す難読語を4択で当てるゲーム（2人〜、8ラウンド制で得点を競う） |
| [wikipedia-quiz](wikipedia-quiz/) | Wikipedia冒頭当てクイズ。日本語版WikipediaのREST APIから取得した記事冒頭の抜粋文（答えの手がかりは伏字化）が何のページかを4択で当てるゲーム（2人〜、8ラウンド制で得点を競う） |
| [drawing-quiz](drawing-quiz/) | お絵描きクイズ。順番に1人が絵を描き、他の全員がお題を早当てするゲーム（2人〜、正解者に1点、全員が3回ずつ描いたら得点で順位を決める） |
| [just-one](just-one/) | ジャストワン。同じお題への重複しない一言ヒントで回答者を助ける協力ゲーム（2人〜） |
| [concept](concept/) | コンセプト（簡易版）。絵文字ボード上のピン配置だけでお題を伝える連想ゲーム（2人〜） |
| [youtube-thumbnail-quiz](youtube-thumbnail-quiz/) | YouTubeサムネ当てクイズ。ぼかしたYouTubeサムネイルからボカロ・アニソン・J-POPの曲名を4択で当てるゲーム（2人〜、ジャンル・年代を選んで8ラウンド制で得点を競う） |
| [song-intro-quiz](song-intro-quiz/) | イントロ早押しクイズ。YouTube動画のイントロを再生し、ボカロ・アニソン・J-POPの曲名を4択で当てるゲーム。再生してから回答するまでの速さで得点が変わる早押し方式（2人〜、ジャンル・年代を選んで8ラウンド制で得点を競う） |
| [real-or-fake-photo](real-or-fake-photo/) | 偽物鑑定ゲーム。実写とAI生成画像を見比べて本物を当てる5問の得点クイズ（2人〜） |
| [expression-quiz](expression-quiz/) | 表情当てクイズ。表情イラストの裏にある感情シナリオを4択で当てる3問の得点クイズ（2人〜） |

### オンライン対戦（gomoku / memory-match）

この2つのゲームだけ追加で以下のファイルを持つ：

- `net.js` — PeerJS(WebRTC)を使った1対1専用の接続管理。DOM操作は行わず、コールバック経由で `script.js` に状態を伝える
- `peerjs.min.js` — PeerJSライブラリ本体（vendored）
- 無料の公開シグナリングサーバー（0.peerjs.com）を利用し、6桁のルームコードで接続する

### オンライン対戦（みんなで遊ぶ、3人以上対応）

上記「みんなで遊ぶ」ディレクトリは、3人以上でも遊べるよう `net.js` をスター型トポロジーに拡張した別バリアントを持つ（ゲスト同士は直接つながらず、必ずホスト経由で中継する）。

- `hostRoom(handlers)` はホストが複数のゲスト接続をMapで保持し、`broadcast(data)`（全員に送信）・`sendTo(peerId, data)`（1人にだけ秘密裏に送信）を持つコントローラーオブジェクトを返す
- `joinRoom(code, handlers)` はゲスト側で、既存の1対1版と同様にホスト1人にのみ接続するが、`onOwnId(id)` で自分自身のPeerIDを受け取れるようになっている（ロビーの名簿でどの参加者が自分かを識別するために使う）
- 各ディレクトリの `net.js` は `ROOM_PREFIX` と `window.<Name>Net` の名前だけが異なり、実装は[common/net-core.js](common/net-core.js)を呼ぶ薄いラッパーとして統一されている（`net.js`自体に新規ロジックは書かない）
- ロビーの流れは全ゲーム共通: 名前入力(ホスト・ゲスト共通) → ホストが部屋作成/ゲストがコード入力で参加 → ゲストが`join`メッセージで名前を送信 → ホストが名簿を`roster`としてbroadcast → ホストの「ゲーム開始」ボタン(規定人数で有効化)を押すとゲーム固有データを`sendTo`/`broadcast`で配布
- フェーズ進行(集計・次へ進む等)は基本的にホスト操作のトリガー式(自動集計ではない)

### オンライン対戦の再接続（みんなで遊ぶ、新規ゲームも含めて全ゲーム必須）

バックグラウンド化やページのリロードで切断が起きても、ゲスト側は自動で復帰できる。**新しく「みんなで遊ぶ」系ゲームを追加する際は、この再接続の仕組みを省略せず必ず実装する**（過去に一度、新規ゲームでこれを省略してリロード中に詰む・切断で即ゲーム終了になる不具合を作ったことがあるため）。実装の基準・コピー元は[drawing-wolf](drawing-wolf/)（次点で[drawing-quiz](drawing-quiz/)）。

- 各ゲームの`index.html`は`common/`配下を次の順で読み込む: `net-core.js` → `peer-errors.js` → `wake-lock.js` → `rejoin-storage.js` → （必要なら）`ack-send.js`。`ack-send.js`は投票・ターン完了のようにホストからの自然な返信を伴わない一方通行アクションでのみ使う（回答判定のように結果が自然に返ってくるアクションには不要）
- ゲストは初回`join`時に`RejoinStorage.newToken()`でトークンを発行し、メッセージに含めてホストへ送る。ホストは名簿にこのトークンを保持するが、`roster`のbroadcast時には他ゲストへ漏らさない（`id`と`name`だけを公開する）
- ホストから`join-ack`が届いたら、ゲストは`RejoinStorage.save(gameKey, {roomCode, token, name})`で`sessionStorage`に保存する
- スクリプト読み込み時に`RejoinStorage.load(gameKey)`へ有効なセッションがあれば、セットアップ画面を出さずに自動で`{type:'rejoin', token, name, rejoinRequestId}`を送って再接続を試みる
- ホストはロビー中の切断は名簿から即削除するが、**ゲーム開始後の切断は即座にゲームを終了させない**。`pendingRejoins`（トークンをキーにしたMap）に登録し、30秒(`REJOIN_GRACE_MS`)だけ再接続を待つ。猶予内に同じトークンで`rejoin`が届けば、新しいPeer IDへの差し替え（`turnOrder`・スコア・盤面など、その人のIDに紐づく状態を丸ごと更新）→`peer-id-changed`を全員へbroadcast→現在のゲーム状態一式を`state-snapshot`として再接続者にのみ送る
- `state-snapshot`には`phase`・名簿・スコア・盤面など再開に必要な情報を含める。ただし本人だけに見せるべき秘密情報（お題・役職など）は、そのプレイヤーが現在それを知る権利を持つ場合にのみ含める（無関係な情報を漏らさない）
- 猶予切れ、または既に終了したゲームへの`rejoin`は`rejoin-rejected`で拒否する。ゲスト側はこれを受けて保存済みセッションを破棄し、セットアップ画面に戻す
- ホストの切断・リロードからの復帰は非対応（ホストのPeer IDは部屋コード由来の固定値で、ゲスト側に役割を引き継ぐ仕組みがないため）。この場合ゲストには「モード選択に戻ってください」的な案内を出すに留める

### ゲームフローの共通実装パターン（みんなで遊ぶ）

- 画面遷移をまとめる共通ヘルパー関数は存在しない。各ゲームが対象のsectionへ`classList.remove('hidden')`、他のsectionへ`add('hidden')`を並べて切り替える。section idは`setup`/`lobby`/`game`/`result`（複数ラウンド制なら`final-result-screen`も追加）で揃える。関数名も`enterXxx()`（画面固有の初期化を伴う遷移、例:`enterGame`/`enterVotingPhase`/`enterTopicReveal`）・`showResult(data)`（結果表示）・`showError`/`showOnlineError`（エラー文言表示）という命名に揃えるのが慣例
- ラウンド結果画面の「次のラウンドへ」系ボタンは常にホストにのみ表示する（`要素.classList.toggle('hidden', !isHost)`）。ゲストには専用の待機文言は出さず、ボタンが表示されないだけにする
- 複数ラウンド制のゲームは、最終ラウンドかどうかで同じボタンの文言だけ変える簡易実装（`isFinalRound`で「次の問題へ」→「最終結果を見る」のように出し分け）と、専用の`final-result-screen`に遷移させる実装の両方が存在する。新規に複数ラウンド制のゲームを作る場合は、勝者発表・自分の順位・全員のスコアボードをまとめて見せられる後者（専用の最終結果画面）を基本にする
- 結果画面の最後には**「もう一度遊ぶ」ボタン→「ゲーム一覧に戻る」リンクの順**で必ず並べる（逆順にしない）。「もう一度遊ぶ」はホストにのみ表示し（`classList.toggle('hidden', !isHost)`）、ゲストが押せる導線は用意しない。「ゲーム一覧に戻る」は`<a href="../index.html" class="secondary-btn">`のような常時表示のリンクにする
- 複数ラウンドで得点を貯めるゲームは、`logic.js`に`buildScoreboard(scores, roster)`という同名の純粋関数を持たせ、スコア降順・同点同順位（1位が2人なら次は3位、のような標準競技順位方式）でソートする（[dictionary-quiz](dictionary-quiz/)・[drawing-quiz](drawing-quiz/)が模範）。1位（同率含む）を取り出す`getWinners(scoreboard)`も同居させる
- ホスト/ゲストの出し分けは、UI表示は`要素.classList.toggle('hidden', !isHost)`、ボタン活性は`要素.disabled = !isHost || <ゲーム固有の条件>`、ホスト専用処理は関数冒頭で`if (!isHost) return;`とガードする、という書き方に揃える

### 自由記述の正誤判定（表記ゆれ許容）

お題やあだ名などを自由記述で入力させて正解と照合するゲーム（[drawing-wolf](drawing-wolf/)の人狼逆転回答、[word-wolf](word-wolf/)・[word-detective](word-detective/)の回答当て、[drawing-quiz](drawing-quiz/)のお題当てで確認）は、`logic.js`に以下とほぼ同じ`normalizeAnswer`を持ち、全角半角・大文字小文字・カタカナ/ひらがな・記号や長音符の表記ゆれを吸収してから比較する。新しく自由記述の正誤判定を作る場合はこの実装をそのままコピーする。

```js
function normalizeAnswer(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[\s\-‐‑‒–—―ー・、】【「」『』（）()]/g, ''); // 空白・記号除去
}
function isCorrectGuess(guess, answer) {
  return normalizeAnswer(guess) === normalizeAnswer(answer) && normalizeAnswer(guess).length > 0;
}
```

- `normalize('NFKC')`で全角/半角の違いを、`toLowerCase()`でアルファベットの大小を、カタカナ→ひらがな変換でカナの表記ゆれを、記号・長音符・空白の除去で区切り文字の表記ゆれを吸収する
- これだけでは「犬」と正解の「いぬ」のように漢字とひらがなで表記が割れるケース（漢字→ひらがな変換はしていない）を救えないため、正解語→別表記の配列を持つ`ANSWER_ALIASES`辞書を用意し、`isCorrectGuess`側で`[answer].concat(ANSWER_ALIASES[answer] || [])`のいずれかに一致すれば正解にする（[word-detective](word-detective/)・[word-wolf](word-wolf/)・[drawing-quiz](drawing-quiz/)の`logic.js`が実例）。お題バンクに漢字を含む語を追加するときは、対応するひらがな表記をこの辞書にも登録する
- 4択形式のクイズ（[dictionary-quiz](dictionary-quiz/)・[wikipedia-quiz](wikipedia-quiz/)）はボタン選択のため、この正規化・別表記辞書は不要

### お題・単語バンクの重複出題防止

固定バンクからお題/単語/記事タイトルを毎ラウンド抽選するゲーム（[dictionary-quiz](dictionary-quiz/)・[wikipedia-quiz](wikipedia-quiz/)・[taboo-word-game](taboo-word-game/)で確認）は、**同じ部屋内では出題済みのものをバンクを使い切るまで再抽選しない**。ホストのみが出題履歴を保持し、`logic.js`側の選択関数に渡して除外させ、返り値の履歴を次回呼び出し用に持ち回る。

```js
// bankのうちusedにないものだけを候補にする。候補が尽きたら履歴をリセットしてbank全体から選び直す
function selectRoundWord(rng = Math.random, bank = WORD_BANK, used = []) {
  const usedSet = new Set(used);
  const pool = bank.filter((entry) => !usedSet.has(entry.word));
  if (pool.length > 0) {
    const entry = pool[Math.floor(rng() * pool.length)];
    return { entry, used: used.concat([entry.word]) };
  }
  const entry = bank[Math.floor(rng() * bank.length)];
  return { entry, used: [entry.word] };
}
```

- ホスト側は`let usedWords = [];`のようにスクリプト読み込み時に一度だけ初期化し、毎ラウンド`const selection = selectRoundWord(Math.random, BANK, usedWords); usedWords = selection.usedWords;`で更新する
- **「もう一度遊ぶ」で出題履歴をリセットしてはいけない**。同じ部屋にいる間はページをリロードするまで履歴を保持し続け、バンクを使い切った時だけ関数内部で自動的に履歴をリセットして最初から選び直す（上記コード例の`pool.length > 0`分岐がそれに当たる）
- 1ラウンドで複数語をまとめて選ぶゲームは、残プールが必要数に満たない時点でリセットする（[taboo-word-game](taboo-word-game/)の`selectRoundWords`が実例）。外部APIから候補を取るゲームは「除外済みタイトルを引いた候補配列を複数返し、script.js側で先頭から順にfetchを試す」形にする（[wikipedia-quiz](wikipedia-quiz/)の`pickArticleCandidates`が実例）

### 更新履歴の運用

ユーザー向けの変更（新しいツール/ゲームの追加、既存機能の目に見える修正など）をpushする際は、[changelog-data.js](changelog-data.js)の配列先頭に新しい日付のエントリを追記する。`CLAUDE.md`の文言調整やマージコミットなど、ユーザーから見えない内部限定の変更は対象外とする。

エントリの文言は「「〇〇」を追加」「〇〇を修正」のように、何をしたかだけを一文で簡潔に書く。ゲームのルールや遊び方の説明はここでは書かない（説明は各ツール/ゲームのカード側の役割）。

## その他のルート直下ファイル

- [privacy.html](privacy.html) — プライバシーポリシー
- [changelog-data.js](changelog-data.js) — トップページに表示する更新履歴データ
- `ads.txt` / `sitemap.xml` / `robots.txt` / `favicon.*` / `og-image.png` — SEO・広告関連
- `google*.html` — Google Search Console のサイト確認用ファイル
