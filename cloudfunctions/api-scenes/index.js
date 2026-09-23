'use strict';
/**
 * api-scenes · 红军长征叙事站 十幕数据读接口（Day 17 主线，Day 19 拆出数据访问层）
 *
 * 链路：访客 → 云函数(本文件 = HTTP 层) → db.js(数据访问层) → CloudBase 网关 → PostgreSQL
 *
 * 本文件只负责：收请求、校验参数、调数据层、按契约包装响应。
 * 「查库 / 网关调用 / 行映射」等数据怎么来的逻辑，已拆到同目录 db.js（见 getScenes）。
 *
 * 响应契约（api-contract.md）：
 *   成功   200 { ok:true, data:[...], count, time, timeBeijing, source }
 *   错误   4xx/5xx { ok:false, error:"错误码", message:"人话说明" }
 *   错误码 METHOD_NOT_ALLOWED / INVALID_PARAM / DB_ERROR
 */

const MAX_LIMIT = 50;
const { getScenes } = require('./db');

/* ── 北京时间（服务器是 UTC，+8 后格式化） ── */
function toBeijingTime(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) +
    ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
}

/* ── 统一 JSON 响应三件套 + 跨域放行头 ── */
function jsonResponse(statusCode, payload) {
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
    });
  }

  /* 余力加练：?limit=N 返回条数限制（1~50，参数化查询防注入）
     注意：HTTP 访问服务把 query 放在 queryStringParameters（兼容 queryString），
     event.query 是 undefined——和 api-health 同款解析（Day 15 经验）。
     校验在 HTTP 层做；通过后再把整数交给数据层 getScenes。 */
  const q = event.queryStringParameters || event.queryString || {};
  let limit = null;
  if (q.limit != null && q.limit !== '') {
    if (!/^\d+$/.test(q.limit) || +q.limit < 1 || +q.limit > MAX_LIMIT) {
      return jsonResponse(400, {
        ok: false, error: 'INVALID_PARAM',
        message: 'limit 必须是 1 到 ' + MAX_LIMIT + ' 的整数',
        time: now.toISOString(), timeBeijing: toBeijingTime(now)
      });
    }
    limit = +q.limit;
  }

  try {
    const data = await getScenes(limit);
    return jsonResponse(200, {
      ok: true,
      data,
      count: data.length,
      source: 'db',
      time: now.toISOString(),
      timeBeijing: toBeijingTime(now)
    });
  } catch (e) {
    console.error('[api-scenes] query failed:', e.code, e.message);
    return jsonResponse(500, {
      ok: false, error: 'DB_ERROR',
      message: '数据库查询失败，请稍后重试',
      detail: e.code,
      time: now.toISOString(), timeBeijing: toBeijingTime(now)
    });
  }
};
