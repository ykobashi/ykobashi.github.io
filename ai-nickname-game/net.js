// net.js - ai-nickname-game: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'ai-nickname-game-ykobashi-' });
  window.AiNicknameGameNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
