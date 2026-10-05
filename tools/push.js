#!/usr/bin/env node
/*
 * tools/push.js — main ブランチを GitHub へ push する（nami-lab / scicos-lab 共用）
 *
 *   node tools/push.js            … このリポ（cwd の git root）を origin へ push
 *   node tools/push.js --repo scicos-lab --root D:/claude_projects/scicos-lab
 *   node tools/push.js --check [--repo scicos-lab]   … トークン解決＋ git ls-remote（読み取りのみ・push しない）
 *
 * 認証: リポ限定の fine-grained PAT（token 名 nami-lab-push・Contents/Pages RW）。リポジトリには置かない。
 *   1) 環境変数 NAMI_GH_TOKEN
 *   2) company 共通ローダーの GITHUB_PAT_NAMI_LAB（環境変数 → D:/claude_projects/company/.env）
 *      ローダーの場所は env COMPANY_SECRETS_LOADER で上書き可。旧 claude_share/control の平文ファイルは 2026-10-05 に廃止。
 * トークンは remote URL に埋めず、この1回の push だけ Authorization ヘッダで渡す（git config やログに残さない）。
 */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = opt('--repo', 'nami-lab');
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const BRANCH = opt('--branch', 'main');
const REMOTE = `https://github.com/Torao-cos/${REPO}.git`;
const LOADER = process.env.COMPANY_SECRETS_LOADER || 'D:/claude_projects/company/tools/load-secrets.js';

function loadToken() {
  if (process.env.NAMI_GH_TOKEN) return process.env.NAMI_GH_TOKEN;
  try {
    return require(LOADER).getSecret('GITHUB_PAT_NAMI_LAB');
  } catch (e) {
    console.error('✗ GitHub トークンを読めない（loader: ' + LOADER + '）: ' + e.message);
    process.exit(2);
  }
}
function git(a, extraEnv) { return spawnSync('git', a, { cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, extraEnv || {}) }); }
function authEnv() {
  const b64 = Buffer.from('x-access-token:' + loadToken()).toString('base64');
  // 認証ヘッダは環境変数 GIT_CONFIG_* 経由（コマンドラインにもログにも出ない）
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + b64
  };
}
function main() {
  if (args.includes('--check')) {
    const r = git(['ls-remote', '--heads', REMOTE], authEnv());
    if (r.status !== 0) { console.error('✗ ls-remote 失敗'); process.exit(r.status || 1); }
    console.log('✓ 認証OK（読み取りのみ）: ' + REPO);
    return;
  }
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (dirty) { console.warn('！未コミットの変更があります（コミット済みの HEAD だけを push します）:\n' + dirty); }
  const remotes = spawnSync('git', ['remote'], { cwd: ROOT, encoding: 'utf8' }).stdout.split(/\s+/);
  if (remotes.indexOf('origin') < 0) git(['remote', 'add', 'origin', REMOTE]);
  const r = git(['push', '-u', 'origin', BRANCH], authEnv());
  if (r.status !== 0) { console.error('✗ push 失敗'); process.exit(r.status || 1); }
  console.log('✓ pushed ' + REPO + ' ' + BRANCH);
}
main();
