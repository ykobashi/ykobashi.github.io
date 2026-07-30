// common/net-core.js の薄いラッパー
(function () { 'use strict'; const core = NetCore.create({ roomPrefix: 'drawing-quiz-ykobashi-' }); window.DrawingQuizNet = { hostRoom: core.hostRoom, joinRoom: core.joinRoom }; })();
