const assert = require('assert');
const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const memoryScript = source('memory-match/script.js');
assert.match(memoryScript, /frontEl\.textContent = card\.symbol/);
assert.doesNotMatch(memoryScript, /card-face card-front[^;\n]*card\.symbol/);

const wikipediaScript = source('wikipedia-quiz/script.js');
assert.match(wikipediaScript, /L\.wikipediaSourceUrl\(String\(data\.correctTitle\)\)/);
assert.doesNotMatch(wikipediaScript, /resultSourceLinkEl\.href = data\.sourceUrl/);
assert.match(wikipediaScript, /resultSourceLinkEl\.removeAttribute\('href'\)/);
assert.match(source('wikipedia-quiz/index.html'), /rel="noopener noreferrer"/);

const nicknameScript = source('ai-nickname-game/script.js');
assert.match(nicknameScript, /CHARACTER_BANK\.some\(\(entry\) => entry\.image === image\)/);
assert.match(nicknameScript, /img\.removeAttribute\('src'\)/);

const netCoreScript = source('common/net-core.js');
assert.match(netCoreScript, /const MAX_GUESTS = 12/);
assert.match(netCoreScript, /conns\.size \+ pending\.size >= MAX_GUESTS/);
assert.match(netCoreScript, /pending\.clear\(\)/);

assert.match(source('word-wolf/script.js'), /Array\.isArray\(data\)\) return/);

const ngWordScript = source('ng-word-battle/script.js');
assert.match(ngWordScript, /currentPlayers\.some\(\(p\) => p\.id === catcherId\)/);
assert.match(ngWordScript, /currentPlayers\.some\(\(p\) => p\.id === targetId\)/);
assert.match(ngWordScript, /targetId === catcherId\) return false/);

[
  'insider-game/script.js',
  'ito-game/script.js',
  'ng-word-battle/script.js',
  'one-night-werewolf/script.js',
  'taboo-word-game/script.js',
  'tahoiya/script.js',
].forEach((file) => {
  assert.match(source(file), /String\(data\.name \|\| 'ゲスト'\)\.trim\(\)\.slice\(0, 10\) \|\| 'ゲスト'/);
});

['game-2048/script.js', 'snake-game/script.js'].forEach((file) => {
  const script = source(file);
  assert.match(script, /Number\.isFinite\(rawBest\) && rawBest >= 0 \? rawBest : 0/);
});

global.window = global;
require('./peer-errors.js');

assert.strictEqual(PeerErrors.describe({ type: 'peer-unavailable' }), '部屋が見つかりません。コードを確認してください。');
assert.strictEqual(PeerErrors.describe({ type: 'network' }), 'ネットワークエラーが発生しました。通信環境をご確認ください。');
assert.strictEqual(PeerErrors.describe({ type: 'socket-error' }), 'ネットワークエラーが発生しました。通信環境をご確認ください。');
assert.strictEqual(PeerErrors.describe({ type: 'unavailable-id' }), '部屋を作れませんでした。もう一度お試しください。');
assert.strictEqual(PeerErrors.describe({ type: 'timeout' }), '接続がタイムアウトしました。同じWi-Fi内でも接続できないことがあります。');
assert.strictEqual(PeerErrors.describe({ type: 'unknown' }), '接続できませんでした。ルームコードや通信状態を確認してください。');
assert.strictEqual(PeerErrors.describe(null), '接続できませんでした。ルームコードや通信状態を確認してください。');

const memory = new Map();
global.sessionStorage = {
  setItem(key, value) { memory.set(key, value); },
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  removeItem(key) { memory.delete(key); },
};
require('./rejoin-storage.js');
RejoinStorage.save('game', { roomCode: 'ABC123', token: 'token', name: 'name' });
assert.deepStrictEqual(RejoinStorage.load('game'), { roomCode: 'ABC123', token: 'token', name: 'name' });
RejoinStorage.clear('game');
assert.strictEqual(RejoinStorage.load('game'), null);
assert.match(RejoinStorage.newToken(), /^[a-z0-9-]+$/i);
sessionStorage.setItem('rejoin:broken', '{');
assert.strictEqual(RejoinStorage.load('broken'), null);

require('./ack-send.js');
let pending = 0;
let confirmed = 0;
let failed = 0;
let sent = 0;
const successfulAttempt = AckSend.attempt({
  send() { sent += 1; },
  onPending() { pending += 1; },
  onConfirmed() { confirmed += 1; },
  onFailed() { failed += 1; },
});
successfulAttempt.confirm();
successfulAttempt.confirm();
assert.deepStrictEqual({ pending, confirmed, failed, sent }, { pending: 1, confirmed: 1, failed: 0, sent: 1 });

AckSend.attempt({
  send() { throw new Error('send failed'); },
  onPending() { pending += 1; },
  onConfirmed() { confirmed += 1; },
  onFailed() { failed += 1; },
});
assert.deepStrictEqual({ pending, confirmed, failed, sent }, { pending: 2, confirmed: 1, failed: 1, sent: 1 });

let visibilityHandler = null;
let releaseCount = 0;
let resolveLock;
global.document = {
  visibilityState: 'visible',
  addEventListener(type, handler) { if (type === 'visibilitychange') visibilityHandler = handler; },
  removeEventListener(type, handler) { if (type === 'visibilitychange' && visibilityHandler === handler) visibilityHandler = null; },
};
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: {
    wakeLock: {
      request() {
        return new Promise((resolve) => { resolveLock = resolve; });
      },
    },
  },
});
require('./wake-lock.js');

(async () => {
  WakeLockHelper.enable();
  WakeLockHelper.disable();
  resolveLock({
    release() { releaseCount += 1; return Promise.resolve(); },
    addEventListener() {},
  });
  await Promise.resolve();
  assert.strictEqual(releaseCount, 1);
  assert.strictEqual(visibilityHandler, null);
  console.log('All tests passed');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
