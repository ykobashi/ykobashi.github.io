#!/usr/bin/env node
// collect-candidates.js
//
// これは手動キュレーション用のオフラインツールです。ゲーム本体(index.html/script.js)
// からは一切呼ばれません。ユーザーが自分のYouTube Data APIキーで手元実行し、出力された
// candidates-<genre>.json を目視レビュー(文字が大きすぎるサムネ・曲違いなどを除外)して
// から ../data.js の VIDEO_BANK へ手動で追記してください。
//
// 使い方:
//   YOUTUBE_API_KEY=xxxx node collect-candidates.js --genre=vocaloid --query="ボカロ 人気曲" --max=50
//   node collect-candidates.js --genre=anime --query="アニソン OP" --key=xxxx --max=50
//
// quotaについて: search.list は1回100ユニット消費(無料枠は1日10,000ユニット)。
// --max のデフォルトは50件(=1回の呼び出しで収まる想定)。大きく集めたい時だけ明示的に増やすこと。

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DECADE_BUCKETS = [
  { decade: '1990s', from: 1990, to: 1999 },
  { decade: '2000s', from: 2000, to: 2009 },
  { decade: '2010s', from: 2010, to: 2019 },
  { decade: '2020s', from: 2020, to: 2029 },
];

function parseArgs(argv) {
  const args = { max: 50 };
  argv.forEach((raw) => {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

function decadeFromPublishedAt(publishedAt) {
  const year = new Date(publishedAt).getFullYear();
  const bucket = DECADE_BUCKETS.find((b) => year >= b.from && year <= b.to);
  return bucket ? bucket.decade : null;
}

async function searchPage(apiKey, query, pageToken) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', apiKey);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error('YouTube Data API エラー (HTTP ' + res.status + '): ' + body);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.key || process.env.YOUTUBE_API_KEY;
  const genre = args.genre;
  const query = args.query;
  const max = Number(args.max) || 50;

  if (!apiKey || !genre || !query) {
    console.log('使い方: YOUTUBE_API_KEY=xxxx node collect-candidates.js --genre=<vocaloid|anime|jpop> --query="検索語" [--max=50] [--key=xxxx]');
    process.exit(1);
    return;
  }

  const results = [];
  let pageToken;
  let callCount = 0;

  while (results.length < max) {
    const page = await searchPage(apiKey, query, pageToken);
    callCount += 1;
    console.log('search.list呼び出し ' + callCount + '回目 (推定消費: ' + (callCount * 100) + ' / 10000 ユニット)');

    (page.items || []).forEach((item) => {
      if (!item.id || !item.id.videoId) return;
      const decade = decadeFromPublishedAt(item.snippet.publishedAt);
      results.push({
        videoId: item.id.videoId,
        title: item.snippet.title,
        genre,
        decade,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
      });
    });

    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  const trimmed = results.slice(0, max);
  const outPath = path.join(__dirname, 'candidates-' + genre + '.json');
  fs.writeFileSync(outPath, JSON.stringify(trimmed, null, 2) + '\n', 'utf8');

  console.log(trimmed.length + '件を ' + outPath + ' に書き出しました。');
  console.log('サムネの文字量・曲違いなどを目視確認し、良いものだけ ../data.js の VIDEO_BANK に手動で追記してください。');
  console.log('(decadeがnullの場合は publishedAt から年代を判定できなかったので手動で補ってください)');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
