# api-contract.md · 红军长征叙事站 前后端接口契约

> 建立日期：2026-09-23（Day 15）　维护规则：每新增/修改一个接口，必须同步更新本文件，未写进契约的接口视为不存在。

## 一、环境信息

| 项             | 值                                                                        |
| ------------- | ------------------------------------------------------------------------ |
| 云环境           | 腾讯云开发 CloudBase · 免费体验版（3000 资源点/月，到期 2027-03-23）                        |
| 环境 ID         | `red-army-story-d5gdwz8vn0d35dc0b`                                       |
| 地域            | 上海（ap-shanghai）                                                          |
| 前端（静态托管）      | `https://red-army-story-d5gdwz8vn0d35dc0b-1494694575.tcloudbaseapp.com/` |
| 后端（HTTP 访问服务） | `https://red-army-story-d5gdwz8vn0d35dc0b.service.tcloudbase.com`        |
| 函数配置          | 仓库根目录 `cloudbaserc.json`；函数源码 `cloudfunctions/api-health/`               |

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

| 字段               | 含义        | 前端怎么用           |
| ---------------- | --------- | --------------- |
| ok               | 请求是否成功    | 一切判断的入口         |
| status / version | 服务状态与接口版本 | 展示在关于页/调试面板     |
| envId / region   | 命中的云环境    | 确认"打到的是云端不是我本机" |
| requestId        | 本次调用追踪 ID | 报错时上报它定位问题      |
| latencyMs        | 云函数内部处理耗时 | 性能观测            |
| request          | 回显的请求信息   | 联调时核对参数         |

### GET /api/scenes（十幕数据读接口 · Day 17 上线）

- **用途**：返回十幕全部数据（含史实注），是前端 `fetchScenes()` mock 的真身。前端启动后叙事视图与图卷目录共用这一份数据。
- **请求**：`GET /api/scenes`，无必填参数；可选 `?limit=N`（1~50 的整数，返回前 N 幕，参数化 SQL 防注入）。
- **OPTIONS**：预检请求，返回 204 + 跨域放行头。
- **其他方法**：405 + `METHOD_NOT_ALLOWED`。
- **实现说明**：免费体验版不支持云函数直连 PG（无内网地址、公网开关不可用），故云函数经 CloudBase HTTP 网关 `exec-pgsql` 以只读角色执行参数化 SQL；Admin API Key 存于云函数 `.env`（gitignore 排除，不入仓库）。数据库侧已 `GRANT SELECT` 授权只读角色。

**响应 200 示例**（2026-09-23 公网验证）：

```json
{
  "ok": true,
  "data": [
    {
      "ch": "壹", "name": "围", "char": "围", "style": "fine",
      "k": "一九三四年 · 秋",
      "h2": "堡垒，圈到了门口",
      "p": "堡垒一步步向前修，……<em>留下来，是死；走出去，未必活。</em>",
      "fact": "1933年9月起，第五次反「围剿」……"
    }
  ],
  "count": 10,
  "source": "db",
  "time": "2026-09-23T12:24:21.560Z",
  "timeBeijing": "2026-09-23 20:24:21"
}
```

**字段说明与「mock vs 表」核对结论**（Day 17 掌握点：接口返回和表对不上的地方）：

| 接口字段 | 数据库来源 | 对不上点与处理 |
|---|---|---|
| ch / name / style / k | scenes.ch / name / style / kicker | 名字一致，直接映射 |
| char | scenes.**glyph** | ★ 对不上点 1：mock 叫 char，表叫 glyph，接口层改名对齐 mock |
| h2 / p（fine 幕） | scenes.title / body | mock 按 style 分字段名：fine 用 h2/p，bold 用 b/s；body 为 NULL 的字段在响应里直接省略 |
| b / s（bold 幕） | scenes.title / subtitle | 同上 |
| fact | **scene_facts.fact**（JOIN 而来） | ★ 对不上点 2：史实注不在主表，靠 scene_facts.scene_ch → scenes.ch 关联查得 |
| （无） | scenes.order_no / finale / image / created_at | order_no 只用于排序不外发；finale/image 前端另行处理；created_at 不外发 |

**错误响应**：`?limit=abc` → 400 `INVALID_PARAM`；网关/数据库故障 → 500 `DB_ERROR`（detail 带网关错误码）。

**真库验证记录（2026-09-23）**：UPDATE 壹幕 title → 接口刷新即返回新标题 → 还原后恢复。数据来自数据库实时查询，非写死。

## 四、计划中的接口（占位，Day 18-20 实现，实现前先在此登记）

| 接口                    | 用途             | 对应前端现状                                                  |
| --------------------- | -------------- | ------------------------------------------------------- |
| `GET /api/scenes/:ch` | 单幕完整详情         | 图卷卡片/叙事跳幕取数                                             |

## 五、变更记录

- 2026-09-23（Day 15）：建立契约；上线 `GET /api/health`；部署前端静态托管。
- 2026-09-23（Day 17）：`GET /api/scenes` 从占位转正并上线（含 `?limit` 加练参数）；新增错误码 `INVALID_PARAM`、`DB_ERROR`；登记 mock vs 表两处字段对不上点（char/glyph、fact 走 JOIN）。
