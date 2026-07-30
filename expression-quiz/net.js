// net.js - expression-quiz: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'expression-quiz-ykobashi-' });
  window.ExpressionQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
