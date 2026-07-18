// 多人数ルーム接続。ホストが各参加者への通信を中継する。
(function () {
  'use strict';
  const ROOM_PREFIX = 'drawing-wolf-ykobashi-';
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const roomCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

  function hostRoom(handlers, attemptsLeft) {
    const retries = attemptsLeft === undefined ? 5 : attemptsLeft;
    const code = roomCode();
    const peer = new Peer(ROOM_PREFIX + code);
    const conns = new Map();
    peer.on('open', () => handlers.onCode(code));
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.set(conn.peer, conn); handlers.onPeerConnected(conn.peer); });
      conn.on('data', (data) => handlers.onPeerMessage(conn.peer, data));
      conn.on('close', () => { conns.delete(conn.peer); handlers.onPeerDisconnected(conn.peer); });
      conn.on('error', (err) => handlers.onError(err, conn.peer));
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && retries > 0) { peer.destroy(); hostRoom(handlers, retries - 1); return; }
      handlers.onError(err, null);
    });
    return {
      peer,
      broadcast(data) { conns.forEach((conn) => { if (conn.open) conn.send(data); }); },
      sendTo(id, data) { const conn = conns.get(id); if (conn && conn.open) conn.send(data); },
      peerIds() { return Array.from(conns.keys()); },
      destroy() { conns.forEach((conn) => { try { conn.close(); } catch (e) { /* noop */ } }); conns.clear(); peer.destroy(); },
    };
  }

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
    peer.on('error', (err) => handlers.onError(err));
    return peer;
  }
  window.DrawingWolfNet = { hostRoom, joinRoom };
})();
