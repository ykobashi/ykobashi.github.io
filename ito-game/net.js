// net.js - PeerJS(WebRTC)を使ったオンライン接続管理(3人以上対応のスター型)。
// ホストが複数のゲスト接続を保持して中継し、ゲスト同士は直接つながらない。
// DOM操作は行わず、コールバック経由でscript.jsに状態を伝える。
// PeerJSは無料の公開シグナリングサーバー(0.peerjs.com)を利用する。
(function () {
  'use strict';

  const ROOM_PREFIX = 'ito-ykobashi-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい 0/O, 1/I は除外

  function randomRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  // 部屋を作る(ホスト側)。ランダムな6桁コードでPeerIDを確保し、確保できたらonCodeで通知する。
  // 複数ゲストからの接続を受け付け、broadcast/sendToで配信できるコントローラーを返す。
  function hostRoom(handlers, attemptsLeft) {
    if (attemptsLeft === undefined) attemptsLeft = 5;
    const code = randomRoomCode();
    const peer = new Peer(ROOM_PREFIX + code);
    const conns = new Map(); // peerId(conn.peer) -> DataConnection

    peer.on('open', () => {
      handlers.onCode(code);
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conns.set(conn.peer, conn);
        handlers.onPeerConnected(conn.peer);
      });
      conn.on('data', (data) => {
        handlers.onPeerMessage(conn.peer, data);
      });
      conn.on('close', () => {
        conns.delete(conn.peer);
        handlers.onPeerDisconnected(conn.peer);
      });
      conn.on('error', (err) => {
        handlers.onError(err, conn.peer);
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attemptsLeft > 0) {
        peer.destroy();
        hostRoom(handlers, attemptsLeft - 1);
        return;
      }
      handlers.onError(err, null);
    });

    return {
      peer,
      broadcast(data) {
        conns.forEach((c) => {
          if (c.open) c.send(data);
        });
      },
      sendTo(peerId, data) {
        const c = conns.get(peerId);
        if (c && c.open) c.send(data);
      },
      peerIds() {
        return Array.from(conns.keys());
      },
      destroy() {
        conns.forEach((c) => {
          try { c.close(); } catch (err) { /* noop */ }
        });
        conns.clear();
        try { peer.destroy(); } catch (err) { /* noop */ }
      },
    };
  }

  // 部屋に参加する(ゲスト側)。コードを指定してホストのPeerIDに接続する。
  // 自分自身のPeerID確定時にonOwnIdで通知する(ゲスト同士の識別に使う)。
  function joinRoom(code, handlers) {
    const peer = new Peer();

    peer.on('open', (id) => {
      if (handlers.onOwnId) handlers.onOwnId(id);
      const conn = peer.connect(ROOM_PREFIX + String(code).toUpperCase().trim(), { reliable: true });
      conn.on('open', () => handlers.onConnected(conn));
      conn.on('data', (data) => handlers.onMessage(data));
      conn.on('close', () => handlers.onDisconnected());
      conn.on('error', (err) => handlers.onError(err));
    });

    peer.on('error', (err) => {
      handlers.onError(err);
    });

    return peer;
  }

  window.ItoNet = {
    hostRoom,
    joinRoom,
  };
})();
