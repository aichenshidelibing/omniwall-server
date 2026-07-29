# OmniWall Server

OmniWall Server 是 **OmniWall（万象图墙）** 的服务器部署版，面向 VPS、NAS、宝塔 Docker、1Panel、CasaOS、Portainer 等环境，提供：

```txt
Node.js 20 + Express + SQLite + Docker Compose
```

它把原 Cloudflare Workers + D1 单文件项目迁移为可在普通服务器上一键运行的版本：页面、图片 API、管理后台、安全机制和通知能力基本保持一致，数据库从 Cloudflare D1 替换为本地 SQLite。

> 如果你只是想在服务器上部署 OmniWall，请优先看本 README 和 [`docs/SERVER_DEPLOY.md`](docs/SERVER_DEPLOY.md)。`omniwall.txt` 保留为 Worker 兼容源文件，也是服务器版生成 `src/worker.mjs` 的来源。

---

## 快速开始（推荐）

### 1. 克隆项目

```bash
git clone https://github.com/aichenshidelibing/omniwall-server.git
cd omniwall-server
```

### 2. 运行交互安装脚本

```bash
chmod +x install.sh
./install.sh
```

安装脚本会用中文向导引导你配置：

- 管理员用户名和 32 位以上强密码
- Docker 端口绑定，例如 `3000`、`127.0.0.1:3000`、`0.0.0.0:3000`
- 直接端口 demo 模式或生产 HTTPS 反向代理模式
- `TRUST_PROXY` 安全选项
- `PUBLIC_BASE_URL`
- Unsplash / Pexels / Pixabay API Key
- 站点名称、站点图标
- `/api/bg` 签名密钥
- Cloudflare Turnstile
- OpenAI Moderation / 自定义翻译 API
- 是否立即构建启动和初始化数据库

安装成功后，脚本会在终端打印部署信息卡，包括：

- 站点地址
- 文档地址
- 当前后台后缀
- 后台登录地址
- 管理员用户名
- 管理员密码
- 端口绑定
- 数据库路径
- HTTPS 和后台入口轮换提醒

请立即保存其中的管理员密码和后台入口。

---

## 手动部署

如果不使用安装脚本，也可以手动配置：

```bash
cp .env.example .env
# 编辑 .env，至少设置 ADMIN_PASSWORD
# 可选配置 UNSPLASH_ACCESS_KEY / PEXELS_API_KEY / PIXABAY_API_KEY
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f omniwall
```

初始化数据库：

```bash
curl -H "Authorization: Bearer 你的ADMIN_PASSWORD" http://127.0.0.1:3000/api/d1/init
```

完整部署指南见：[`docs/SERVER_DEPLOY.md`](docs/SERVER_DEPLOY.md)。

---

## 访问地址

本地或局域网 demo：

```txt
http://服务器IP:3000/
http://服务器IP:3000/docs
http://服务器IP:3000/{ADMIN_USERNAME}/login
```

生产环境建议放在 HTTPS 反向代理后面：

```txt
https://你的域名/
https://你的域名/docs
https://你的域名/{当前后台后缀}/login
```

> 生产后台登录和 `/api/bg` Cookie 功能必须使用 HTTPS，因为项目兼容 Worker 的 Cookie 逻辑会设置 `Secure`。

---

## 推荐生产配置

反向代理生产模式建议：

```env
OMNIWALL_PORT_BINDING=127.0.0.1:3000
TRUST_PROXY=true
PUBLIC_BASE_URL=https://你的域名
```

直接端口 demo 模式建议：

```env
OMNIWALL_PORT_BINDING=3000
TRUST_PROXY=false
```

只有当 OmniWall 位于你控制的可信 HTTPS 反向代理后面，并且外部用户不能直连容器端口时，才应设置：

```env
TRUST_PROXY=true
```

否则请保持默认：

```env
TRUST_PROXY=false
```

---

## 主要功能

### 图片 API

支持多图源随机图片跳转和 JSON 元数据返回：

- Unsplash
- Pexels
- Pixabay
- Bing 每日壁纸

常用接口：

| 路径 | 说明 |
|---|---|
| `/api/random` | 新版随机图片 API |
| `/random` | 兼容旧随机图片接口 |
| `/?query=nature` | 兼容旧 query 用法 |
| `/api/daily` | 每日精选接口 |
| `/api/bg` | 首页内部背景接口，不建议公开调用 |

常用参数：

| 参数 | 示例 | 说明 |
|---|---|---|
| `source` | `source=unsplash` | 指定图源：`unsplash` / `pexels` / `pixabay` / `bing` |
| `query` | `query=nature` | 搜索关键词，支持中文自动翻译 |
| `orientation` | `orientation=landscape` | 图片方向：`landscape` / `portrait` / `squarish` |
| `preset` | `preset=desktop-nature` | 使用预设模板 |
| `info` | `info=true` | 返回 JSON 元数据 |
| `reload` | `reload=true` | 强制刷新当前缓存 |
| `quality` | `quality=high` | 图片质量偏好：`fast` / `balanced` / `high` |

示例：

```txt
/api/random
/api/random?orientation=landscape
/api/random?query=nature
/api/random?query=猫&info=true
/api/random?source=pexels&orientation=portrait
/api/random?preset=desktop-nature
/api/random?query=city&quality=high
/api/daily?orientation=landscape
```

### 用户页面

| 路径 | 说明 |
|---|---|
| `/` | 用户主页，随机背景、实时预览、最新动态 |
| `/docs` | 在线文档、API 说明、限速、配额、图源状态 |
| `/url-builder` | 可视化 API 链接生成器 |
| `/featured` | 今日推荐 / 预设主题展示页 |
| `/daily` | 每日精选页 |
| `/explore` | 瀑布流探索页 |
| `/share/preset/{slug}` | 预设模板分享页 |
| `/feedback` | 用户反馈页 |

### 管理后台

后台包含：

- 图片缓存管理
- 图源健康监控
- 图源优先级和额度感知路由
- 请求统计分析
- 预设模板管理
- API Key 管理
- 限速、封禁、IP 白名单
- 内容审核关键词
- 通知渠道配置
- 用户反馈管理
- 账户设置
- TOTP 双因素认证

首次后台入口通常是：

```txt
https://你的域名/{ADMIN_USERNAME}/login
```

首次登录后，系统会生成每日随机后台后缀；之后请以后台页面、通知或安装脚本显示的当前后缀为准。

---

## 环境变量

核心变量：

| 名称 | 必需 | 说明 |
|---|---:|---|
| `ADMIN_USERNAME` | 是 | 首次后台用户名和初始后台后缀 |
| `ADMIN_PASSWORD` | 是 | 后台密码，同时用于加密/签名派生，建议 32 位以上 |
| `OMNIWALL_PORT_BINDING` | 否 | Docker 宿主机端口绑定，默认 `3000` |
| `TRUST_PROXY` | 否 | 是否信任反向代理头，默认 `false` |
| `PUBLIC_BASE_URL` | 否 | 公网 HTTPS 地址，用于通知和后台链接 |
| `DATABASE_PATH` | 否 | SQLite 路径，容器内默认 `/app/data/omniwall.sqlite` |
| `MAX_REQUEST_BODY_BYTES` | 否 | 请求体大小限制，默认 `1048576` |

图片源：

| 名称 | 说明 |
|---|---|
| `UNSPLASH_ACCESS_KEY` | Unsplash API Key |
| `PEXELS_API_KEY` | Pexels API Key |
| `PIXABAY_API_KEY` | Pixabay API Key |

安全和扩展：

| 名称 | 说明 |
|---|---|
| `BG_TOKEN_SECRET` | `/api/bg` 内部签名密钥，建议独立随机值 |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile Site Key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret Key |
| `OPENAI_API_KEY` | 可选 OpenAI Moderation Key |
| `TRANSLATE_API_URL` | 可选自定义翻译 API 地址 |
| `TRANSLATE_API_KEY` | 可选自定义翻译 API Key |

完整模板见： [`.env.example`](.env.example)。

---

## 数据存储和备份

SQLite 数据默认保存在：

```txt
./data/omniwall.sqlite
```

建议备份：

```txt
./data/omniwall.sqlite
./data/omniwall.sqlite-wal
./data/omniwall.sqlite-shm
.env
```

在线备份前可以短暂停止容器：

```bash
docker compose down
cp -a data data-backup-$(date +%F)
docker compose up -d
```

---

## 本地开发

需要 Node.js 20+。

```bash
npm install
npm test
npm run dev
```

同步 Worker 源文件：

```bash
npm run sync:worker
```

运行测试：

```bash
npm test
```

---

## 仓库结构

```txt
.
├── omniwall.txt                  # 原 Worker 单文件源码，服务器版同步来源
├── src/worker.mjs                # 由 omniwall.txt 生成的 Worker ESM 文件
├── src/server.js                 # Node.js 服务入口
├── src/app.js                    # Express -> Worker fetch 桥接
├── src/db/d1-sqlite.js           # D1 兼容 SQLite 适配器
├── src/runtime/                  # 请求/响应和 execution context 兼容层
├── src/jobs/scheduler.js         # 定时维护任务
├── install.sh                    # 中文交互安装脚本
├── docker-compose.yml            # Docker Compose 部署文件
├── Dockerfile                    # Node.js 20 Docker 镜像
├── .env.example                  # 环境变量模板
├── docs/SERVER_DEPLOY.md         # 服务器部署详细指南
└── tests/                        # Vitest 测试
```

---

## 与 Cloudflare Worker 版本的关系

这个仓库的重点是服务器部署版，但仍保留原 Worker 逻辑：

- `omniwall.txt` 是 canonical Worker 源文件。
- `scripts/sync-worker-source.mjs` 会把它同步为 `src/worker.mjs`。
- Node.js 服务器通过 Express 把请求桥接到 Worker `fetch()`，避免重写业务路由。
- SQLite 适配器模拟 Cloudflare D1 常用接口。

因此，同一套核心页面和 API 可以在服务器版中继续运行。

---

## 安全注意事项

不要提交或公开：

- `.env`
- `.dev.vars`
- 真实生产 `wrangler.toml`
- Cloudflare API Token
- GitHub Token
- Turnstile Secret Key
- 图片源 Secret Key
- SQLite 数据库文件

`.gitignore` 和 `.dockerignore` 已默认排除常见敏感文件，但部署前仍建议自行检查。

---

## License

未声明开源许可证前，默认保留所有权利。如需公开复用，请先补充 LICENSE。
