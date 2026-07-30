// net.js - picture-telephone: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'picture-telephone-ykobashi-' });
  window.PictureTelephoneNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
