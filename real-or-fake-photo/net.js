// net.js - real-or-fake-photo: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'real-or-fake-photo-ykobashi-' });
  window.RealOrFakePhotoNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
