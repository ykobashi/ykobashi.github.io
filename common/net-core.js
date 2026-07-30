// PeerJS(WebRTC)を使うスター型通信の共通基盤。
(function () {
  'use strict';

  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const HEARTBEAT_INTERVAL_MS = 5000;
  const HEARTBEAT_TIMEOUT_MS = 12000;
  const MAX_GUESTS = 12;

  function randomRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  function safeCall(fn) {
    if (typeof fn === 'function') fn.apply(null, Array.prototype.slice.call(arguments, 1));
  }

  function isControl(data, kind) {
    return data && typeof data === 'object' && data.__netcore === kind;
  }

  function createHeartbeat(conn, onHealthChange, onError) {
    let lastPongAt = Date.now();
    let healthy = true;
    let stopped = false;

    function setHealthy(next) {
      if (healthy === next) return;
      healthy = next;
      safeCall(onHealthChange, next);
    }

    const timer = setInterval(() => {
      if (stopped || !conn.open) return;
      try {
        conn.send({ __netcore: 'ping' });
        if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) setHealthy(false);
      } catch (err) {
        safeCall(onError, err);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return {
      handle(data) {
        if (isControl(data, 'ping')) {
          try { if (conn.open) conn.send({ __netcore: 'pong' }); } catch (err) { safeCall(onError, err); }
          return true;
        }
        if (isControl(data, 'pong')) {
          lastPongAt = Date.now();
          setHealthy(true);
          return true;
        }
        return false;
      },
      stop() {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  function enableSignalingReconnect(peer, handlers, peerId) {
    peer.on('disconnected', () => {
      if (peer.destroyed) return;
      // signaling の再登録だけを行う。切れた DataConnection 自体は復元されない。
      if (!peer.destroyed) {
        try { peer.reconnect(); } catch (err) { safeCall(handlers.onError, err, peerId); }
      }
    });
  }

  function create(options) {
    const roomPrefix = options && options.roomPrefix;
    if (!roomPrefix) throw new Error('roomPrefix is required');

    function hostRoom(handlers, attemptsLeft) {
      handlers = handlers || {};
      if (attemptsLeft === undefined) attemptsLeft = 5;
      const conns = new Map();
      const heartbeats = new Map();
      const pending = new Set();
      let peer = null;
      let destroyed = false;

      function removeConnection(peerId, conn, notify) {
        // 同じPeer IDで新しい接続が既に確立済みなら、古いcloseイベントでは消さない。
        if (conns.get(peerId) !== conn) return;
        const heartbeat = heartbeats.get(peerId);
        if (heartbeat) heartbeat.stop();
        heartbeats.delete(peerId);
        conns.delete(peerId);
        if (notify) safeCall(handlers.onPeerDisconnected, peerId);
      }

      function start(remaining) {
        const code = randomRoomCode();
        peer = new Peer(roomPrefix + code);
        controller.peer = peer;
        enableSignalingReconnect(peer, handlers, null);

        peer.on('open', () => safeCall(handlers.onCode, code));
        peer.on('connection', (conn) => {
          if (conns.size + pending.size >= MAX_GUESTS) {
            conn.close();
            return;
          }
          pending.add(conn);
          conn.on('open', () => {
            pending.delete(conn);
            const previousHeartbeat = heartbeats.get(conn.peer);
            if (previousHeartbeat) previousHeartbeat.stop();
            conns.set(conn.peer, conn);
            const heartbeat = createHeartbeat(
              conn,
              (healthy) => safeCall(handlers.onConnectionHealthChange, conn.peer, healthy),
              (err) => safeCall(handlers.onError, err, conn.peer)
            );
            heartbeats.set(conn.peer, heartbeat);
            safeCall(handlers.onPeerConnected, conn.peer);
          });
          conn.on('data', (data) => {
            const heartbeat = heartbeats.get(conn.peer);
            if (heartbeat && heartbeat.handle(data)) return;
            safeCall(handlers.onPeerMessage, conn.peer, data);
          });
          conn.on('close', () => {
            pending.delete(conn);
            removeConnection(conn.peer, conn, true);
          });
          conn.on('error', (err) => {
            pending.delete(conn);
            safeCall(handlers.onError, err, conn.peer);
          });
        });
        peer.on('error', (err) => {
          if (err && err.type === 'unavailable-id' && remaining > 0 && !destroyed) {
            try { peer.destroy(); } catch (ignore) { /* noop */ }
            start(remaining - 1);
            return;
          }
          safeCall(handlers.onError, err, null);
        });
      }

      const controller = {
        peer: null,
        broadcast(data) {
          conns.forEach((conn) => {
            if (!conn.open) return;
            try { conn.send(data); } catch (err) { safeCall(handlers.onError, err, conn.peer); }
          });
        },
        sendTo(peerId, data) {
          const conn = conns.get(peerId);
          if (!conn || !conn.open) return;
          try { conn.send(data); } catch (err) { safeCall(handlers.onError, err, peerId); }
        },
        peerIds() { return Array.from(conns.keys()); },
        destroy() {
          destroyed = true;
          heartbeats.forEach((heartbeat) => heartbeat.stop());
          heartbeats.clear();
          conns.forEach((conn) => { try { conn.close(); } catch (ignore) { /* noop */ } });
          conns.clear();
          pending.clear();
          if (peer) { try { peer.destroy(); } catch (ignore) { /* noop */ } }
        },
      };

      start(attemptsLeft);
      return controller;
    }

    function joinRoom(code, handlers) {
      handlers = handlers || {};
      const peer = new Peer();
      let conn = null;
      let heartbeat = null;
      let closed = false;

      enableSignalingReconnect(peer, handlers);
      peer.on('open', (id) => {
        safeCall(handlers.onOwnId, id);
        conn = peer.connect(roomPrefix + String(code).toUpperCase().trim(), { reliable: true });
        conn.on('open', () => {
          heartbeat = createHeartbeat(
            conn,
            (healthy) => safeCall(handlers.onConnectionHealthChange, healthy),
            (err) => safeCall(handlers.onError, err)
          );
          safeCall(handlers.onConnected, conn);
        });
        conn.on('data', (data) => {
          if (heartbeat && heartbeat.handle(data)) return;
          safeCall(handlers.onMessage, data);
        });
        conn.on('close', () => {
          if (heartbeat) heartbeat.stop();
          heartbeat = null;
          if (!closed) safeCall(handlers.onDisconnected);
        });
        conn.on('error', (err) => safeCall(handlers.onError, err));
      });
      peer.on('error', (err) => safeCall(handlers.onError, err));

      const originalDestroy = peer.destroy.bind(peer);
      peer.destroy = function () {
        closed = true;
        if (heartbeat) heartbeat.stop();
        heartbeat = null;
        if (conn) { try { conn.close(); } catch (ignore) { /* noop */ } }
        return originalDestroy();
      };
      return peer;
    }

    return { hostRoom, joinRoom };
  }

  window.NetCore = { create };
})();
