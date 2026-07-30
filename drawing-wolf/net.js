// net.js - drawing-wolf: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'drawing-wolf-ykobashi-' });
  window.DrawingWolfNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
