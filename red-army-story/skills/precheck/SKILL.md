---
name: precheck
description: 发布前检查清单与可执行脚本。当需要部署上线、交付验收、发布新版本前把关时使用；一条命令跑完资产/密钥/公网/接口四类检查，故意弄坏任意一项都能被查出，不虚报通过。
---

# precheck · 发布前检查 Skill

## 何时用

- 每次执行 `tcb hosting deploy` / `tcb fn deploy` **之前**，或对外交付演示之前。
- 判别信号：要说"发布 / 上线 / 交付 / 给别人看"时，先跑一遍。

## 用法（一条命令）

```bash
node red-army-story/skills/precheck/check.js            # 全量（本地 + 公网 + 接口）
node red-army-story/skills/precheck/check.js --offline  # 只查本地项（资产/密钥）
```

退出码 0 = 全部通过；1 = 有 FAIL，禁止发布。零依赖，任何装了 Node ≥18 的机器可跑。

## 检查项清单（check.js 逐项执行）

| # | 检查项 | 判定标准 |
|---|--------|----------|
| 1 | **本地资产** | index.html 引用的每个 `assets/*.png` 都真实存在（引用存在但文件丢失 = FAIL） |
| 2 | **密钥红线** | git 跟踪文件 0 密钥特征词（password/secret/JWT 头/postgres:///PRIVATE KEY/sk-）；`.env` 未被跟踪且被 .gitignore 忽略 |
| 3 | **公网首页** | HTTP 200，含 `msgWall`、`photo-layer` 关键标记 |
| 4 | **后端 health** | `/api/health` HTTP 200 且 ok:true |
| 5 | **接口 scenes** | `/api/scenes` HTTP 200、返回 10 幕、带 CORS 头 |
| 6 | **接口 messages** | GET 200 ok:true；错误路径（PUT）返回**中文**提示而非英文堆栈 |

## 为什么可信：故意弄坏验证法

一个检查项只有至少经历过一次「故意弄坏 → 被查出来」，才有资格出现在上表里，否则它可能是永远绿灯的摆设。做法：

1. 挑一项，人为破坏（例：把 `assets/scene4-zunyi.png` 临时改名）。
2. 跑 check.js → 该项必须 FAIL、退出码 1。
3. 恢复 → 重跑必须全绿。

**已做的弄坏验证（调用记录里留痕）**：资产完整性项——改名 scene4-zunyi.png 被当场查出缺失；密钥项——Day 23 全仓库深扫已验证特征词检测真实工作（当时靠它逮住文档里误写的特征词字面量）。

## 调用记录（每次真实运行追加一行）

- 2026-09-25（Day 25）｜故意破坏跑：改名 assets/scene4-zunyi.png → check.js 查出「本地资产 FAIL，缺失 assets/scene4-zunyi.png」，退出码 1 ✅
- 2026-09-25（Day 25）｜恢复后跑：6/6 全 PASS，退出码 0 ✅
