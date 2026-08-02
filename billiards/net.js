// net.js - ビリヤード: common/net-core.js の薄いラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'billiards-ykobashi-' });
  window.BilliardsNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
