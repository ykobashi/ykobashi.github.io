// 多人数ルーム接続。共通のPeerJSライブラリを使う。
(function () {
  'use strict';
  const ROOM_PREFIX = 'wordwolf-ykobashi-';
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const roomCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  function hostRoom(handlers, attemptsLeft) {
    const code = roomCode(); const peer = new Peer(ROOM_PREFIX + code); const conns = new Map();
    peer.on('open', () => handlers.onCode(code));
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.set(conn.peer, conn); handlers.onPeerConnected(conn.peer); });
      conn.on('data', (data) => handlers.onPeerMessage(conn.peer, data));
      conn.on('close', () => { conns.delete(conn.peer); handlers.onPeerDisconnected(conn.peer); });
      conn.on('error', (err) => handlers.onError(err, conn.peer));
    });
    peer.on('error', (err) => { if (err.type === 'unavailable-id' && (attemptsLeft === undefined || attemptsLeft > 0)) { peer.destroy(); hostRoom(handlers, (attemptsLeft === undefined ? 5 : attemptsLeft) - 1); } else handlers.onError(err); });
    return { peer, broadcast(data) { conns.forEach((c) => { if (c.open) c.send(data); }); }, sendTo(id, data) { const c = conns.get(id); if (c && c.open) c.send(data); }, destroy() { conns.forEach((c) => c.close()); peer.destroy(); } };
  }
  function joinRoom(code, handlers) {
    const peer = new Peer();
    peer.on('open', (id) => { if (handlers.onOwnId) handlers.onOwnId(id); const conn = peer.connect(ROOM_PREFIX + code.toUpperCase().trim(), { reliable: true }); conn.on('open', () => handlers.onConnected(conn)); conn.on('data', (data) => handlers.onMessage(data)); conn.on('close', () => handlers.onDisconnected()); conn.on('error', (err) => handlers.onError(err)); });
    peer.on('error', (err) => handlers.onError(err)); return peer;
  }
  window.WordWolfNet = { hostRoom, joinRoom };
})();
