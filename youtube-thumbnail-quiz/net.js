// net.js - youtube-thumbnail-quiz: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'youtube-thumbnail-quiz-ykobashi-' });
  window.YoutubeThumbnailQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
