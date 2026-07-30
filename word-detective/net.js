// net.js - word-detective: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'worddetective-ykobashi-' });
  window.WordDetectiveNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
