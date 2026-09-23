#!/usr/bin/env node
/*
 * tools/push.js — main ブランチを GitHub へ push する（nami-lab / scicos-lab 共用）
 *
 *   node tools/push.js            … このリポ（cwd の git root）を origin へ push
 *   node tools/push.js --repo scicos-lab --root D:/claude_projects/scicos-lab
 *
 * 認証: リポ限定の fine-grained PAT（token 名 nami-lab-push・Contents/Pages RW）。リポジトリには置かない。
 *   1) 環境変数 NAMI_GH_TOKEN
 *   2) 環境変数 NAMI_GH_CREDS が指すテキストファイル（「Token: github_pat_…」の行を含む）
 *   3) 既定のファイル（owner の OneDrive 上・git 管理外）
 * トークンは remote URL に埋めず、この1回の push だけ Authorization ヘッダで渡す（git config やログに残さない）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = opt('--repo', 'nami-lab');
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const BRANCH = opt('--branch', 'main');
const DEFAULT_CREDS = 'C:/Users/Yasuhiro/OneDrive/事業用フォルダ/claude_share/control/github-nami-lab-pat.txt';
const REMOTE = `https://github.com/Torao-cos/${REPO}.git`;

function loadToken() {
  if (process.env.NAMI_GH_TOKEN) return process.env.NAMI_GH_TOKEN;
  const file = process.env.NAMI_GH_CREDS || DEFAULT_CREDS;
  if (!fs.existsSync(file)) { console.error('✗ GitHub トークンが見つからない: ' + file); process.exit(2); }
  const m = /Token:\s*(github_pat_[A-Za-z0-9_]+)/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) { console.error('✗ トークンファイルの形式が想定と違う: ' + file); process.exit(2); }
  return m[1];
}
function git(a, extraEnv) { return spawnSync('git', a, { cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, extraEnv || {}) }); }
function main() {
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (dirty) { console.warn('！未コミットの変更があります（コミット済みの HEAD だけを push します）:\n' + dirty); }
  const remotes = spawnSync('git', ['remote'], { cwd: ROOT, encoding: 'utf8' }).stdout.split(/\s+/);
  if (remotes.indexOf('origin') < 0) git(['remote', 'add', 'origin', REMOTE]);
  const b64 = Buffer.from('x-access-token:' + loadToken()).toString('base64');
  // 認証ヘッダは環境変数 GIT_CONFIG_* 経由（コマンドラインにもログにも出ない）
  const r = git(['push', '-u', 'origin', BRANCH], {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + b64
  });
  if (r.status !== 0) { console.error('✗ push 失敗'); process.exit(r.status || 1); }
  console.log('✓ pushed ' + REPO + ' ' + BRANCH);
}
main();
