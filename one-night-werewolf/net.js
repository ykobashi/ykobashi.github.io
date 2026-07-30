// net.js - one-night-werewolf: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'werewolf-ykobashi-' });
  window.WerewolfNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
