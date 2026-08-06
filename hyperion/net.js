// net.js - ヒュペリオン: common/net-core.js の薄いラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'hyperion-ykobashi-' });
  window.HyperionNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
