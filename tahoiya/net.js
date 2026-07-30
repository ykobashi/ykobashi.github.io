// net.js - tahoiya: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'tahoiya-ykobashi-' });
  window.TahoiyaNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
