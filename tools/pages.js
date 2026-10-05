#!/usr/bin/env node
/* tools/pages.js — GitHub Pages を main ブランチ / ルートで有効化し、公開URLを表示する
 *   node tools/pages.js [--repo nami-lab] [--check]
 *   --check … GET のみ（未作成でも POST しない）
 * 認証は tools/push.js と同じ PAT（Pages: Read and write）。トークンは出力しない。
 *   1) 環境変数 NAMI_GH_TOKEN
 *   2) company 共通ローダーの GITHUB_PAT_NAMI_LAB（環境変数 → D:/claude_projects/company/.env）
 *      ローダーの場所は env COMPANY_SECRETS_LOADER で上書き可。旧 claude_share/control の平文ファイルは 2026-10-05 に廃止。 */
'use strict';
const args = process.argv.slice(2);
const REPO = (i => (i >= 0 ? args[i + 1] : 'nami-lab'))(args.indexOf('--repo'));
const CHECK = args.includes('--check');
const LOADER = process.env.COMPANY_SECRETS_LOADER || 'D:/claude_projects/company/tools/load-secrets.js';
let token;
try { token = process.env.NAMI_GH_TOKEN || require(LOADER).getSecret('GITHUB_PAT_NAMI_LAB'); }
catch (e) { console.error('✗ GitHub トークンを読めない（loader: ' + LOADER + '）: ' + e.message); process.exit(2); }
const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nami-lab-tools' };
const API = `https://api.github.com/repos/Torao-cos/${REPO}/pages`;
(async () => {
  let r = await fetch(API, { headers: H });
  if (r.status === 404 && !CHECK) {
    r = await fetch(API, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } }) });
    console.log('create pages:', r.status);
    r = await fetch(API, { headers: H });
  }
  const j = await r.json();
  console.log(JSON.stringify({ status: r.status, html_url: j.html_url, source: j.source, build_type: j.build_type, https_enforced: j.https_enforced }));
})().catch(e => { console.error(e.message); process.exit(1); });
