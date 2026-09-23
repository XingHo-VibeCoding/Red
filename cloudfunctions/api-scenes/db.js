'use strict';
/**
 * db.js · 数据访问层（Day 19 从 api-scenes/index.js 拆出）
 *
 * 职责：只管「怎么从数据库拿到十幕数据」，不含任何 HTTP / 路由 / 响应格式逻辑。
 * 上层（index.js = HTTP 层）负责收请求、校验参数、把本层结果包成契约响应。
 *
 * 链路：本层 → CloudBase 网关 exec-pgsql → PostgreSQL（免费体验版不支持云函数直连 PG，
 *       故走官方 HTTP 网关；鉴权用 Admin API Key，来自环境变量或同目录 .env，绝不入库）。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'red-army-story-d5gdwz8vn0d35dc0b';
const GATEWAY = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/exec-pgsql';

/* ── API Key：优先环境变量，其次同目录 .env（该文件被 .gitignore 排除，不进仓库） ── */
function loadApiKey() {
  if (process.env.CLOUDBASE_API_KEY) return process.env.CLOUDBASE_API_KEY;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const m = raw.match(/^CLOUDBASE_API_KEY=(.+)\s*$/m);
    if (m) return m[1].trim();
  } catch (e) { /* .env 不存在则跳过 */ }
  return null;
}

/* ── 调 CloudBase 网关执行 SQL（只读角色，参数化查询防注入） ── */
function execPgsql(sql, parameters) {
  return new Promise((resolve, reject) => {
    const apiKey = loadApiKey();
    if (!apiKey) {
      const err = new Error('missing CLOUDBASE_API_KEY');
      err.code = 'NO_CREDENTIALS';
      return reject(err);
    }
    const body = JSON.stringify({ sql, parameters });
    const u = new URL(GATEWAY);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 8000
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch (e) { /* 保留原文 */ }
        if (res.statusCode === 200 && Array.isArray(parsed)) return resolve(parsed);
        const err = new Error((parsed && parsed.message) || ('gateway HTTP ' + res.statusCode));
        err.code = (parsed && parsed.code) || 'GATEWAY_' + res.statusCode;
        reject(err);
      });
    });
    req.on('timeout', () => req.destroy(new Error('gateway timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── 数据库行 → 前端 mock 同形状对象（字段核对结论见 api-contract.md Day 17 节） ── */
function rowToScene(r) {
  const item = {
    ch: r.ch,
    name: r.name,
    char: r.glyph,        // 对不上点 1：mock 叫 char，表里叫 glyph
    style: r.style,
    k: r.kicker
  };
  if (r.style === 'fine') {
    item.h2 = r.title;
    if (r.body != null) item.p = r.body;
  } else {
    item.b = r.title;
    if (r.subtitle != null) item.s = r.subtitle;
  }
  if (r.fact != null) item.fact = r.fact;   // 对不上点 2：fact 在另一张表，JOIN 而来
  return item;
}

/**
 * 取十幕数据（按 order_no 升序，含每幕史实注）。
 * @param {number|null|undefined} limit 可选，1~50 的整数；由 HTTP 层校验通过后传入，null/undefined 表示不限制。
 * @returns {Promise<Array>} 已映射成前端形状的幕数组
 */
async function getScenes(limit) {
  let sql = 'SELECT s.ch, s.order_no, s.name, s.glyph, s.style, s.kicker, s.title, ' +
    's.body, s.subtitle, s.finale, s.image, f.fact ' +
    'FROM scenes s LEFT JOIN scene_facts f ON f.scene_ch = s.ch ' +
    'ORDER BY s.order_no ASC';
  let parameters = [];
  if (limit != null && limit !== '') {
    sql += ' LIMIT $1';
    parameters = [+limit];
  }
  const rows = await execPgsql(sql, parameters);
  return rows.map(rowToScene);
}

module.exports = { getScenes };
