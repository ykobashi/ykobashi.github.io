// net.js - ito-game: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'ito-ykobashi-' });
  window.ItoNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
