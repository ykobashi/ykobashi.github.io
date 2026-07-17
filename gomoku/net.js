// net.js - PeerJS(WebRTC)を使ったオンライン対戦の接続管理。
// DOM操作は行わず、コールバック経由でscript.jsに状態を伝える。
// PeerJSは無料の公開シグナリングサーバー(0.peerjs.com)を利用する。
(function () {
  'use strict';

  const ROOM_PREFIX = 'gomoku-ykobashi-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい 0/O, 1/I は除外

  function randomRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function setupConnection(conn, handlers) {
    conn.on('open', () => handlers.onConnected(conn));
    conn.on('data', (data) => handlers.onMessage(data));
    conn.on('close', () => handlers.onDisconnected());
    conn.on('error', (err) => handlers.onError(err));
  }

  // 部屋を作る(ホスト側)。ランダムな6桁コードでPeerIDを確保し、確保できたらonCodeで通知する。
  // IDが衝突した場合(unavailable-id)は数回まで再試行する。
  function hostRoom(handlers, attemptsLeft) {
    if (attemptsLeft === undefined) attemptsLeft = 5;
    const code = randomRoomCode();
    const peer = new Peer(ROOM_PREFIX + code);

    peer.on('open', () => {
      handlers.onCode(code);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn, handlers);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attemptsLeft > 0) {
        peer.destroy();
        hostRoom(handlers, attemptsLeft - 1);
        return;
      }
      handlers.onError(err);
    });

    return peer;
  }

  // 部屋に参加する(ゲスト側)。コードを指定してホストのPeerIDに接続する。
  function joinRoom(code, handlers) {
    const peer = new Peer();

    peer.on('open', () => {
      const conn = peer.connect(ROOM_PREFIX + String(code).toUpperCase().trim(), { reliable: true });
      setupConnection(conn, handlers);
    });

    peer.on('error', (err) => {
      handlers.onError(err);
    });

    return peer;
  }

  window.GomokuNet = {
    hostRoom,
    joinRoom,
  };
})();
