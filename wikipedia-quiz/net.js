// net.js - wikipedia-quiz: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'wikipedia-quiz-ykobashi-' });
  window.WikipediaQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
