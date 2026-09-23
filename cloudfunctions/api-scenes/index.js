'use strict';
/**
 * api-scenes · 红军长征叙事站 十幕数据读接口（Day 17）
 *
 * 链路：访客 → 云函数(本函数) → CloudBase 网关 exec-pgsql → PostgreSQL
 * 说明：免费体验版不支持云函数直连 PG（无内网地址），故走官方 HTTP 网关，
 *       鉴权用 Admin API Key（运行时从环境变量或同目录 .env 读取，绝不入库）。
 *
 * 响应契约（api-contract.md）：
 *   成功   200 { ok:true, data:[...], count, time, timeBeijing, source }
 *   错误   4xx/5xx { ok:false, error:"错误码", message:"人话说明" }
 *   错误码 METHOD_NOT_ALLOWED / INVALID_PARAM / DB_ERROR
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'red-army-story-d5gdwz8vn0d35dc0b';
const GATEWAY = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/exec-pgsql';
const MAX_LIMIT = 50;

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

/* ── 北京时间（服务器是 UTC，+8 后格式化） ── */
function toBeijingTime(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) +
    ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
}

/* ── 统一 JSON 响应三件套 + 跨域放行头 ── */
function jsonResponse(statusCode, payload, event) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
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

exports.main = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const now = new Date();

  /* 跨域预检 */
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  /* 只放行 GET */
  if (method !== 'GET') {
    return jsonResponse(405, {
      ok: false, error: 'METHOD_NOT_ALLOWED',
      message: '本接口只接受 GET 请求', time: now.toISOString(), timeBeijing: toBeijingTime(now)
    }, event);
  }

  /* 余力加练：?limit=N 返回条数限制（1~50，参数化查询防注入）
     注意：HTTP 访问服务把 query 放在 queryStringParameters（兼容 queryString），
     event.query 是 undefined——和 api-health 同款解析（Day 15 经验） */
  const q = event.queryStringParameters || event.queryString || {};
  let parameters = [];
  let sql = 'SELECT s.ch, s.order_no, s.name, s.glyph, s.style, s.kicker, s.title, ' +
    's.body, s.subtitle, s.finale, s.image, f.fact ' +
    'FROM scenes s LEFT JOIN scene_facts f ON f.scene_ch = s.ch ' +
    'ORDER BY s.order_no ASC';
  if (q.limit != null && q.limit !== '') {
    if (!/^\d+$/.test(q.limit) || +q.limit < 1 || +q.limit > MAX_LIMIT) {
      return jsonResponse(400, {
        ok: false, error: 'INVALID_PARAM',
        message: 'limit 必须是 1 到 ' + MAX_LIMIT + ' 的整数',
        time: now.toISOString(), timeBeijing: toBeijingTime(now)
      }, event);
    }
    sql += ' LIMIT $1';
    parameters = [+q.limit];
  }

  try {
    const rows = await execPgsql(sql, parameters);
    return jsonResponse(200, {
      ok: true,
      data: rows.map(rowToScene),
      count: rows.length,
      source: 'db',
      time: now.toISOString(),
      timeBeijing: toBeijingTime(now)
    }, event);
  } catch (e) {
    console.error('[api-scenes] query failed:', e.code, e.message);
    return jsonResponse(500, {
      ok: false, error: 'DB_ERROR',
      message: '数据库查询失败，请稍后重试',
      detail: e.code,
      time: now.toISOString(), timeBeijing: toBeijingTime(now)
    }, event);
  }
};
