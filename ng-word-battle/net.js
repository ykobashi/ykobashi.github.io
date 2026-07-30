// net.js - ng-word-battle: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'ngwordbattle-ykobashi-' });
  window.NgWordBattleNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
