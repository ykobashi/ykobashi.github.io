// net.js - word-wolf: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'wordwolf-ykobashi-' });
  window.WordWolfNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
