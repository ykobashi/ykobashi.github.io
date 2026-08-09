// net.js - photo-memory-bingo: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'photo-memory-bingo-ykobashi-' });
  window.PhotoMemoryBingoNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
