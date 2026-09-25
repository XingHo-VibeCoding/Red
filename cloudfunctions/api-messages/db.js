'use strict';
/**
 * db.js · 留言墙数据访问层（Day 22）
 *
 * 职责：只管「留言怎么存/取」，不含任何 HTTP / 路由 / 响应格式逻辑。
 * 上层（index.js = HTTP 层）负责收请求、校验参数、把本层结果包成契约响应。
 *
 * 链路：本层 → CloudBase 网关 exec-pgsql → PostgreSQL（免费体验版不支持云函数直连 PG，
 *       故走官方 HTTP 网关；鉴权用 Admin API Key，来自环境变量或同目录 .env，绝不入库）。
 *
 * 角色分工（经实测确认）：
 *   读（listMessages/getMessage）  不传 role → 网关默认只读角色（与 api-scenes 一致）
 *   写（create/update/softDelete） 传 role:'cloudbase_postgres' → 网关唯一可写角色
 *   注：网关允许角色仅 [cloudbase_postgres, cloudbase_read_only_user]，默认只读事务，
 *       故写操作必须显式带 cloudbase_postgres，否则报 read-only transaction。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'red-army-story-d5gdwz8vn0d35dc0b';
const GATEWAY = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/exec-pgsql';
const WRITE_ROLE = 'cloudbase_postgres';

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

/* ── 调 CloudBase 网关执行 SQL（role 可选：不传=只读默认角色；写操作传 cloudbase_postgres） ── */
function execPgsql(sql, parameters, role) {
  return new Promise((resolve, reject) => {
    const apiKey = loadApiKey();
    if (!apiKey) {
      const err = new Error('missing CLOUDBASE_API_KEY');
      err.code = 'NO_CREDENTIALS';
      return reject(err);
    }
    const body = JSON.stringify({ sql, parameters: parameters || [], role: role || undefined });
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

/* ── 增：创建留言（写） ── */
async function createMessage({ ch, content }) {
  const rows = await execPgsql(
    'INSERT INTO messages (ch, content) VALUES ($1, $2) ' +
    'RETURNING id, ch, content, is_deleted, created_at, updated_at',
    [ch || null, content], WRITE_ROLE);
  return rows[0];
}

/* ── 查：列表（读；默认只返回未软删的；includeDeleted 看全部用于恢复） ── */
async function listMessages({ ch, includeDeleted }) {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push('is_deleted=false');
  if (ch) { params.push(ch); where.push('ch=$' + params.length); }
  let sql = 'SELECT id, ch, content, is_deleted, created_at, updated_at FROM messages';
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  return execPgsql(sql, params); // 读：不传 role
}

/* ── 查：单条（读；用于存在性/软删状态校验） ── */
async function getMessage(id) {
  const rows = await execPgsql(
    'SELECT id, ch, content, is_deleted, created_at, updated_at FROM messages WHERE id=$1',
    [id]); // 读：不传 role
  return rows[0] || null;
}

/* ── 改：更新内容（写；未命中返回 null，由 HTTP 层转 404） ── */
async function updateMessage(id, content) {
  const rows = await execPgsql(
    'UPDATE messages SET content=$1, updated_at=now() WHERE id=$2 ' +
    'RETURNING id, ch, content, is_deleted, created_at, updated_at',
    [content, id], WRITE_ROLE);
  return rows[0] || null;
}

/* ── 删：软删除（写；is_deleted 置 true，查询自动跳过；删错可恢复） ── */
async function softDeleteMessage(id) {
  const rows = await execPgsql(
    'UPDATE messages SET is_deleted=true, updated_at=now() WHERE id=$1 RETURNING id',
    [id], WRITE_ROLE);
  return !!(rows && rows.length);
}

module.exports = { createMessage, listMessages, getMessage, updateMessage, softDeleteMessage };
