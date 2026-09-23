# api-contract.md · 红军长征叙事站 前后端接口契约

> 建立日期：2026-09-23（Day 15）　维护规则：每新增/修改一个接口，必须同步更新本文件，未写进契约的接口视为不存在。

## 一、环境信息

| 项 | 值 |
|---|---|
| 云环境 | 腾讯云开发 CloudBase · 免费体验版（3000 资源点/月，到期 2027-03-23） |
| 环境 ID | `red-army-story-d5gdwz8vn0d35dc0b` |
| 地域 | 上海（ap-shanghai） |
| 前端（静态托管） | `https://red-army-story-d5gdwz8vn0d35dc0b-1494694575.tcloudbaseapp.com/` |
| 后端（HTTP 访问服务） | `https://red-army-story-d5gdwz8vn0d35dc0b.service.tcloudbase.com` |
| 函数配置 | 仓库根目录 `cloudbaserc.json`；函数源码 `cloudfunctions/api-health/` |

※ 两个域名**不同源**：静态托管走 `tcloudbaseapp.com`，云函数走 `service.tcloudbase.com`。跨域问题由每个云函数在响应头里统一返回 `access-control-allow-origin: *` 解决（已在 api-health 落实，后续接口照抄）。
※ 测试域名首次打开会有 CloudBase 的「页面访问提示」页（约 1 秒倒计时后点「确定访问」），这是免费测试域名的固有行为；绑自有备案域名后消失。

## 二、全局约定（后续所有接口必须遵守）

1. **路径风格**：`/api/<资源>`，全小写，单词用中划线。
2. **响应格式**：一律 JSON（`content-type: application/json; charset=utf-8`），`cache-control: no-store`（探针/动态数据不缓存）。
3. **成功**：HTTP 200 + `{ "ok": true, "data": ... }`（数据一律装进 `data` 包裹层）。
   ※ **例外**：`/api/health` 是 Day 15 首个接口，返回为平铺字段（无 `data` 层），作为历史例外保留；**Day 16 起的新接口必须带 `data` 层**。
4. **客户端错误**（参数缺失/方法不对等）：HTTP 4xx + `{ "ok": false, "error": "错误码大写下划线", "message": "人话说明" }`。所有用到的错误码必须登记到「三、错误码清单」，未登记的错误码视为未定义行为。
5. **服务器错误**：HTTP 5xx + 同上结构。
6. **时间字段**：一律同时给 `time`（ISO 8601 UTC）与 `timeBeijing`（`YYYY-MM-DD HH:mm:ss` 北京时间）。
7. **鉴权**：Day 15 暂无；接入用户体系时另行补充本契约。
8. **变更纪律**：只加字段不改语义；要破坏性变更必须改版本号（`/api/v2/...`）并保留旧版至迁移完成。
9. **请求体**：当前全部为 GET（无请求体）；Day 16 起若出现 POST/PUT，请求体一律 `application/json; charset=utf-8`，且契约中必须写明每个字段的名称、类型、是否必填。

## 三、已上线接口

### GET /api/health（健康检查 · Day 15 上线）

- **用途**：探针。第一次部署后确认「后端活着、公网可达、打到的真是云端」；后续也用于前端启动时的连通性预检。
- **请求**：`GET /api/health`，无必填参数；可选 `?echo=<任意值>` 用于联调时确认参数回传。
- **OPTIONS**：预检请求，返回 204 + 跨域放行头。
- **其他方法**：405 + `METHOD_NOT_ALLOWED`。

**响应 200 示例**（实际返回，2026-09-23 17:22 验证；※ `request.path` 实测为 `/`——HTTP 访问服务回传的是转发路径，不含函数路由前缀，前端不要依赖此值做判断）：

```json
{
  "ok": true,
  "status": "healthy",
  "service": "api-health",
  "project": "red-army-story",
  "version": "1.0.0",
  "message": "后端接口已就绪，可以开始接真实数据了",
  "envId": "red-army-story-d5gdwz8vn0d35dc0b",
  "region": "ap-shanghai",
  "requestId": "53e54f9d-b730-11f1-9d03-525400f7d8a7",
  "functionName": "api-health",
  "time": "2026-09-23T09:22:41.950Z",
  "timeBeijing": "2026-09-23 17:22:41",
  "latencyMs": 1,
  "request": { "method": "GET", "path": "/", "query": {}, "userAgent": "curl/8.21.0" }
}
```

**字段说明**（含类型；※ 本接口返回为平铺结构，无 `data` 包裹层，见全局约定 3 的例外）：

| 字段 | 类型 | 含义 | 前端怎么用 |
|---|---|---|---|
| ok | boolean | 请求是否成功 | 一切判断的入口 |
| status | string | 服务状态，当前恒为 `healthy` | 展示用 |
| service / project | string | 接口名 / 项目标识 | 核对打没打错服务 |
| version | string | 接口版本号 | 展示在关于页/调试面板 |
| message | string | 人话说明 | 调试提示 |
| envId / region | string | 命中的云环境与地域 | 确认"打到的是云端不是我本机" |
| requestId | string \| null | 本次调用追踪 ID | 报错时上报它定位问题 |
| functionName | string | 云函数名 | 排查部署错位 |
| time | string | ISO 8601 UTC 时间 | 日志对时 |
| timeBeijing | string | 北京时间 `YYYY-MM-DD HH:mm:ss` | 展示 |
| latencyMs | number | 云函数内部处理耗时（毫秒） | 性能观测 |
| request | object | 回显的请求信息（子字段：method/path/query/userAgent） | 联调时核对参数（path 不可作业务判断） |
| echo | any | 仅当请求带 `?echo=` 时出现，原样回传 | 联调参数回传测试 |

**错误响应**：

- `OPTIONS` → 204，无响应体，仅跨域放行头；
- 非 GET 方法 → 405，响应体 `{ "ok": false, "error": "METHOD_NOT_ALLOWED", "message": "这个探针只接受 GET 请求，收到的是 <方法>" }`（响应头含 `allow: GET,OPTIONS`）。

## 四、错误码清单（全局登记处，新错误码先登记再使用）

| 错误码 | HTTP | 接口 | 含义 |
|---|---|---|---|
| `METHOD_NOT_ALLOWED` | 405 | /api/health（后续接口通用） | 使用了不支持的方法 |

## 五、计划中的接口（占位，Day 16-20 实现，实现前先在此登记）

> ※ 占位接口暂未写全五要素（路径/方法/参数/响应形状/错误形状），**实现当天必须补全**并挪入「三、已上线接口」，这是契约的硬性纪律。

| 接口 | 用途 | 对应前端现状 |
|---|---|---|
| `GET /api/scenes` | 十幕目录数据（含史实注摘要） | 替换 `index.html` 里的 `fetchScenes()` mock（Day 8 预留的数据接口位） |
| `GET /api/scenes/:ch` | 单幕完整详情 | 图卷卡片/叙事跳幕取数 |

## 六、变更记录

- 2026-09-23（Day 15）：建立契约；上线 `GET /api/health`；部署前端静态托管。
- 2026-09-23（Day 15 收尾自查）：修正 health 示例中 `request.path` 与实测不符的问题（`/api/health`→`/`）；字段表补类型列；补健康检查错误响应形状与错误码清单；全局约定补 `data` 包裹层例外说明与请求体约定。
