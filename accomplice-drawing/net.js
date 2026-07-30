// net.js - accomplice-drawing: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'accomplice-drawing-ykobashi-' });
  window.AccompliceDrawingNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
