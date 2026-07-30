// net.js - taboo-word-game: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'tabooword-ykobashi-' });
  window.TabooWordNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
