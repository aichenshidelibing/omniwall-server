# OmniWall（万象图墙）

OmniWall 是一个基于 **Cloudflare Workers + D1** 的多图源随机壁纸 / 图片跳转服务。项目采用单文件 Worker 架构，配置、缓存、限速、封禁、日志、通知、反馈等数据全部存储在 Cloudflare D1 中，不依赖 KV。

它适合用来搭建个人随机壁纸 API、博客 / 导航站背景图服务、轻量级图床跳转服务，或者作为多图源图片聚合 Worker 的基础模板。

自建示例站点可以参考：<https://omniwall.246578.xyz/>。这个站点使用的就是本项目代码，适合用来查看首页效果、文档页面、链接生成器以及整体交互体验。

---

## 主要特性

### 多图源图片 API

当前支持以下图片源：

- Unsplash
- Pexels
- Pixabay
- Bing 每日壁纸

支持能力：

- 随机图片跳转
- 指定图源
- 指定关键词
- 指定图片方向：横屏、竖屏、方图
- 中文关键词自动翻译
- JSON 元数据返回
- 强制刷新缓存
- 多图源 fallback
- 壁纸预设模板（内置 + 后台自定义）
- 颜色、最小尺寸、宽高比例等精细筛选
- 智能关键词扩展，提高搜图命中率

### D1 持久化

OmniWall 使用 Cloudflare D1 保存运行数据，包括：

- 系统配置
- 图片缓存池
- API 配额记录
- 限速记录
- IP 封禁记录
- 白名单
- 内容审核关键词
- 更新日志
- 通知配置
- 通知历史
- 错误日志
- 用户反馈

### 管理后台

后台包含：

- 控制台概览
- 图片缓存管理
- 图源健康监控
- 图源优先级与健康路由
- 请求统计分析面板
- 预设模板管理
- 限速与封禁管理
- IP 白名单
- 内容审核与关键词管理
- 通知渠道配置
- 更新日志管理
- 用户反馈管理
- 账户设置
- TOTP 双因素认证

### 安全机制

已实现的安全能力：

- 管理后台每日随机路径
- 后台登录密码保护
- TOTP 双因素认证
- CSRF 防护
- IP 哈希存储
- 访问限速
- 自动封禁
- 手动封禁 / 解除封禁
- IP 白名单
- 本地危险输入检测
- 可选外部内容审核 API
- Cloudflare Turnstile 人机验证
- `/api/bg` 首页内部接口签名保护
- 精美错误页面，避免暴露堆栈或原始错误信息

### 通知系统

支持多个通知渠道：

- Telegram
- 飞书
- 钉钉
- Email HTTP Provider

通知事件包括：

- 后台地址变更
- 管理员登录成功
- 管理员登录失败
- IP 被封禁
- API 配额告警
- TOTP 启用
- 收到用户反馈
- 测试通知

---

## 页面与接口

### 用户页面

| 路径 | 说明 |
|---|---|
| `/` | 用户主页，随机背景、实时预览、最新动态 |
| `/docs` | 在线文档、API 说明、限速、配额、图源状态 |
| `/url-builder` | 可视化 API 链接生成器 |
| `/featured` | 今日推荐 / 预设主题展示页 |
| `/feedback` | 用户问题反馈页 |

### 图片 API

| 路径 | 说明 |
|---|---|
| `/api/random` | 新版随机图片 API |
| `/random` | 兼容旧接口 |
| `/?query=nature` | 兼容旧 query 用法 |
| `/api/bg` | 首页内部背景接口，需要短期签名凭证，不作为公开 API 使用 |

常用参数：

| 参数 | 示例 | 说明 |
|---|---|---|
| `preset` | `preset=desktop-nature` | 使用预设模板，后台可自定义 |
| `source` | `source=unsplash` | 指定图源：`unsplash` / `pexels` / `pixabay` / `bing` |
| `query` | `query=nature` | 搜索关键词，支持中文自动翻译和智能扩展 |
| `orientation` | `orientation=landscape` | 图片方向：`landscape` / `portrait` / `squarish` |
| `color` | `color=blue` | 主色筛选：`black` / `white` / `yellow` / `orange` / `red` / `purple` / `magenta` / `green` / `teal` / `blue` / `black_and_white` |
| `min_width` / `min_height` | `min_width=1920` | 最小尺寸筛选 |
| `aspect` | `aspect=wide` | 比例筛选：`wide` / `tall` / `square` |
| `expand` | `expand=false` | 关闭智能关键词扩展 |
| `info` | `info=true` | 返回 JSON 元数据，不跳转图片 |
| `reload` | `reload=true` | 强制刷新当前缓存 |

示例：

```txt
/api/random
/api/random?orientation=landscape
/api/random?query=nature
/api/random?query=猫&info=true
/api/random?source=pexels&orientation=portrait
/api/random?preset=desktop-nature
/api/random?query=city&color=blue&aspect=wide&min_width=1920
/api/random?reload=true
```

### 管理后台

首次后台入口：

```txt
https://你的域名/{ADMIN_USERNAME}/login
```

首次登录后会生成每日随机后台路径，后续应使用新的随机路径访问后台。

---

## 快速部署

### 1. 创建 D1 数据库

在 Cloudflare Dashboard 创建一个 D1 数据库，例如：

```txt
omniwall-db
```

然后在 Worker 设置中绑定：

```txt
Binding name: DB
Database: omniwall-db
```

### 2. 创建 Worker

可以直接在 Cloudflare Worker 编辑器中：

1. 创建 Worker
2. 删除默认代码
3. 复制 `omniwall.txt` 的全部内容
4. 粘贴并保存部署

也可以把 `omniwall.txt` 内容复制到 Wrangler 项目的 `src/worker.js` 后部署。

### 3. 配置必需变量

至少需要：

```txt
ADMIN_USERNAME=admin
ADMIN_PASSWORD=一个足够强的后台密码
UNSPLASH_ACCESS_KEY=你的 Unsplash Access Key
```

以及 D1 绑定：

```txt
DB=你的 D1 数据库绑定
```

> `ADMIN_PASSWORD` 同时用于后台密码和部分加密密钥派生，请使用足够长的随机强密码。

### 4. 首次访问自动初始化

绑定 D1 后，Worker 首次收到请求会自动创建表结构，无需手动 SQL 初始化。

如需手动触发：

```bash
curl -H "Authorization: Bearer 你的ADMIN_PASSWORD" "https://你的域名/api/d1/init"
```

---

## 环境变量与 Secret

### 必需

| 名称 | 类型 | 说明 |
|---|---|---|
| `ADMIN_USERNAME` | Variable / Secret | 首次后台路径和登录用户名 |
| `ADMIN_PASSWORD` | Secret | 后台密码，同时用于加密密钥派生 |
| `DB` | D1 Binding | D1 数据库绑定，名称必须是 `DB` |

### 图片源

| 名称 | 类型 | 说明 |
|---|---|---|
| `UNSPLASH_ACCESS_KEY` | Secret | Unsplash API Key |
| `PEXELS_API_KEY` | Secret | Pexels API Key |
| `PIXABAY_API_KEY` | Secret | Pixabay API Key |

至少配置一个图片源即可运行；Bing 每日壁纸无需 API Key。

### 内容审核（可选）

| 名称 | 说明 |
|---|---|
| `OPENAI_API_KEY` | OpenAI Moderation |
| `PERSPECTIVE_API_KEY` | Google Perspective API |
| `AZURE_CONTENT_SAFETY_ENDPOINT` | Azure Content Safety Endpoint |
| `AZURE_CONTENT_SAFETY_KEY` | Azure Content Safety Key |

不配置外部审核时，本地危险输入检测仍然可用。

### 翻译（可选）

| 名称 | 说明 |
|---|---|
| `TRANSLATE_API_URL` | 自定义翻译 API 地址 |
| `TRANSLATE_API_KEY` | 自定义翻译 API Key |

不配置时会尝试使用 Google Translate 和 MyMemory 作为 fallback。

### 防滥用与人机验证（推荐）

| 名称 | 类型 | 说明 |
|---|---|---|
| `BG_TOKEN_SECRET` | Secret | `/api/bg` 内部签名密钥；不配置时 fallback 到 `ADMIN_PASSWORD` |
| `TURNSTILE_SITE_KEY` | Variable | Cloudflare Turnstile Site Key |
| `TURNSTILE_SECRET_KEY` | Secret | Cloudflare Turnstile Secret Key |

只有 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 同时存在时，Turnstile 才会启用。密钥配置好以后，可以在管理后台的”设置”页面控制是否启用 Turnstile，以及分别保护反馈提交、后台登录、内容检测接口；内容检测接口默认启用保护，可按需在后台关闭。

### 品牌与界面（可选）

| 名称 | 类型 | 说明 |
|---|---|---|
| `SITE_NAME` | Variable | 站点名称；不配置时默认为 `OmniWall` |
| `SITE_FAVICON` | Variable | 站点图标 URL；不配置或 URL 无效时使用内置默认图标 |

站点名称会用于首页标题、页面标题、后台侧边栏、登录页和 Bot 帮助文本。页面顶部品牌区域会链接回首页 `/`。语言切换和深浅色切换按钮的文字固定为英文显示。

---

## `/api/bg` 内部保护说明

`/api/bg` 是首页背景和实时预览使用的内部接口，因为它不走普通随机图限速，所以已经做了额外保护：

- 首页渲染时生成短期 `bg_token`
- 同时设置 `ow_bg_sid` HttpOnly Cookie
- `/api/bg` 校验 token、签名、过期时间和 Cookie 绑定
- 直接访问或伪造 token 会返回错误页面
- 明显滥用会触发 15–60 分钟左右的临时封禁
- 过期但签名正确的 token 默认只提示刷新首页，避免误伤正常用户

公开调用图片时请使用：

```txt
/api/random
/random
/?query=nature
```

不要把 `/api/bg` 当作公开图床接口使用。

---

## 缓存与随机机制

OmniWall 缓存的是“图片池”，不是单张图片：

- 非 Bing 图源按 `source + query + orientation` 生成缓存 key
- 每个缓存池保存多张候选图片
- 精细筛选参数会参与缓存 key，避免不同条件互相污染
- 请求时从缓存池中随机选择
- 内存中会记录最近返回过的图片，尽量减少连续重复
- `reload=true` 可以强制刷新当前缓存池
- 默认随机模式优先使用 Unsplash / Pexels / Pixabay，Bing 主要作为无关键词兜底

---

## 错误体验

OmniWall 尽量避免向用户展示原始错误、堆栈或丑陋纯文本：

- 程序接口继续返回 JSON
- 普通页面错误显示精美错误页
- 封禁页显示原因、解除时间和剩余时间
- 后台入口过期、CSRF、TOTP、反馈不存在等都有专门页面或提示
- 全局 404 / 500 不暴露内部异常细节

---

## 通知渠道

支持：

- Telegram Bot
- 飞书机器人
- 钉钉机器人
- Email HTTP Provider（如 Resend、SendGrid、自定义 Webhook）

Telegram Bot 可选命令：

| 命令 | 说明 |
|---|---|
| `/admin` / `/today` / `/path` | 获取今日管理后台入口 |
| `/status` / `/quota` | 获取 API 配额状态 |
| `/reset 123456` | 通过 TOTP 重置管理入口 |
| `/help` / `/start` | 显示帮助 |

通知安全与后台入口：

- 后台地址变化通知会向所有已启用渠道发送最新 `path`、`admin_url` 和过期时间；Cron 场景建议配置 `PUBLIC_BASE_URL`（或 `SITE_URL` / `APP_URL`），这样飞书、钉钉、Email 也能收到完整后台链接。
- 飞书 / Lark 机器人支持可选 Secret 加签：填写 Webhook URL 和 Secret 后，发送时会自动加入 `timestamp` 和 `sign`。
- 钉钉机器人支持可选 Secret 加签：填写 Webhook URL 和 `SEC...` Secret 后，发送时会自动在 URL 中追加 `timestamp` 和 `sign`。
- 通知配置页提供渠道能力矩阵，可查看启用状态、出站通知、加签/密钥、Bot 命令能力和订阅事件数量，并支持单独测试某个渠道。
- 每个渠道可独立选择订阅事件；测试通知不受订阅限制，便于排查配置。
- Token、Webhook URL、API Key 和 Secret 保存后不会在后台页面回显；留空保存会保留旧值，可勾选“清空已保存的值”清除。
- 飞书 Webhook 仅接受 `https://*.feishu.cn/open-apis/bot/v2/hook/...` 或 `https://*.larksuite.com/open-apis/bot/v2/hook/...`；钉钉 Webhook 仅接受 `https://oapi.dingtalk.com/robot/send...`。
- 钉钉、飞书的关键词和 IP 白名单仍在各自平台机器人设置里配置；Cloudflare Workers 出站 IP 可能不适合固定 IP 白名单，推荐优先使用加签。
- 临时网络错误、HTTP 429 和 5xx 会自动进行小次数重试；Token、签名、关键词等平台返回的永久错误不会盲目重试。

---

## Cron Triggers

推荐添加：

```txt
0 16 * * *      # 每天 CST 00:00 轮换后台路径
*/5 * * * *     # 每 5 分钟采样图源健康
```

---

## 仓库结构

```txt
.
├── omniwall.txt              # Cloudflare Worker 主程序
├── 图床安装部署教程.md         # 完整部署教程
├── README.md                 # 项目说明
└── .gitignore                # 忽略本地配置和 Secret 文件
```

---

## 安全注意事项

不要提交或公开：

- Worker Secret
- `.env`
- `.dev.vars`
- 真实生产 `wrangler.toml`
- Cloudflare API Token
- GitHub Token
- Turnstile Secret Key
- 图片源 Secret Key

`.gitignore` 已默认排除常见敏感文件，但部署前仍建议自行检查。

---

## 详细文档

完整安装、配置、后台说明、测试顺序和常见问题请查看：

```txt
图床安装部署教程.md
```
