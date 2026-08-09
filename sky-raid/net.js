// net.js - スカイレイド: common/net-core.js の薄いラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'sky-raid-ykobashi-' });
  window.SkyRaidNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
