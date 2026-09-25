'use strict';
/**
 * api-messages · 红军长征叙事站 留言墙 CRUD 接口（Day 22）
 *
 * 链路：访客 → 云函数(本文件 = HTTP 层) → db.js(数据访问层) → CloudBase 网关 → PostgreSQL
 *
 * 本文件只负责：收请求、校验参数、调数据层、按契约包装响应。
 * 「查库 / 网关调用 / 软删除」等数据怎么来的逻辑，已拆到同目录 db.js。
 *
 * 路由（云函数部署在 /api/messages）：
 *   POST   /api/messages        创建留言（增）
 *   GET    /api/messages        列表（查；?ch=壹 过滤；?include_deleted=1 看全部）
 *   PATCH  /api/messages/:id    改内容（改）
 *   DELETE /api/messages/:id    软删除（删；is_deleted 置 true）
 *
 * 响应契约（api-contract.md §messages）：
 *   成功   200 { ok:true, data:[...]|单条, count?, time, timeBeijing, source }
 *   错误   4xx/5xx { ok:false, error:"错误码", message:"人话说明" }
 *   错误码 METHOD_NOT_ALLOWED / INVALID_PARAM / NOT_FOUND / DB_ERROR
 */

const MAX_CONTENT = 280;
const BASE = '/api/messages';
const { createMessage, listMessages, getMessage, updateMessage, softDeleteMessage } = require('./db');

/* ── 北京时间（服务器是 UTC，+8 后格式化） ── */
function toBeijingTime(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) +
    ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
}

/* ── 统一 JSON 响应三件套 + 跨域放行头（覆盖 GET/POST/PATCH/DELETE 四方法） ── */
function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PATCH, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

/* ── 解析请求体 JSON（失败返回 null，由上层判 400） ── */
function parseBody(event) {
  try { return event.body ? JSON.parse(event.body) : null; } catch (e) { return null; }
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PATCH, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  /* 查询参数先解析（id 块与后续各方法都要用） */
  const q = event.queryStringParameters || event.queryString || {};

  /* 解析资源 id：优先查询参数 ?id=（CloudBase HTTP 访问服务会把子路径 /2
     归一化为注册基路径 /api/messages，event.path 里拿不到 id，故用 ?id= 传）；
     保留路径 /api/messages/{id} 作为兜底写法 */
  let id = null;
  if (q.id != null && /^\d+$/.test(String(q.id))) {
    id = +q.id;
  } else {
    const p = (event.path || (event.requestContext && event.requestContext.path) || BASE);
    const sub = p.indexOf(BASE) === 0 ? p.slice(BASE.length) : '';
    if (sub && sub !== '/') {
      const m = sub.match(/^\/(\d+)\/?$/);
      if (!m) {
        return jsonResponse(404, {
          ok: false, error: 'NOT_FOUND',
          message: '路径不存在；留言接口形如 /api/messages 或 /api/messages?id={id}',
          time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      id = +m[1];
    }
  }

  try {
    /* ── 查：列表 ── */
    if (method === 'GET') {
      const data = await listMessages({
        ch: q.ch || null,
        includeDeleted: q.include_deleted === '1'
      });
      return jsonResponse(200, {
        ok: true, data, count: data.length, source: 'db',
        time: now.toISOString(), timeBeijing: toBeijingTime(now)
      });
    }

    /* ── 增：创建 ── */
    if (method === 'POST') {
      if (id !== null) {
        return jsonResponse(405, {
          ok: false, error: 'METHOD_NOT_ALLOWED',
          message: 'POST 只用于创建留言，不要带 id', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const body = parseBody(event);
      if (!body || typeof body.content !== 'string') {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: '缺少必填字段 content（留言内容，字符串）', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const content = body.content.trim();
      if (!content) {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: 'content 不能为空', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      if (content.length > MAX_CONTENT) {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: 'content 不能超过 ' + MAX_CONTENT + ' 字', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const chRaw = (typeof body.ch === 'string' && body.ch.trim()) ? body.ch.trim() : '';
      const ch = chRaw ? chRaw.slice(0, 10) : null;
      const row = await createMessage({ ch, content });
      return jsonResponse(200, { ok: true, data: row, time: now.toISOString(), timeBeijing: toBeijingTime(now) });
    }

    /* ── 改：更新内容 ── */
    if (method === 'PATCH') {
      if (id === null) {
        return jsonResponse(405, {
          ok: false, error: 'METHOD_NOT_ALLOWED',
          message: 'PATCH 需要指定留言 id：/api/messages/{id}', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const body = parseBody(event);
      if (!body || typeof body.content !== 'string') {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: '缺少必填字段 content（新内容，字符串）', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const content = body.content.trim();
      if (!content) {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: 'content 不能为空', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      if (content.length > MAX_CONTENT) {
        return jsonResponse(400, {
          ok: false, error: 'INVALID_PARAM',
          message: 'content 不能超过 ' + MAX_CONTENT + ' 字', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const exist = await getMessage(id);
      if (!exist || exist.is_deleted) {
        return jsonResponse(404, {
          ok: false, error: 'NOT_FOUND',
          message: '该留言不存在或已删除', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const row = await updateMessage(id, content);
      return jsonResponse(200, { ok: true, data: row, time: now.toISOString(), timeBeijing: toBeijingTime(now) });
    }

    /* ── 删：软删除 ── */
    if (method === 'DELETE') {
      if (id === null) {
        return jsonResponse(405, {
          ok: false, error: 'METHOD_NOT_ALLOWED',
          message: 'DELETE 需要指定留言 id：/api/messages/{id}', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      const exist = await getMessage(id);
      if (!exist || exist.is_deleted) {
        return jsonResponse(404, {
          ok: false, error: 'NOT_FOUND',
          message: '该留言不存在或已删除', time: now.toISOString(), timeBeijing: toBeijingTime(now)
        });
      }
      await softDeleteMessage(id);
      return jsonResponse(200, {
        ok: true, data: { id, deleted: true },
        time: now.toISOString(), timeBeijing: toBeijingTime(now)
      });
    }

    /* ── 其余方法 ── */
    return jsonResponse(405, {
      ok: false, error: 'METHOD_NOT_ALLOWED',
      message: '本接口只接受 GET / POST / PATCH / DELETE', time: now.toISOString(), timeBeijing: toBeijingTime(now)
    });
  } catch (e) {
    console.error('[api-messages] failed:', e.code, e.message);
    return jsonResponse(500, {
      ok: false, error: 'DB_ERROR',
      message: '数据库操作失败，请稍后重试',
      detail: e.code,
      time: now.toISOString(), timeBeijing: toBeijingTime(now)
    });
  }
};
