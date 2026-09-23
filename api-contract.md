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
3. **成功**：HTTP 200 + `{ "ok": true, "data": ... }`。
4. **客户端错误**（参数缺失/方法不对等）：HTTP 4xx + `{ "ok": false, "error": "错误码大写下划线", "message": "人话说明" }`。
5. **服务器错误**：HTTP 5xx + 同上结构。
6. **时间字段**：一律同时给 `time`（ISO 8601 UTC）与 `timeBeijing`（`YYYY-MM-DD HH:mm:ss` 北京时间）。
7. **鉴权**：Day 15 暂无；接入用户体系时另行补充本契约。
8. **变更纪律**：只加字段不改语义；要破坏性变更必须改版本号（`/api/v2/...`）并保留旧版至迁移完成。

## 三、已上线接口

### GET /api/health（健康检查 · Day 15 上线）

- **用途**：探针。第一次部署后确认「后端活着、公网可达、打到的真是云端」；后续也用于前端启动时的连通性预检。
- **请求**：`GET /api/health`，无必填参数；可选 `?echo=<任意值>` 用于联调时确认参数回传。
- **OPTIONS**：预检请求，返回 204 + 跨域放行头。
- **其他方法**：405 + `METHOD_NOT_ALLOWED`。

**响应 200 示例**（实际返回，2026-09-23 17:22 验证）：

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
  "request": { "method": "GET", "path": "/api/health", "query": {}, "userAgent": "curl/8.21.0" },
  "echo": "（仅在请求带 ?echo= 时出现）"
}
```

**字段说明**：

| 字段 | 含义 | 前端怎么用 |
|---|---|---|
| ok | 请求是否成功 | 一切判断的入口 |
| status / version | 服务状态与接口版本 | 展示在关于页/调试面板 |
| envId / region | 命中的云环境 | 确认"打到的是云端不是我本机" |
| requestId | 本次调用追踪 ID | 报错时上报它定位问题 |
| latencyMs | 云函数内部处理耗时 | 性能观测 |
| request | 回显的请求信息 | 联调时核对参数 |

## 四、计划中的接口（占位，Day 16-20 实现，实现前先在此登记）

| 接口 | 用途 | 对应前端现状 |
|---|---|---|
| `GET /api/scenes` | 十幕目录数据（含史实注摘要） | 替换 `index.html` 里的 `fetchScenes()` mock（Day 8 预留的数据接口位） |
| `GET /api/scenes/:ch` | 单幕完整详情 | 图卷卡片/叙事跳幕取数 |

## 五、变更记录

- 2026-09-23（Day 15）：建立契约；上线 `GET /api/health`；部署前端静态托管。
