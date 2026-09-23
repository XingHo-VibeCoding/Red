'use strict';

/**
 * 云函数：api-health
 * 作用：给整个网站提供一个「后端活着吗」的探针接口。
 * 访问方式：HTTP 访问服务 → GET /api/health
 *
 * 这是 Day 15 的产物：站点第一次有了公网后端。
 * Day 16–20 的真实业务接口（幕目录、史实注等）都会照这个骨架长出来。
 */

// ── 小工具：把时间格式化成「北京时间」可读串（服务器默认是 UTC，差 8 小时）
function toBeijingTime(date) {
  const t = new Date(date.getTime() + 8 * 60 * 60 * 1000); // UTC+8
  const pad = (n) => String(n).padStart(2, '0');
  return (
    t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) +
    ' ' + pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ':' + pad(t.getUTCSeconds())
  );
}

// ── 小工具：统一打包响应（HTTP 访问服务要求返回 statusCode + headers + body 三件套）
function jsonResponse(statusCode, data, extraHeaders) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store', // 探针类接口不缓存，每次都真打一次
        'access-control-allow-origin': '*' // 让任何域名的前端都能调（Day 16 起前端要用到）
      },
      extraHeaders || {}
    ),
    // 注意：body 必须是字符串，对象要先 JSON.stringify
    body: JSON.stringify(data, null, 2)
  };
}

/**
 * 入口函数。
 * - event：本次请求的所有信息（方法、路径、请求头、query、body……）
 * - context：本次调用的运行环境信息（函数名、内存、请求 id……）
 * 返回什么，前端就收到什么。
 */
exports.main = async (event, context) => {
  const startedAt = Date.now(); // 记下开始时间，用来算这次调用耗时

  // HTTP 访问服务把请求信息放在 event 里；字段名兼容大小写两种风格
  const httpMethod = (event.httpMethod || event.requestContext?.httpMethod || 'GET').toUpperCase();
  const path = event.path || event.requestContext?.path || '/api/health';
  const query = event.queryStringParameters || event.queryString || {};
  const headers = event.headers || {};

  // ① 预检请求（浏览器跨域调用前会先问一句能不能调）——直接放行
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'content-type'
      },
      body: ''
    };
  }

  // ② 只接受 GET：其他方法明确拒绝，别让前端猜
  if (httpMethod !== 'GET') {
    return jsonResponse(405, {
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
      message: '这个探针只接受 GET 请求，收到的是 ' + httpMethod
    }, { allow: 'GET,OPTIONS' });
  }

  // ③ 正常回话：告诉调用方「我还活着，这些是我的身份信息」
  const payload = {
    ok: true,
    status: 'healthy',
    service: 'api-health',
    project: 'red-army-story', // 红军长征叙事站
    version: '1.0.0',
    message: '后端接口已就绪，可以开始接真实数据了',

    // 运行环境（用来验证请求真的打到了腾讯云那一台，而不是本机）
    envId: process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'unknown',
    region: process.env.TCB_REGION || process.env.SCF_REGION || 'ap-shanghai',
    requestId: context?.request_id || context?.requestId || null,
    functionName: context?.function_name || context?.functionName || 'api-health',

    // 时间信息（北京时间 + 标准时间）
    time: new Date().toISOString(),
    timeBeijing: toBeijingTime(new Date()),

    // 回应问题：本次调用花了多久
    latencyMs: Date.now() - startedAt,

    // 回显请求信息，方便前端调试（echo=1 时也回来）
    request: {
      method: httpMethod,
      path: path,
      query: query,
      userAgent: headers['user-agent'] || headers['User-Agent'] || null
    }
  };

  // ④ 支持 ?echo=xxx：前端联调时用来确认参数有没有传到位
  if (query && query.echo !== undefined) {
    payload.echo = query.echo;
  }

  return jsonResponse(200, payload);
};
