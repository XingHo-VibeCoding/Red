#!/usr/bin/env node
/**
 * red-army-story 发布前检查 Skill（可复用脚本）
 * 用法: node check.js [--offline]      --offline 跳过公网/接口检查，只查本地
 * 退出码: 0 = 全部通过, 1 = 有 FAIL（可直接接入 CI 或手动把关）
 * 零依赖：只用 Node 内置模块，node --version >= 18 即可。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
/* git 仓库根 = 从 ROOT 向上找含 .git 的目录（.gitignore 在仓库根） */
const GITROOT = (() => {
  let d = ROOT;
  while (d !== path.parse(d).root) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    d = path.dirname(d);
  }
  return ROOT;
})();
const SITE = 'https://red-army-story-d5gdwz8vn0d35dc0b-1494694575.tcloudbaseapp.com/index.html';
const API = 'https://red-army-story-d5gdwz8vn0d35dc0b.service.tcloudbase.com';
const SECRET_PATTERNS = ['password', 'secret', 'eyJhbGci', 'postgres://', 'PRIVATE KEY', 'sk-'];

const results = [];
function rec(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name.padEnd(14, '　') + '- ' + detail);
}
function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 20000,
    }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}
const GIT = (() => {
  const candidates = ['git', 'C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files\\Git\\bin\\git.exe'];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  return 'git';
})();
function git(args) {
  const r = spawnSync(GIT, args, { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}
/* 按 .gitignore 简单规则扫描工作区（git 不可用时的退化路径）。
   返回 { files:[命中的文件], envNotIgnored:[未被忽略的 .env], envAllIgnored:bool } */
function scanWorkspace(root, ignoreRules, patterns) {
  const SKIP_TOP = new Set(['.git', 'node_modules', '.workbuddy']);
  const files = [], envs = [];
  const isIgnored = f => {
    const rel = path.relative(root, f).replace(/\\/g, '/').toLowerCase();
    return ignoreRules.some(rule =>
      rel === rule || rel.split('/').includes(rule) ||
      rel.split('/').some(seg => seg === rule || seg.endsWith(rule)));
  };
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && SKIP_TOP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (full === __filename) continue;                    // 排除扫描器自身（内含特征词数组）
      if (e.isDirectory()) { if (!isIgnored(full)) walk(full); continue; }
      if (isIgnored(full)) { if (e.name.toLowerCase().endsWith('.env')) continue; continue; }
      if (e.name.toLowerCase().endsWith('.env')) { envs.push(path.relative(root, full)); continue; }
      let head;
      try { const fd = fs.openSync(full, 'r'); head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0); fs.closeSync(fd); } catch (err) { continue; }
      if (head.includes(0)) continue;                       // 二进制跳过
      let text; try { text = fs.readFileSync(full, 'utf8'); } catch (err) { continue; }
      const low = text.toLowerCase();
      if (patterns.some(p => low.includes(p))) files.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  })(root);
  return { files, envNotIgnored: [], envAllIgnored: envs.every(f => ignoreRules.some(r => f.toLowerCase().endsWith(r) || f.toLowerCase().split('/').includes(r))) };
}

async function main() {
  const offline = process.argv.includes('--offline');
  console.log('red-army-story 发布前检查 @ ' + new Date().toLocaleString('zh-CN'));
  console.log('='.repeat(64));

  /* 1. 本地资产完整性：index.html 引用的每个 assets 文件都必须存在 */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...new Set([...html.matchAll(/assets\/([A-Za-z0-9_-]+\.png)/g)].map(m => m[0]))];
  const missing = refs.filter(f => !fs.existsSync(path.join(ROOT, f)));
  rec('本地资产', missing.length === 0,
    refs.length + ' 个引用' + (missing.length ? '，缺失: ' + missing.join(', ') : '，全部存在'));

  /* 2. 密钥红线：跟踪文件 0 密钥特征词；.env 未被跟踪且被忽略 */
  const grep = git(['grep', '-ilI', ...SECRET_PATTERNS.flatMap(p => ['-e', p])]);
  let hits = [], envTracked = [], ignored = null, mode = 'git grep';
  if (grep.status === 0) hits = grep.stdout.trim().split('\n').filter(Boolean);
  ignored = git(['check-ignore', 'cloudfunctions/api-messages/.env']).status === 0 ? true : null;
  const envList = git(['ls-files']).stdout.split('\n').filter(f => f.trim().endsWith('.env'));
  if (envList.length || ignored === null) {
    /* git 不可用（如沙箱禁 spawn git）→ 退化为按 .gitignore 规则扫描工作区 */
    mode = '工作区扫描（git 不可用退化）';
    const ign = fs.readFileSync(path.join(GITROOT, '.gitignore'), 'utf8').split(/\r?\n/)
      .map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => s.replace(/\/$/, '').toLowerCase());
    const hits2 = scanWorkspace(ROOT, ign, SECRET_PATTERNS);
    hits = hits2.files; envTracked = hits2.envNotIgnored; ignored = hits2.envAllIgnored;
  }
  rec('密钥红线', hits.length === 0 && envTracked.length === 0 && ignored === true,
    '[' + mode + '] 特征词命中 ' + hits.length + ' 处' + (hits.length ? '（' + hits.join(', ') + '）' : '') +
    '；未被忽略的 .env ' + envTracked.length + ' 个；.gitignore ' + (ignored === true ? '生效' : '未生效'));

  /* 3. 公网首页 */
  if (!offline) {
    try {
      const home = await get(SITE);
      const ok = home.status === 200 && home.body.includes('msgWall') && home.body.includes('photo-layer');
      rec('公网首页', ok, 'HTTP ' + home.status + '，' + home.body.length + ' 字节，关键标记 ' +
        (home.body.includes('msgWall') ? 'msgWall√' : 'msgWall×') + ' ' +
        (home.body.includes('photo-layer') ? 'photo-layer√' : 'photo-layer×'));
    } catch (e) { rec('公网首页', false, '请求失败: ' + e.message); }

    /* 4. 后端 health */
    try {
      const h = await get(API + '/api/health');
      const flat = h.body.replace(/\s+/g, '');
      rec('后端 health', h.status === 200 && flat.includes('"ok":true'), 'HTTP ' + h.status + ' ' + flat.slice(0, 60));
    } catch (e) { rec('后端 health', false, '请求失败: ' + e.message); }

    /* 5. /api/scenes：200 + 10 幕 + CORS 头 */
    try {
      const s = await get(API + '/api/scenes');
      let n = -1; try { n = JSON.parse(s.body).data.length; } catch (e) {}
      rec('接口 scenes', s.status === 200 && n === 10 && !!s.headers['access-control-allow-origin'],
        'HTTP ' + hstatus(s.status) + '，返回 ' + n + ' 幕，CORS 头 ' + (s.headers['access-control-allow-origin'] ? '有' : '无'));
    } catch (e) { rec('接口 scenes', false, '请求失败: ' + e.message); }

    /* 6. /api/messages：GET 200 + 错误路径返回中文 */
    try {
      const m = await get(API + '/api/messages');
      const bad = await get(API + '/api/messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      let zh = ''; try { zh = JSON.parse(bad.body).message || ''; } catch (e) {}
      const isZh = /[\u4e00-\u9fa5]/.test(zh);
      rec('接口 messages', m.status === 200 && JSON.parse(m.body).ok === true && isZh,
        'GET HTTP ' + m.status + ' ok=true；错误路径(PUT)返回' + (isZh ? '中文「' + zh + '」' : '非中文: ' + zh));
    } catch (e) { rec('接口 messages', false, '请求失败: ' + e.message); }
  }

  const passN = results.filter(Boolean).length;
  console.log('='.repeat(64));
  console.log('结果: ' + passN + '/' + results.length + ' 通过' + (passN === results.length ? '，可以发布' : '，禁止发布（先修 FAIL 项）'));
  process.exitCode = passN === results.length ? 0 : 1;
}
function hstatus(s) { return s; }
main();
