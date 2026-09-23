#!/usr/bin/env node
/* tools/pages.js — GitHub Pages を main ブランチ / ルートで有効化し、公開URLを表示する
 *   node tools/pages.js [--repo nami-lab]
 * 認証は tools/push.js と同じ PAT ファイル（Pages: Read and write）。トークンは出力しない。 */
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const REPO = (i => (i >= 0 ? args[i + 1] : 'nami-lab'))(args.indexOf('--repo'));
const CREDS = process.env.NAMI_GH_CREDS || 'C:/Users/Yasuhiro/OneDrive/事業用フォルダ/claude_share/control/github-nami-lab-pat.txt';
const m = /Token:\s*(github_pat_[A-Za-z0-9_]+)/.exec(fs.readFileSync(CREDS, 'utf8'));
if (!m) { console.error('token not found'); process.exit(2); }
const H = { Authorization: 'Bearer ' + m[1], Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nami-lab-tools' };
const API = `https://api.github.com/repos/Torao-cos/${REPO}/pages`;
(async () => {
  let r = await fetch(API, { headers: H });
  if (r.status === 404) {
    r = await fetch(API, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } }) });
    console.log('create pages:', r.status);
    r = await fetch(API, { headers: H });
  }
  const j = await r.json();
  console.log(JSON.stringify({ status: r.status, html_url: j.html_url, source: j.source, build_type: j.build_type, https_enforced: j.https_enforced }));
})().catch(e => { console.error(e.message); process.exit(1); });
