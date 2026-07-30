// net.js - dictionary-quiz: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'dictionary-quiz-ykobashi-' });
  window.DictionaryQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
