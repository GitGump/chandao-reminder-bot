# 迭代需求群消息自动通知系统

基于发版日历的自动化消息推送平台，通过集成云之家群机器人，实现迭代需求相关提醒消息的自动推送。

## 功能概览

- **发版日历** — 导入/管理发版日历，自动关联迭代计划
- **机器人配置** — 配置云之家群机器人 Webhook 地址
- **消息模板** — 自定义三种消息类型（规划会提醒 / 进度更新 / 发版后通知），支持占位符变量
- **推送时间** — 设定各类型消息的定时推送时刻
- **@成员管理** — 按消息类型配置需要 @ 的群成员
- **推送日志** — 完整记录每次推送状态，支持失败重试

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + TypeScript + Tailwind CSS |
| 后端 | Next.js API Routes |
| 数据库 | SQLite (本地) / Supabase PostgreSQL (生产) |
| 定时任务 | 独立 node-cron Worker 进程 |
| 消息推送 | 云之家群机器人 Webhook API |

## 快速开始

### 环境要求

- Node.js >= 18
- npm / pnpm / bun

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.local` 并填入实际值：

```bash
cp .env.local .env.local  # 已存在则直接编辑
```

关键变量说明：

| 变量 | 说明 |
|------|------|
| `API_KEY` / `NEXT_PUBLIC_API_KEY` | 管理接口认证密钥 |
| `TRIGGER_KEY` | 定时触发接口认证密钥 |
| `WEBHOOK_URL` | 云之家群机器人 Webhook 地址 |
| `ZENTAO_BASE_URL` | 禅道服务地址 |
| `API_BASE` | Worker 调用 API 的基础地址（默认 `http://localhost:3000`） |

### 初始化数据库

```bash
npm run seed
```

> 首次运行会自动创建 SQLite 数据库、导入发版日历 CSV、插入默认配置。

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`。

### 启动定时推送 Worker（独立进程）

```bash
npm run worker
```

Worker 会根据 `push_time_config` 中的配置，在指定时间自动通过 `/api/trigger` 触发消息推送。

## 项目结构

```
src/
├── app/
│   ├── api/              # API Routes
│   │   ├── calendar/     # 发版日历 CRUD + CSV 导入
│   │   ├── robot/        # 机器人配置 CRUD + Webhook 测试
│   │   ├── templates/    # 消息模板 CRUD
│   │   ├── push-time/    # 推送时间配置
│   │   ├── members/      # @成员管理
│   │   ├── push-logs/    # 推送日志 + 重试
│   │   ├── push-now/     # 手动立即推送
│   │   ├── trigger/      # Worker 定时触发入口
│   │   └── ...
│   ├── page.tsx          # 管理后台首页
│   └── layout.tsx
├── components/           # React 组件
│   ├── CalendarPanel.tsx
│   ├── RobotPanel.tsx
│   ├── TemplatePanel.tsx
│   ├── PushTimePanel.tsx
│   ├── MembersPanel.tsx
│   └── PushLogsPanel.tsx
├── lib/
│   ├── supabase.ts       # SQLite / Supabase 兼容层
│   └── api-client.ts     # 前端 API 客户端
└── worker/
    └── index.ts          # Cron Worker 进程
data/
└── local.db              # SQLite 数据库（Git 忽略）
scripts/
└── seed.ts               # 数据库初始化与种子数据
```

## 消息类型

| 类型 | 说明 | 典型触发时机 |
|------|------|-------------|
| 规划会提醒 | 通知 PM 提前整理需求 | 规划会日期前 2 天 |
| 进度更新 | 提醒更新迭代需求状态 | 迭代进行期间 |
| 发版后通知 | 提醒关闭已完成需求 | 发版日当天 |

## 占位符变量

消息模板支持以下占位符，推送时自动替换：

| 占位符 | 示例 | 说明 |
|--------|------|------|
| `{发版日日期}` | 0721 | 当前迭代发版日 |
| `{规划会日期}` | 0709 | 迭代规划会日期 |
| `{发版日日期+N}` | 0723 | 发版日偏移 |
| `{规划会日期-2}` | 0707 | 规划会日期偏移 |
| `{禅道编号}` | 352 | 当前禅道执行编号 |
| `{禅道编号+N}` | 354 | 编号偏移 |

## 部署模式

### 本地模式（默认）

无需外部数据库，零配置启动。数据存储在 `data/local.db`（SQLite）。

### 生产模式

配置 Supabase 环境变量后，系统自动切换至 PostgreSQL，支持多实例部署与团队协作。

## 常见命令

```bash
npm run dev          # 启动开发服务器
npm run worker       # 启动定时推送 Worker
npm run seed         # 初始化数据库（导入日历 + 默认配置）
npm run build        # 生产构建
npm run test         # 运行测试
npm run lint         # 代码检查
```

## 认证

管理类 API 使用 `x-api-key` Header 认证，触发类接口使用 `x-trigger-key` Header。密钥通过环境变量 `API_KEY` 和 `TRIGGER_KEY` 配置。
