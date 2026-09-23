-- ============================================================
-- schema.sql · 红军长征叙事站 数据库结构（Day 16）
-- 数据库：CloudBase 免费体验版 · PostgreSQL 17
-- 设计原则：
--   1. 两张表 = 页面上"会变的数据"的完整拆分：
--      scenes      十幕主体（一行 = 一幕）
--      scene_facts 史实注（一行 = 一条史实注，Day 11 加入前端的 fact 字段）
--   2. 两表靠 scene_facts.scene_ch 关联 → scenes.ch（外键）：
--      一个幕可以挂多条史实注（1:N），删幕时史实注跟着删（ON DELETE CASCADE）
--   3. 幂等：CREATE TABLE IF NOT EXISTS，本文件重复执行不报错
--   4. 正文含少量渲染标记（<em>/<br>），按原样存 text，由前端渲染
-- ============================================================

-- 表 1：scenes 十幕主体
CREATE TABLE IF NOT EXISTS scenes (
  ch         text        PRIMARY KEY,                -- 幕号（壹~拾），前端跳幕/关联都用它
  order_no   smallint    NOT NULL UNIQUE,            -- 排序号 0~9（中文数字无法 ORDER BY，单独给一列）
  name       text        NOT NULL,                   -- 幕名：围 / 出发 / 湘江 ...
  glyph      text        NOT NULL,                   -- 题字单字：围 / 别 / 血 ...
  style      text        NOT NULL CHECK (style IN ('fine','bold')),  -- 标题风格（细体叙事 / 粗体金句）
  kicker     text        NOT NULL,                   -- 引言行：时间地点（一九三四年 · 秋）
  title      text        NOT NULL,                   -- 大标题（h2 或金句 b）
  body       text,                                   -- 正文段落（fine 幕有，bold 幕为 NULL）
  subtitle   text,                                   -- 副行（bold 幕有，fine 幕为 NULL）
  finale     text,                                   -- 结尾寄语（仅拾幕有）
  image      text        NOT NULL,                   -- 插画素材相对路径
  created_at timestamptz NOT NULL DEFAULT now()      -- 行创建时间
);

-- 表 2：scene_facts 史实注
CREATE TABLE IF NOT EXISTS scene_facts (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 自增主键，技术 ID
  scene_ch   text        NOT NULL REFERENCES scenes(ch) ON DELETE CASCADE,  -- ★ 关联字段：指向 scenes.ch
  fact       text        NOT NULL,                   -- 史实注正文
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 外键列建索引：按幕查史实注、按幕删史实注都要走这个索引
CREATE INDEX IF NOT EXISTS idx_scene_facts_scene_ch ON scene_facts(scene_ch);
