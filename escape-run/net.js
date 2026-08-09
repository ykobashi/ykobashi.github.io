// net.js - 協力エスケープラン: common/net-core.js の薄いラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'escape-run-ykobashi-' });
  window.EscapeRunNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
