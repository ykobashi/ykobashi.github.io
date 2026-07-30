# AI画像当てゲーム2種 実装プラン(real-or-fake-photo / expression-quiz)

対象読者: このリポジトリの規約を知らない実装エージェント(Codex)向け。2本まとめて「みんなで遊ぶ」カテゴリに追加する前提で、追加の質問なしで実装できるようにルール・データ・通信プロトコル・画面構成・テスト・アセットまで確定させてある。1本ずつ着手してよい(依存関係なし)。

**このプランで完結しない唯一の作業は「偽物」側のAI画像5枚と表情イラスト3枚の生成**。生成プロンプトは各ゲームの節に日本語で確定済み。生成したら指定のファイル名・ディレクトリに配置するだけでよい。

## 共通仕様(2ゲーム共通)

### ファイル構成

各ディレクトリに以下を作る(既存の`dictionary-quiz`/`wikipedia-quiz`と同じパターン)。

| ファイル | 役割 |
| --- | --- |
| `index.html` | ページ本体・メタタグ(OGP/JSON-LD/canonical)。`dictionary-quiz/index.html`をコピーしてURL・タイトル・説明文・出題エリアのDOM構造だけ差し替える |
| `logic.js` | DOMに依存しない純粋関数群。`module.exports`と`window.<Name>Logic`の二重公開 |
| `net.js` | 下記「通信層」参照 |
| `peerjs.min.js` | 既存ゲームからそのままコピー(vendored) |
| `script.js` | DOM操作・イベントハンドラ。IIFEで囲む |
| `style.css` | スタイル |
| `test.js` | `node:assert`のみ、末尾`console.log('All tests passed')`。`node <slug>/test.js`で実行 |
| `assets/` | 画像アセット置き場(下記各ゲーム節を参照) |

### 一貫性の方針(最重要)

この2ゲームは「AI画像を扱う」点だけが既存ゲームと異なる。**それ以外の通信・ロビー・セキュリティ・UIの作法は`dictionary-quiz`と完全に一致させる**。新しい設計判断が必要なのは「画像の配布・検証・表示」の部分だけであり、それ以外で独自実装を増やさないこと。

- ロビー画面・進捗表示・スコアボード・「もう一度あそぶ」画面・再接続(rejoin)・state-snapshotの仕組みは[dictionary-quiz/script.js](../dictionary-quiz/script.js)をそのままコピーして名前空間だけ差し替える(`DictionaryQuizLogic`→`RealOrFakePhotoLogic`等、`DictionaryQuizNet`→`RealOrFakePhotoNet`等)。`RejoinStorage`/`AckSend`/`WakeLockHelper`/`PeerErrors`/`common/net-core.js`の利用方法もそのまま踏襲する。
- **画像src検証(セキュリティ)**: ネットワーク越しに届く画像パス文字列を検証なしで`img.src`に代入しない。直近のコミット`7c9a020 fix: オンラインゲームのXSS等セキュリティ修正`でオンラインゲーム共通のXSS対策が入っており、[ai-nickname-game/script.js:215](../ai-nickname-game/script.js:215)の`setCharacterImage`と同じ「既知バンクに実在するパスかを`some()`で照合してから`img.src`に代入する」関数を両ゲームに必須で実装する。具体形:

  ```js
  function setImage(imgEl, path, bank, extractPaths) {
    const allowed = typeof path === 'string' && extractPaths(bank).includes(path);
    imgEl.src = allowed ? path : '';
  }
  ```

- **固定アスペクト比CSS**: [ai-nickname-game/style.css:16](../ai-nickname-game/style.css:16)の`.character-image { width: min(240px, 80vw); aspect-ratio: 1; object-fit: contain; border-radius: 12px; }`と同じ考え方で、画像を表示する要素には必ず固定`aspect-ratio`+`object-fit`を指定する(具体値は各ゲーム節)。理由: 元画像の解像度がバラバラ(本物5枚は幅768〜4864px)なため、指定しないとレイアウトがガタつく。
- **alt属性でのネタバレ防止**: 出題中に表示する`<img>`のalt属性には、出典タイトルなど正解に関わる情報を一切含めない(「写真A」「写真B」のような無内容な文字列に固定する)。`credit`(出典)情報は結果画面でのみ表示する。

### 通信層(現行の実装パターン)

このリポジトリは`common/net-core.js`にスター型トポロジーの共通基盤があり、各ゲームの`net.js`は薄いラッパーになっている。[dictionary-quiz/net.js](../dictionary-quiz/net.js)が実装例:

```js
// net.js - dictionary-quiz: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'dictionary-quiz-ykobashi-' });
  window.DictionaryQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
```

今回の2ゲームはルームプレフィックス・グローバル名を以下に確定する。

| ゲーム | roomPrefix | グローバル名 |
| --- | --- | --- |
| `real-or-fake-photo` | `real-or-fake-photo-ykobashi-` | `window.RealOrFakePhotoNet` |
| `expression-quiz` | `expression-quiz-ykobashi-` | `window.ExpressionQuizNet` |

`NetCore.create({roomPrefix})`が返す`hostRoom(handlers)`/`joinRoom(code, handlers)`のAPI、`index.html`でのスクリプト読み込み順(`peerjs.min.js` → `../common/net-core.js` → `../common/rejoin-storage.js` → `../common/ack-send.js` → `../common/wake-lock.js` → `../common/peer-errors.js` → `<slug>/net.js` → `<slug>/logic.js` → `<slug>/script.js`)は[dictionary-quiz/index.html](../dictionary-quiz/index.html)のscriptタグ構成をそのままコピーする。

### ロビー・通信の全体アーキテクチャ

[dictionary-quiz/script.js](../dictionary-quiz/script.js)を丸ごとテンプレートとして流用する。以下はdictionary-quizに実在する仕組みで、両ゲームともそのまま踏襲する(再設計しない)。

- 名前入力→部屋作成/参加→`roster`のbroadcast→ホストの「開始」ボタン(`hasMinPlayers`で活性化、`MIN_PLAYERS=2`)
- `join`/`rejoin`のトークンベース処理、`state-snapshot`(`snapshotVersion:1`)による再接続時の画面復元
- `answer`メッセージの`actionId`/`scopeId`による冪等性ガードと`AckSend`によるack確認
- ホスト側`acceptAnswer`→`maybeAutoTally`→全員回答済みなら`tallyRound`という自動集計フロー
- `tallyRoundAnswers`/`computeRoundScoreDeltas`/`applyScoreDeltas`/`buildScoreboard`/`getWinners`はdictionary-quizの実装をそのまま`logic.js`にコピーして使う(スコア加算・順位計算のロジックは完全共通)
- ラウンド抽選は`selectRoundWord`と同型の「未出題を`usedWords`で管理し、尽きたらリセットして最初から選び直す」関数を両ゲームに用意する(バンクサイズ=`ROUND_TOTAL`のため実質1周だが、re-play時の挙動をdictionary-quizと一致させ、state-snapshot再接続との整合性を保つため)

---

## 1. 偽物鑑定ゲーム(`real-or-fake-photo/`)

### 概要とルール

2択クイズ。実写1枚とAI生成の偽物1枚が左右に並び、「本物はどちらか」を当てる。dictionary-quizの2択版(`CHOICE_COUNT=2`固定)。

### 定数・データモデル(`logic.js`)

```js
const MIN_PLAYERS = 2;
const ROUND_TOTAL = 5;

// id: ラウンド抽選・重複排除に使う一意キー。images[0]=本物, images[1]=偽物という固定順ではなく、
// 表示のたびに host 側で左右をシャッフルする(下記 buildRoundPayload 参照)。
const PAIR_BANK = [
  {
    id: 'pair-01',
    realImage: 'assets/real/01_ugly-fish-thing-monster.jpg',
    fakeImage: 'assets/fake/01_ugly-fish-thing-monster.jpg',
    credit: { title: 'Ugly fish-thing-monster', creator: 'mnsc', license: 'cc0', source: 'https://www.flickr.com/photos/49976053@N00/164150543' },
  },
  {
    id: 'pair-02',
    realImage: 'assets/real/02_serrivomer-deepsea-fish.jpg',
    fakeImage: 'assets/fake/02_serrivomer-deepsea-fish.jpg',
    credit: { title: '3000px PNG cutout of a full-page scientific plate showing the deep sea fish Serrivomer brevidentatus, adult specimen. Public Domain.', creator: 'Futurilla', license: 'cc0', source: 'https://www.flickr.com/photos/52067454@N00/32287773981' },
  },
  {
    id: 'pair-03',
    realImage: 'assets/real/03_jellyfish-background.jpg',
    fakeImage: 'assets/fake/03_jellyfish-background.jpg',
    credit: { title: 'Jellyfish Background', creator: 'FOCA Stock', license: 'cc0', source: 'https://stocksnap.io/photo/jellyfish-background-800NIUJGD0' },
  },
  {
    id: 'pair-04',
    realImage: 'assets/real/04_electric-color-creature.jpg',
    fakeImage: 'assets/fake/04_electric-color-creature.jpg',
    credit: { title: 'Electric Color Creature', creator: 'cogdogblog', license: 'cc0', source: 'https://www.flickr.com/photos/37996646802@N01/4434682768' },
  },
  {
    id: 'pair-05',
    realImage: 'assets/real/05_free-jellyfish-image.jpg',
    fakeImage: 'assets/fake/05_free-jellyfish-image.jpg',
    credit: { title: 'Free jelly fishes image', creator: null, license: 'cc0', source: 'https://www.rawpixel.com/image/5921710/photo-image-wallpaper-light-public-domain' },
  },
];
```

`realImage`5枚は既に配置済み([real-or-fake-photo/assets/real/](../real-or-fake-photo/assets/real/)、`metadata.json`も同ディレクトリにあり)。`fakeImage`5枚は下記プロンプトで生成し、`real-or-fake-photo/assets/fake/`に**同じファイル名**(`01_ugly-fish-thing-monster.jpg`など)で配置する(ディレクトリは新規作成)。フォーマットは本物と揃えて`.jpg`で統一する(PNGにすると圧縮ノイズの有無で見分けがつきやすくなるため)。

### コアロジック(`logic.js`)

```js
function allImagePaths(bank) {
  const paths = [];
  bank.forEach((p) => { paths.push(p.realImage, p.fakeImage); });
  return paths;
}

// rng: () => number in [0,1)。テストで固定値を渡せるように依存注入する
function buildRoundPayload(pair, rng = Math.random) {
  const correctIndex = rng() < 0.5 ? 0 : 1;
  const images = correctIndex === 0 ? [pair.realImage, pair.fakeImage] : [pair.fakeImage, pair.realImage];
  return { images, correctIndex }; // correctIndex はホストのみが保持し、question payload には含めない
}

function judgeAnswer(selectedIndex, correctIndex) {
  return selectedIndex === correctIndex;
}
```

- `selectRoundPair(rng, bank, usedIds)`: dictionary-quizの`selectRoundWord`と同型(未出題を`usedIds`で管理、尽きたらリセット)。バンクの`id`をキーに使う。

### ホスト側の状態(`script.js`)

```js
let currentPair = null;      // ホストのみが保持。{ id, images: [a, b], correctIndex, credit }
let usedPairIds = [];
```

`currentPair`はdictionary-quizの`currentEntry`と同じ役割。`credit`と`correctIndex`は**結果発表(`result`メッセージ)まで一切送信しない**。

### 通信プロトコル

| 送信元 | メッセージ | 受信側の処理 |
| --- | --- | --- |
| host → all(`broadcast`) | `{type:'question', round, totalRounds, images:[a, b]}` | 2枚を左右に表示(alt属性は「写真A」「写真B」固定、`credit`は含まない) |
| プレイヤー → host | `{type:'answer', selectedIndex, actionId, scopeId}` | dictionary-quizの`answer`と同じ冪等性ガード(`processedActions`)。`acceptAnswer(peerId, selectedIndex)`→`maybeAutoTally` |
| host → all(`broadcast`) | `{type:'progress', answeredIds}` | 「n / total 人が回答済み」 |
| host → all(`broadcast`) | `{type:'result', round, totalRounds, correctIndex, credit, correctIds, totalScores, isFinalRound, roster}` | 正解位置をハイライト、`credit`(出典)を表示、正解者一覧、スコアボード |
| host → all(`broadcast`) | `{type:'final', totalScores, roster}` | 最終結果 |

判定・集計はdictionary-quizの`tallyRoundAnswers`/`computeRoundScoreDeltas`/`applyScoreDeltas`/`buildScoreboard`/`getWinners`をそのまま使う(第2引数の「正解」を`word`ではなく`correctIndex`にするだけ)。

### 画面構成(index.html)

- ロビー: 共通仕様どおり(dictionary-quizそのまま)
- 出題画面: 左右2枚の画像(`aspect-ratio: 4/3; object-fit: cover;`の固定枠、`width: min(280px, 42vw)`程度)、各画像の下に「こちらが本物」ボタン、進捗表示(ホストのみ)
- ラウンド結果: 正解画像に枠線などでハイライト、出典(`credit.title`/`credit.source`へのリンク)を表示、正解者一覧、スコアボード、「次の問題へ」ボタン(ホストのみ)
- 最終結果: dictionary-quizと同じ構成

### 画像生成プロンプト(5枚、`assets/fake/`に配置)

1. **01_ugly-fish-thing-monster.jpg**: 「深海に生息する架空の魚類。頭部が大きく鋭い牙を持つ、グロテスクだが写実的な質感。水中写真風、暗い背景、フラッシュ光が当たったような質感。学術ドキュメンタリー写真のスタイル。」
2. **02_serrivomer-deepsea-fish.jpg**: 「深海の細長い架空のウナギ状の魚類標本。白黒に近い写真、黒背景に浮かび上がるような学術図版風の構図、鱗や体表の質感をリアルに。」
3. **03_jellyfish-background.jpg**: 「青みがかった水中を漂う架空のクラゲ。半透明の傘と触手、生物発光するような淡い光。海中写真風、青いトーン。」
4. **04_electric-color-creature.jpg**: 「鮮やかな電飾のような発色を持つ架空の深海生物のマクロ写真。青紫系の強い色彩、質感は生々しく写実的。」
5. **05_free-jellyfish-image.jpg**: 「白い背景に浮かぶ、淡く透明感のある架空のクラゲ状生物。ストックフォト風の明るいライティング、白背景。」

生成後、長辺1200px程度・JPEG品質80前後を目安にする(本物側の一部(598KB, 262KB)もこの機会に同程度へ軽くリサイズしてよいが必須ではない)。

### test.jsに書くテスト

1. `PAIR_BANK`: 5件、`id`重複なし、各エントリに`realImage`/`fakeImage`/`credit.title`/`credit.source`が非空文字列で存在する
2. `buildRoundPayload`: 固定`rng`(`()=>0`と`()=>0.99`)で`correctIndex`が0/1それぞれになり、`images`がその`correctIndex`に応じて正しい順序になっている
3. `judgeAnswer`: 一致/不一致/`null`の3パターン
4. `selectRoundPair`: dictionary-quizの`selectRoundWord`テストと同型(未出題選択→全件尽きたらリセット)
5. `tallyRoundAnswers`/`computeRoundScoreDeltas`/`applyScoreDeltas`/`buildScoreboard`: dictionary-quizのテストをそのまま流用(第二引数を`correctIndex`に差し替え)

---

## 2. はぁっていうゲーム風・表情当てクイズ(`expression-quiz/`)

### 概要とルール

dictionary-quizの「お題文(`meaning`)」を「AI生成の表情イラスト」に差し替えた4択版。表面の感情は共通、裏にある感情の色が違う4つのシナリオから正解を当てる。

### 定数・データモデル(`logic.js`)

```js
const MIN_PLAYERS = 2;
const ROUND_TOTAL = 3;
const CORRECT_POINTS = 1000;

const EXPRESSION_BANK = [
  {
    id: 'pattern-a',
    image: 'assets/faces/pattern-a.jpg',
    correctScenario: '虫が急に目の前に飛んできて驚いた',
    decoyScenarios: [
      '好きなアーティストの引退発表を見て驚いた',
      '宝くじの高額当選が判明して驚いた',
      '後ろから急に肩を叩かれて驚いた',
    ],
  },
  {
    id: 'pattern-b',
    image: 'assets/faces/pattern-b.jpg',
    correctScenario: '大切に育てていた植物が枯れているのに気づいて悲しい',
    decoyScenarios: [
      '楽しみにしていた旅行が土壇場でキャンセルになって悲しい',
      '友人と些細な喧嘩をしたまま仲直りできず別れて悲しい',
      '感動的な映画のラストシーンを見て悲しい',
    ],
  },
  {
    id: 'pattern-c',
    image: 'assets/faces/pattern-c.jpg',
    correctScenario: '好きな人にうっかり本音を言ってしまって恥ずかしい',
    decoyScenarios: [
      '大勢の前で盛大に転んでしまって恥ずかしい',
      '仕事のミスを上司の前で指摘されて気まずい',
      '誕生日を祝ってもらって照れくさい',
    ],
  },
];
```

画像は`.jpg`で統一(本物鑑定ゲームとフォーマット方針を揃える。イラストなのでPNGでもよいが、このリポジトリのキャラ画像([ai-nickname-game/assets/characters/](../ai-nickname-game/assets/characters/))はPNG採用なので、実際に生成した拡張子に合わせて`image`パスを書き換えて構わない)。

### コアロジック(`logic.js`)

```js
// dictionary-quizのbuildChoicesは「グローバルバンクから正解以外を抽出する」設計のためそのまま流用できない。
// このゲームの誤答3つはパターンごとに固定(decoyScenarios)なので専用実装にする。
function buildChoices(entry, rng = Math.random) {
  return shuffle([entry.correctScenario].concat(entry.decoyScenarios), rng);
}

function judgeAnswer(selectedScenario, correctScenario) {
  return !!selectedScenario && selectedScenario === correctScenario;
}
```

`shuffle`/`selectRoundEntry`(未出題管理)はdictionary-quizと同型のものを`logic.js`内にコピーする。

### ホスト側の状態(`script.js`)

```js
let currentEntry = null;   // ホストのみ保持。{ id, image, correctScenario, decoyScenarios }
let usedEntryIds = [];
```

### 通信プロトコル

| 送信元 | メッセージ | 受信側の処理 |
| --- | --- | --- |
| host → all(`broadcast`) | `{type:'question', round, totalRounds, image, choices}` | 画像を表示(alt属性は「表情イラスト」など無内容な固定文字列)、4択ボタンを表示 |
| プレイヤー → host | `{type:'answer', selectedScenario, actionId, scopeId}` | dictionary-quizの`answer`と同じ冪等性ガード |
| host → all(`broadcast`) | `{type:'progress', answeredIds}` | 進捗表示 |
| host → all(`broadcast`) | `{type:'result', round, totalRounds, correctScenario, correctIds, totalScores, isFinalRound, roster}` | 正解シナリオ・正解者・スコアボード表示 |
| host → all(`broadcast`) | `{type:'final', totalScores, roster}` | 最終結果 |

判定・集計はdictionary-quizの`tallyRoundAnswers`等をそのまま使う(第二引数を`correctScenario`にするだけ)。

### 画面構成(index.html)

- ロビー: 共通仕様どおり
- 出題画面: 表情イラスト1枚(`aspect-ratio: 1; object-fit: contain;`、`width: min(240px, 80vw)` — [ai-nickname-game/style.css:16](../ai-nickname-game/style.css:16)の`.character-image`と同じ方針)、4択ボタン(dictionary-quizの`choices-list`と同じ構造)
- ラウンド結果: 正解シナリオをハイライト、正解者一覧、スコアボード、「次の問題へ」ボタン
- 最終結果: dictionary-quizと同じ構成

### 画像生成プロンプト(3枚、`assets/faces/`に配置)

1. **pattern-a**(表面感情: 驚き / 正解: 虫への嫌悪・恐怖寄りの驚き): 「目を大きく見開き、少し仰け反りながら口をへの字に歪めて後ずさるような、嫌悪と恐怖が混じった驚きの表情のイラスト。虫が視界に入った瞬間のように身をすくめる仕草。シンプルな線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ。」
2. **pattern-b**(表面感情: 悲しみ / 正解: 静かな喪失感): 「静かにうつむき、目にうっすら涙を浮かべているが声を上げて泣いてはいない、じんわりとした喪失感を表す表情のイラスト。パターンAと同じ線画+平坂色スタイル、背景無地、顔のクローズアップ。」
3. **pattern-c**(表面感情: 照れ・気まずさ / 正解: 好きな人への照れと嬉しさ): 「頬を赤らめ、視線を逸らしながら口元だけ微笑んでいる、恥ずかしさと嬉しさが混じった表情のイラスト。パターンA/Bと同じ線画+平坂色スタイル、背景無地、顔のクローズアップ。」

### test.jsに書くテスト

1. `EXPRESSION_BANK`: 3件、`id`重複なし、各エントリで`decoyScenarios.length === 3`、`correctScenario`が非空文字列、全パターンを通して`correctScenario`+全`decoyScenarios`の文字列がバンク全体で重複していない(`Set`のサイズが総数と一致)
2. `buildChoices`: 返り値の長さが4、正解シナリオを含む、固定`rng`で順序が決定的
3. `judgeAnswer`: 一致/不一致/`null`の3パターン
4. `selectRoundEntry`: 未出題管理(dictionary-quizの`selectRoundWord`テストと同型)
5. `tallyRoundAnswers`/`computeRoundScoreDeltas`/`applyScoreDeltas`/`buildScoreboard`: dictionary-quizのテストをそのまま流用

---

## トップページ・SEO関連(2ゲーム共通)

各ゲーム実装時に以下を必ず行う。

- [index.html](../index.html)の「みんなで遊ぶ」カード一覧(`dictionary-quiz`/`wikipedia-quiz`カードの近く)に同じ構造でカードを追加
- [sitemap.xml](../sitemap.xml)に`https://ykobashi.github.io/<slug>/`を追加
- `index.html`のOGP/JSON-LD/canonicalは既存ゲームの該当箇所をコピーしてURL・タイトル・説明文だけ差し替え
- [CLAUDE.md](../CLAUDE.md)の「みんなで遊ぶ」表に1行ずつ追記

## 完了条件

- 両ゲームとも`node <slug>/test.js`が`All tests passed`で通る
- `real-or-fake-photo/assets/fake/`に5枚、`expression-quiz/assets/faces/`に3枚のAI生成画像が配置されている(ファイル名は上記の通り)
- index.html/sitemap.xml/CLAUDE.mdへの登録が完了している
- 出題中の画面(alt属性・DOM・ネットワーク送信data)に正解を示す情報(`credit`やファイル名以外の出典情報)が一切含まれていない

---

## 実装状況: 出題プール拡張(2026-07-30)

既存5件に以下の25件を追加し、`PAIR_BANK`を30件に拡張する。ライセンス表記はOpenverseの検索結果どおり、`cc0`または`pdm`を記録する。

### 新規実写25枚のクレジット

| No. | realファイル | title | creator | license | source |
| --- | --- | --- | --- | --- | --- |
| 06 | `06_largescale-lanternfish.jpg` | NMNH-EO 400383 Largescale Lanternfish Symbolophorus veranyi 005 (cropped) | Smithsonian Institute | cc0 | [source](https://commons.wikimedia.org/w/index.php?curid=130345799) |
| 07 | `07_ophidiid-fish.jpg` | Ophidiid Fish off Salmon Bank in the Northwestern Hawaiian Islands. | Papahānaumokuākea Marine National Monument | pdm | [source](https://www.flickr.com/photos/93641120@N05/25191314703) |
| 08 | `08_insect-macro.jpg` | Insect macro | C.Frayle | cc0 | [source](https://www.flickr.com/photos/51195133@N03/36301512526) |
| 09 | `09_praying-mantis.jpg` | Macro Shot of Praying Mantis | Image Catalog | cc0 | [source](https://www.flickr.com/photos/132795455@N08/16711766504) |
| 10 | `10_dragonfly-macro.jpg` | Dragonfly, insects macro photography | U.S. Department of Agriculture | cc0 | [source](https://www.rawpixel.com/image/8732074/photo-image-flower-public-domain-animal) |
| 11 | `11_mushroom-underneath.jpg` | Mushroom, underneath_2012-09-21-14.51.00 ZS PMax | Sam Droege | pdm | [source](https://www.flickr.com/photos/54563451@N08/8016189217) |
| 12 | `12_little-brown-mushrooms.jpg` | Little Brown Mushrooms | GlacierNPS | pdm | [source](https://www.flickr.com/photos/43288043@N04/52129861618) |
| 13 | `13_mushroom-family.jpg` | a mushroom Family | planes, space, nature | pdm | [source](https://www.flickr.com/photos/158350039@N03/44573605254) |
| 14 | `14_mineral-crystals.jpg` | Mineral Crystals | Gary Lee Todd, Ph.D. | pdm | [source](https://www.flickr.com/photos/101561334@N08/53896323525) |
| 15 | `15_garnet-crystals.jpg` | Garnet babies2_2015-08-07-20.33 | Sam Droege | pdm | [source](https://www.flickr.com/photos/54563451@N08/20282238198) |
| 16 | `16_fluorite-crystal.jpg` | Fluorite, Helen Folger, with foil_2015-08-07-17.50.41 ZS PMax UDR | Sam Droege | pdm | [source](https://www.flickr.com/photos/54563451@N08/20371218106) |
| 17 | `17_minnetonka-cave.jpg` | Minnetonka Cave Formations | Intermountain Region US Forest Service | pdm | [source](https://www.flickr.com/photos/107640324@N05/14151279233) |
| 18 | `18_tongass-cave.jpg` | cave formations POWI June 2022 - Tongass-SAJ-003 | Forest Service Alaska Region, USDA | cc0 | [source](https://www.flickr.com/photos/58184989@N07/52503265513) |
| 19 | `19_pitcher-plant-bee.jpg` | The Pitcher Plant and the Bee | Kaitlin Bellamy | cc0 | [source](https://www.flickr.com/photos/143158739@N03/27242127462) |
| 20 | `20_carnivorous-plants.jpg` | carnivorous plants | lisafree54 | cc0 | [source](https://www.flickr.com/photos/136594255@N06/27714120334) |
| 21 | `21_romanesco.jpg` | chou romanesco | didier.camus | pdm | [source](https://www.flickr.com/photos/131830853@N05/50686315828) |
| 22 | `22_dragon-fruit.jpg` | A dragon fruit | Helga Kattinger | cc0 | [source](https://commons.wikimedia.org/w/index.php?curid=106664700) |
| 23 | `23_fallacirripectes-xray.jpg` | Fallacirripectes wellsi Schultz & Chapman | Earl S. Herald | cc0 | [source](https://n2t.net/ark:/65665/384bfeff3-974d-4358-8462-6ccc02e19609) |
| 24 | `24_omobranchus-xray.jpg` | Omobranchus meniscus Springer & Gomon(ラベル部分をトリミング済み) | Nai Mah | cc0 | [source](https://n2t.net/ark:/65665/318528bba-4bd4-4239-8309-10ec70042d99) |
| 25 | `25_lenticular-cloud-dunes.jpg` | Lenticular Cloud over Great Sand Dunes and Mount Herard | Great Sand Dunes National Park and Preserve | pdm | [source](https://www.flickr.com/photos/94707653@N06/40566035845) |
| 26 | `26_lenticular-clouds.jpg` | Lenticular clouds | YellowstoneNPS | pdm | [source](https://www.flickr.com/photos/80223459@N05/15685914817) |
| 27 | `27_bull-frog.jpg` | Bull Frog | U. S. Fish and Wildlife Service - Northeast Region | pdm | [source](https://www.flickr.com/photos/43322816@N08/5278271076) |
| 28 | `28_boreal-chorus-frog.jpg` | Boreal Chorus Frog | YellowstoneNPS | pdm | [source](https://www.flickr.com/photos/80223459@N05/14098240918) |
| 29 | `29_tuatara.jpg` | Tuatara. | Bernard Spragg | cc0 | [source](https://www.flickr.com/photos/88123769@N02/8686980163) |
| 30 | `30_curious-reptile.jpg` | Curious Reptile | pasukaru76 | cc0 | [source](https://www.flickr.com/photos/38451115@N04/8408104864) |

### 新規偽物25枚の生成プロンプト

全件共通で「実在する種・作品の複製ではない架空の被写体」「文字、透かし、ロゴなし」「自然な撮影ノイズ」「4:3横位置の写実写真」「長辺1200px程度、JPEG品質80前後」とする。

1. **`06_largescale-lanternfish.jpg`**: 白背景で撮影された架空の深海魚の標本写真。銀色に光る大きな目、艶のある体表、鰭の精密な質感、自然史博物館の標本撮影のような均一なライティング。
2. **`07_ophidiid-fish.jpg`**: 暗い水中を漂う架空の細長い深海魚の生態写真。淡いグレーの体表、大きな目、水中撮影特有のわずかなぼやけと自然な浮遊感、黒背景。
3. **`08_insect-macro.jpg`**: 架空の小型昆虫の超接写。複眼、微細な毛、金属光沢の外骨格を写実的にし、浅い被写界深度と自然光のマクロ写真にする。
4. **`09_praying-mantis.jpg`**: 架空のカマキリに似た昆虫の接写。細長い鎌状の前脚、大きな複眼、長い触角、暗い背景に浮かぶ自然光のマクロ写真。
5. **`10_dragonfly-macro.jpg`**: 架空のトンボに似た昆虫が植物に止まる接写。透明な翅の複雑な翅脈、大きな複眼、柔らかな緑のボケ背景。
6. **`11_mushroom-underneath.jpg`**: 架空のキノコを傘の裏から見上げた接写。放射状のひだ、湿った質感、森の散乱光、極端なローアングル。
7. **`12_little-brown-mushrooms.jpg`**: 苔むした倒木に群生する架空の小さな茶色いキノコ。雨上がりの森、自然な個体差、浅い被写界深度。
8. **`13_mushroom-family.jpg`**: 大小の架空のキノコが家族のように集まる森床の写真。落ち葉と苔、柔らかな逆光、現実的な菌類の質感。
9. **`14_mineral-crystals.jpg`**: 架空の鉱物標本。半透明の青緑色結晶が複雑に連なり、母岩の上で博物館照明を受ける高精細写真。
10. **`15_garnet-crystals.jpg`**: 岩石中に小さな架空の赤褐色結晶が多数埋まった標本の接写。不揃いな結晶面、自然な傷と土埃。
11. **`16_fluorite-crystal.jpg`**: 架空の蛍石状鉱物標本。紫から緑へ変化する立方体結晶、欠けや内包物、黒背景の標本写真。
12. **`17_minnetonka-cave.jpg`**: 架空の鍾乳洞内部。層状の鍾乳石と石筍、湿った岩肌、控えめな観光照明による実写の洞窟写真。
13. **`18_tongass-cave.jpg`**: 原生林地下にある架空の石灰洞。奇妙にねじれた生成物、水滴、ヘッドライトだけで撮影した探検記録写真。
14. **`19_pitcher-plant-bee.jpg`**: 赤と白の網目模様を持つ架空の食虫植物の捕虫葉に、虫が触れている接写。花びらのような縁、光を透かす模様、庭園の自然光で撮った写真。
15. **`20_carnivorous-plants.jpg`**: 赤と緑の葉を持つ架空の食虫植物の接写。粘液の粒や細い毛を写実的にし、庭園で撮った自然な写真。
16. **`21_romanesco.jpg`**: 架空のロマネスコ状野菜。黄緑色の螺旋が通常と異なる分岐を示し、市場の自然光で撮った食品写真。
17. **`22_dragon-fruit.jpg`**: 白背景に置かれた架空の果実の静物写真。鮮やかなピンクと黄緑の外皮、先端がカールした突起、艶のある質感のスタジオ撮影風。
18. **`23_fallacirripectes-xray.jpg`**: 架空の小型ナマズ状魚類のX線標本写真。頭骨、脊椎、鰭条が精密に透けて見え、黒背景に白く浮かぶ自然史博物館の画像資料風。
19. **`24_omobranchus-xray.jpg`**: 架空の細長い魚類のX線標本写真(ラベル文字は写り込ませない)。複雑な頭骨と多数の脊椎、半透明の鰭条、黒背景の分類学資料風。
20. **`25_lenticular-cloud-dunes.jpg`**: 砂丘と山脈の上に巨大な架空のレンズ雲が重なる風景。夕方の斜光、自然な大気遠近、国立公園の記録写真風。
21. **`26_lenticular-clouds.jpg`**: 高原の上空に何層もの滑らかな架空のレンズ雲が浮かぶ風景。冬の淡い光、広角レンズ、自然な気象写真。
22. **`27_bull-frog.jpg`**: 水辺で身を伏せる架空の大型カエル。湿った斑模様の皮膚、力強い後脚、大きな鼓膜、浅い被写界深度の自然観察写真風。
23. **`28_boreal-chorus-frog.jpg`**: 草の葉にしがみつく架空の小型カエル。背中の細い縞模様、繊細な指先、朝露と柔らかな自然光の生態写真風。
24. **`29_tuatara.jpg`**: 岩場にいる架空の原始的爬虫類。背中の棘、粒状の鱗、重い体つき、曇天の保護区で撮った写真。
25. **`30_curious-reptile.jpg`**: カメラを覗き込む架空の小型爬虫類。大きな眼、細かな鱗、少し傾げた頭、自然光のユーモラスな野外接写。

### 表情当てクイズ追加27パターン

以下は拡張指示で確定した27件を、`correctScenario`、`decoyScenarios`3件、イラストプロンプトを含めて原文どおり転記したもの。画像は`assets/faces/pattern-04.jpg`〜`pattern-30.jpg`。

### 怒り(3件)

- **pattern-04**(女性)correctScenario:「並んでいた行列に横から割り込まれて腹が立った」/ decoyScenarios:「好きなチームが逆転負けして悔しくて腹が立った」「弟にお気に入りのゲームを壊されて腹が立った」「催促していた返信が既読無視されたままで腹が立った」/ イラストプロンプト:「眉をきつく吊り上げ、口を真一文字に結んで睨みつけるような、強い怒りの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-05**(男性)correctScenario:「秘密にしていた話を友人に勝手に言いふらされて怒っている」/ decoyScenarios:「大事な仕事の締め切りを土壇場で変更されて怒っている」「順番を守らない人に注意しても聞いてもらえず怒っている」「楽しみにしていた誕生日を家族に忘れられて怒っている」/ イラストプロンプト:「眉間に深いしわを寄せ、歯を食いしばるように口元を固くこわばらせている、裏切られたような怒りの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-06**(女性)correctScenario:「何度も同じ間違いを繰り返す後輩についに堪忍袋の緒が切れた」/ decoyScenarios:「隣の部屋の騒音が真夜中まで続いて我慢の限界だ」「大切にしていた本にジュースをこぼされて我慢できない」「何度言っても靴を脱ぎっぱなしにする家族についカッとなった」/ イラストプロンプト:「こめかみに青筋を立てるように眉を吊り上げ、口をへの字に結んで肩を怒らせている、我慢の限界を迎えた怒りの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」

### 喜び(3件)

- **pattern-07**(男性)correctScenario:「何ヶ月も練習した曲をついに最後まで弾き切れて嬉しい」/ decoyScenarios:「宝くじで思いがけず小当たりして嬉しい」「久しぶりに会った友人と話が弾んで嬉しい」「注文した新しい家具が届いて嬉しい」/ イラストプロンプト:「目を輝かせ、口角を大きく上げて満面の笑みを浮かべている、達成感の伴う喜びの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-08**(女性)correctScenario:「作った料理を家族に美味しいと言ってもらえて嬉しい」/ decoyScenarios:「探していた絶版の本をやっと手に入れて嬉しい」「道に迷っていた人を案内してお礼を言われて嬉しい」「飼っている犬が新しい芸を覚えて嬉しい」/ イラストプロンプト:「頬を緩ませ、目を細めてやわらかく微笑んでいる、誰かを喜ばせられた温かい喜びの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-09**(男性)correctScenario:「サプライズで誕生日会を開いてもらって嬉しい」/ decoyScenarios:「憧れていた会社から内定の連絡が来て嬉しい」「長年欲しかった靴がセールで安く買えて嬉しい」「植えた種から初めて芽が出て嬉しい」/ イラストプロンプト:「両手を頬に添え、目を丸くしながら口を大きく開けて笑っている、驚きが混じった弾けるような喜びの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」

### 不安(3件)

- **pattern-10**(女性)correctScenario:「試験の合否発表を明日に控えて眠れないほど不安だ」/ decoyScenarios:「初めての一人暮らしがうまくいくか不安だ」「大事な会議でうまく話せるか不安だ」「友人としばらく連絡が取れず何かあったのか不安だ」/ イラストプロンプト:「眉尻を下げ、視線を落として指先を軽く噛むような仕草をしている、結果を待つ落ち着かない不安の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-11**(男性)correctScenario:「電車が長時間止まっていて大事な約束に間に合うか不安だ」/ decoyScenarios:「新しい職場に馴染めるか不安だ」「飼っている猫の食欲がないので体調が不安だ」「初めて挑戦する料理がうまく仕上がるか不安だ」/ イラストプロンプト:「眉を八の字に下げ、口元を軽く引き結んで視線をせわしなく動かしている、見通しの立たない落ち着かない不安の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-12**(女性)correctScenario:「体調を崩した家族の検査結果が出るまで気が気でない」/ decoyScenarios:「初めて子供を一人でお使いに行かせて心配だ」「送ったメッセージがずっと既読にならず心配だ」「天気予報で明日の遠足が雨になりそうで不安だ」/ イラストプロンプト:「両手を胸の前で軽く握りしめ、眉根を寄せてうつむき加減にしている、大切な人を案じる不安の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」

### 呆れ(3件)

- **pattern-13**(男性)correctScenario:「兄が何度注意しても部屋を片付けないので呆れている」/ decoyScenarios:「同僚が毎回同じ言い訳で遅刻してくるので呆れている」「友人が突拍子もない思いつきを本気で実行しようとしていて呆れている」「セール品を見境なく買い込む自分に呆れている」/ イラストプロンプト:「片方の眉だけを軽く上げ、半目でため息をつくように口を軽く開けている、脱力感のある呆れの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-14**(女性)correctScenario:「明らかに自分のミスを人のせいにする人を見て呆れている」/ decoyScenarios:「渋滞の原因が些細な事故だと知って呆れている」「何年も同じ冗談を繰り返す上司に呆れている」「行列に並んだのに売り切れだったと知って呆れている」/ イラストプロンプト:「目を半分閉じ、口角を片方だけ下げて肩をすくめている、冷めた呆れの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-15**(男性)correctScenario:「同じ忘れ物を三日連続でしてしまい自分に呆れている」/ decoyScenarios:「後輩の思いがけない失敗談を聞いて呆れている」「渾身のジョークが誰にも笑ってもらえず呆れている」「ペットが家中を散らかしているのを見て呆れている」/ イラストプロンプト:「額に手を当て、天を仰ぐように目線を上げて小さくため息をついている、自分自身に呆れた表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」

### 緊張(3件)

- **pattern-16**(女性)correctScenario:「大勢の前でスピーチする直前で緊張している」/ decoyScenarios:「初対面の相手と挨拶を交わす前で緊張している」「ジェットコースターの発車を待つ間緊張している」「面接の順番を待つ間緊張している」/ イラストプロンプト:「両手を胸の前で軽く組み、唇を引き結んで視線をやや泳がせている、人前に出る直前の張り詰めた緊張の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-17**(男性)correctScenario:「プロジェクトの結果発表を前に緊張している」/ decoyScenarios:「初めてのデートで待ち合わせ場所に向かう途中で緊張している」「久しぶりに運転する車のエンジンをかける前で緊張している」「大事な試合のキックオフ直前で緊張している」/ イラストプロンプト:「額にうっすら汗を浮かべ、こわばった表情で拳を軽く握りしめている、大事な瞬間を待つ緊張の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-18**(女性)correctScenario:「サプライズパーティーの準備がばれないよう取り繕っていて緊張している」/ decoyScenarios:「初めての一人での電車の乗り換えで緊張している」「大事な書類を提出する直前で緊張している」「憧れの人に話しかける勇気を出そうとして緊張している」/ イラストプロンプト:「ぎこちない作り笑いを浮かべながら、目だけが落ち着かなく動いている、何かを隠しながらの緊張の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」

### 困惑(3件)

- **pattern-19**(男性)correctScenario:「頼んでいない荷物が急に届いて困惑している」/ decoyScenarios:「複雑な説明書を読んでも組み立て方が分からず困惑している」「知らない番号から突然電話がかかってきて困惑している」「道を聞かれたが自分もよく知らない場所で困惑している」/ イラストプロンプト:「片方の眉を上げ、口を軽く開けたまま首をかしげている、予想外の出来事に戸惑う困惑の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-20**(女性)correctScenario:「友人と話しているうちに話の前提がずれていたことに気づき困惑している」/ decoyScenarios:「外国語の看板の意味が全く分からず困惑している」「約束の時間や場所を勘違いしていたと気づき困惑している」「同じ名前の人が二人いて話がこんがらがり困惑している」/ イラストプロンプト:「目を細めて眉間に軽くしわを寄せ、口元に手を当てて考え込んでいる、話が噛み合わない困惑の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-21**(男性)correctScenario:「メニューの種類が多すぎて何を頼むか決められず困惑している」/ decoyScenarios:「複数の予定が同じ日に重なってしまい困惑している」「操作方法が複雑な新しい家電の使い方が分からず困惑している」「二人から同時に別々の頼まれごとをされて困惑している」/ イラストプロンプト:「視線を左右にさまよわせ、口をすぼめて悩ましげにしている、選択に迷う困惑の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」

### 動揺(3件)

- **pattern-22**(女性)correctScenario:「発表資料の重大な誤りを本番直前に指摘されて動揺している」/ decoyScenarios:「大事な待ち合わせに大幅に遅れそうで動揺している」「うっかり口を滑らせて秘密を話してしまい動揺している」「スマホを落として画面が割れてしまい動揺している」/ イラストプロンプト:「目を大きく見開き、口元に手を当てて青ざめたように固まっている、不意を突かれた動揺の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-23**(男性)correctScenario:「別れた元恋人と偶然街で再会して動揺している」/ decoyScenarios:「大事なデータを保存し忘れてパソコンが落ちてしまい動揺している」「憧れの有名人と偶然すれ違って動揺している」「上司に呼び出しの理由も告げられずに動揺している」/ イラストプロンプト:「頬をこわばらせ、視線を泳がせながら言葉を失ったように立ち尽くしている、予期せぬ出来事への動揺の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-24**(女性)correctScenario:「取引先へのメールを別の相手に誤送信してしまい動揺している」/ decoyScenarios:「大事な約束をすっかり忘れていたことに気づき動揺している」「電車の中に大切な荷物を置き忘れたことに気づき動揺している」「知らないうちに服のタグを付けたまま外出していたと気づき動揺している」/ イラストプロンプト:「両手で口元を覆い、眉を八の字にして目を見開いている、取り返しのつかないミスへの動揺の表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」

### 諦め(3件)

- **pattern-25**(男性)correctScenario:「土砂降りの中、傘を忘れたことに気づき濡れて帰るしかないと諦めている」/ decoyScenarios:「何度挑戦しても解けないパズルを前に諦めかけている」「満席で予約が取れず今日は諦めるしかないと思っている」「言っても伝わらない相手との議論を諦めている」/ イラストプロンプト:「肩をがっくりと落とし、目を閉じて小さくため息をついている、状況を受け入れて力が抜けたような諦めの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-26**(女性)correctScenario:「長時間並んだ末に目当ての商品が売り切れていて諦めている」/ decoyScenarios:「何時間もかけて作った資料が土壇場でボツになり諦めている」「大事な試合で実力を出し切れず負けを認めて諦めている」「探し物がどうしても見つからず探すのを諦めている」/ イラストプロンプト:「口角を力なく下げ、視線を落として肩の力を抜いている、努力が報われなかった静かな諦めの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-27**(男性)correctScenario:「締め切りに間に合わないと悟り開き直って諦めている」/ decoyScenarios:「渋滞にはまり予定通りに着くのを諦めている」「苦手な食べ物をどうしても克服できず諦めている」「天気予報が外れて計画していた予定を諦めている」/ イラストプロンプト:「半笑いを浮かべながら両手を軽く上げ、開き直ったような投げやりな諦めの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」

### 驚き・悲しみ・照れの追加(各1件、計3件)

- **pattern-28**(女性・追加の驚き)correctScenario:「久しく会っていない旧友が突然目の前に現れて驚いた」/ decoyScenarios:「頼んでいた荷物が予定より大幅に早く届いて驚いた」「静かな部屋で急に大きな物音がして驚いた」「思っていたより会計金額が高くて驚いた」/ イラストプロンプト:「目を丸く見開き、口を軽く開けて両手を頬の横に添えている、嬉しさを伴った驚きの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」
- **pattern-29**(男性・追加の悲しみ)correctScenario:「長年一緒にいたペットを見送ることになり悲しい」/ decoyScenarios:「引っ越しで慣れ親しんだ街を離れることになり悲しい」「大切にしていたものを誤って壊してしまい悲しい」「楽しかった旅行が終わり日常に戻ることに悲しい」/ イラストプロンプト:「目を伏せ、口元を固く結んで肩を落としている、大切な存在との別れを噛みしめる悲しみの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、男性のキャラクター。」
- **pattern-30**(女性・追加の照れ)correctScenario:「頑張って作った料理を思いがけず絶賛されて照れくさい」/ decoyScenarios:「大勢の前で名前を呼ばれて注目を浴びて照れくさい」「好きな人とうっかり手が触れてしまい照れくさい」「懐かしい呼び方であだ名を呼ばれて照れくさい」/ イラストプロンプト:「頬をほんのり赤らめ、照れ隠しに口元を軽く手で覆いながら微笑んでいる、褒められて嬉しい照れの表情のイラスト。線画+平坂色のイラストスタイル、背景無地、顔のクローズアップ、女性のキャラクター。」

---

## Codexへの残作業: 画像生成(2026-07-30時点、これだけが残っている)

対象読者: Codex。作業ディレクトリはこのリポジトリのルート、ブランチ`feature/ai-image-quiz-pool-expansion`。**コード・データ・実写素材はすべて完成・検証済み。** `real-or-fake-photo/assets/fake/`の25枚と`expression-quiz/assets/faces/`の27枚(`pattern-04.jpg`〜`pattern-30.jpg`)が、確認用の単色+番号のプレースホルダーjpgのままになっている。これをこの節のプロンプト通りにAI生成した本番画像へ**同じファイル名で上書き**するだけで完了する。

### 事前に知っておくべきこと(なぜこの節があるか)

`feature/ai-image-quiz-pool-expansion`ブランチを実装確認したところ、`PAIR_BANK`/`EXPRESSION_BANK`のデータ拡張・テスト・トップページ登録は完了していたが、以下の2点の不備が見つかり、このセッションで修正済み。

1. 新規実写25枚のうち6枚(`06`/`07`/`09`/`19`/`22`/`24`)に、複数被写体+文字キャプション入りの図版・被写体不在の風景・実在の人物の顔・標本ラベルの文字板、といった不適切な素材が混入していた。上記「新規実写25枚のクレジット」と「新規偽物25枚の生成プロンプト」の表は、差し替え後の内容に**既に更新済み**なので、そのまま使えばよい(実写ファイルの差し替えは完了しており、Codexが再度触る必要はない)。
2. 新規52枚(偽物25+表情27)の画像生成自体がまだ行われておらず、全部プレースホルダーだった。これが今回の作業本体。

### やること

1. 上記「新規偽物25枚の生成プロンプト」節の1〜25(ファイル名`06_largescale-lanternfish.jpg`〜`30_curious-reptile.jpg`)に従って画像を生成し、`real-or-fake-photo/assets/fake/`配下の同名ファイルを上書きする。
   - 各実写(`real-or-fake-photo/assets/real/`の同名ファイル)と構図・被写体サイズ・視点・明るさ・背景色・彩度・被写界深度を横並びで見比べながら生成し、「解像度感やノイズの違いだけで正解がわかる」ことがないようにする。
   - 文字・透かし・ロゴ・実在の生物種名を画像内に入れない。長辺1200px程度、JPEG品質80〜85。
2. 上記「表情当てクイズ追加27パターン」節の各イラストプロンプトに従って画像を生成し、`expression-quiz/assets/faces/pattern-04.jpg`〜`pattern-30.jpg`を上書きする。プロンプト中の性別指定(女性14件・男性13件、既存`pattern-a`〜`c`は男性)通りに描き分ける。
3. 既存の`real-or-fake-photo/assets/fake/01`〜`05`と`expression-quiz/assets/faces/pattern-a`〜`c`(完成済みの本番画像)は再生成・上書きしない。

### 生成後の確認(完了条件)

1. `node real-or-fake-photo/test.js` と `node expression-quiz/test.js` が両方 `All tests passed`
2. 偽物鑑定ゲームは実写・偽物のペア30組を横並びで目視し、文字/透かし/破綻した形状/構図だけで見分けがつく極端な差がないことを確認する
3. 表情当てクイズは30枚をまとめて(コンタクトシートのように)目視し、絵柄の統一感・顔や手の破綻がないこと・性別の描き分けが指定通りであることを確認する
4. ホスト・ゲストの2タブで両ゲームを複数ラウンドプレイし、画像が読み込めること、出題中に正解のヒントになる情報(altテキストや出典)が表示されないことを確認する
5. コード(`logic.js`/`script.js`/`style.css`/`net.js`/`index.html`/`test.js`)は変更しない。画像ファイルの中身を差し替えるだけで完結するタスク
6. `git commit`はしない。作業が終わったら状況を報告するだけでよい(コミットはユーザー側で行う)
