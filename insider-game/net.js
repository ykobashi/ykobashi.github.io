// net.js - insider-game: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'insidergame-ykobashi-' });
  window.InsiderGameNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
