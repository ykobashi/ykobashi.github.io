// net.js - イントロ早押しクイズ: common/net-core.js のラッパー。
(function () {
  'use strict';
  const core = NetCore.create({ roomPrefix: 'song-intro-quiz-ykobashi-' });
  window.SongIntroQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom };
})();
