(function () {
  'use strict';
  function describe(err) {
    if (err && err.type === 'peer-unavailable') return '部屋が見つかりません。コードを確認してください。';
    if (err && (err.type === 'network' || err.type === 'socket-error')) return 'ネットワークエラーが発生しました。通信環境をご確認ください。';
    if (err && err.type === 'unavailable-id') return '部屋を作れませんでした。もう一度お試しください。';
    if (err && err.type === 'timeout') return '接続がタイムアウトしました。同じWi-Fi内でも接続できないことがあります。';
    return '接続できませんでした。ルームコードや通信状態を確認してください。';
  }
  window.PeerErrors = { describe };
})();
