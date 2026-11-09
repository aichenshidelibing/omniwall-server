# OmniWall Server

OmniWall Server 是一个可自托管的多图源随机图片服务与管理控制台，基于 **Node.js 20+、Fastify 和 SQLite** 构建。它支持 Unsplash、Pexels、Pixabay、Bing 等图源，提供随机图片、每日图片、候选池缓存、近期排重、API Key、管理员入口轮换、CAP/Turnstile、人机验证、反馈管理和多渠道通知。

当前生产入口是 `src/server.js`，推荐使用裸 Node 进程交由 systemd 管理，不依赖 Docker。旧 Worker/D1 兼容代码和 Docker 文件仅保留在 `legacy/` 作为迁移参考，不参与默认运行。

## 项目特点

- **随机图片 API**：支持查询词、图源、方向和 JSON 元数据。
- **可靠随机机制**：缓存作为候选池使用，近期返回过的图片会暂时排除，避免重复结果。
- **每日图片**：按日期和方向固定返回，适合首页背景或每日精选。
- **安全管理后台**：长随机入口、自动轮换、会话、CSRF、限速和审计。
- **运行时配置**：可在后台管理图源 API Key、CAP/Turnstile Secret 等敏感配置，敏感值加密且不回显。
- **API Key**：支持长密钥、自定义限额、禁用和 unlimited 模式；数据库只保存 hash。
- **通知渠道**：支持 Telegram、飞书/Lark、钉钉、Resend、SendGrid 和通用 Webhook。
- **轻量部署**：Node.js + SQLite + systemd，默认高位端口 `18080`。
- **自签 HTTPS**：安装脚本可为 IP 或域名生成自签证书。

## 快速开始

### 方式一：交互式安装（推荐）

适用于 VPS 或其他使用 systemd 的 Linux 主机。安装脚本会询问端口、管理员密码、图片源、验证码和通知渠道，并生成 HTTPS 自签证书。

```bash
git clone https://github.com/aichenshidelibing/omniwall-server.git
cd omniwall-server
chmod +x install.sh uninstall.sh
sudo ./install.sh
```

默认端口是高位端口 `18080`，安装时可以改成 `1024–65535` 之间的其他端口。安装完成后访问：

```text
https://服务器IP:18080/
```

自签证书首次访问会出现浏览器证书警告。可以从安装目录的 `certs/server.crt` 导入证书，或在受信任的内网环境中接受该警告。公网长期运行建议改用域名和受信任的 HTTPS 证书。

只检查环境和安装步骤、不修改系统的预览模式：

```bash
./install.sh --dry-run
```

### 方式二：手动开发或非 systemd 环境

```bash
npm ci
cp .env.example .env
# 编辑 .env，至少设置 ADMIN_PASSWORD（建议 32 位以上随机值）
npm test
npm start
```

手动启动默认监听 `0.0.0.0:18080`。手动模式不会自动生成 HTTPS 证书；生产环境请配置 `HTTPS=true`、`TLS_KEY_FILE` 和 `TLS_CERT_FILE`，或放在可信 HTTPS 反向代理后面。

## 第一次使用

1. 打开安装输出的 HTTPS 地址。
2. 安装脚本会在终端一次性显示管理员入口，形如：

```text
https://服务器IP:18080/admin/<轮换Token>
```

该入口默认每天自动轮换，数据库只保存它的 hash，服务日志不会输出完整入口。请立即保存。

3. 使用安装时设置的管理员账号和密码登录。
4. 在管理页面配置至少一个图片源；Bing 可作为无 API Key 的基础来源，其他图源需要对应 API Key。
5. 在通知设置中填写渠道配置并发送测试通知。测试成功后，再勾选需要订阅的事件。
6. 如果启用 CAPTCHA，先在 `.env` 中选择 provider 并重启服务：

```env
# 关闭验证
CAPTCHA_PROVIDER=none

# 已部署的 CAP 服务
CAPTCHA_PROVIDER=cap
CAP_SERVER_URL=https://captcha.example.com
CAP_VERIFY_PATH=/verify
CAP_SECRET=replace-me

# Cloudflare Turnstile
CAPTCHA_PROVIDER=turnstile
TURNSTILE_SECRET=replace-me
```

修改 `.env` 后：

```bash
sudo systemctl restart omniwall
sudo journalctl -u omniwall -n 100 --no-pager
```

## 管理员入口

后台入口不再固定为 `/admin`，而是使用随机 Token：

```text
/admin/<Token>
```

- Token 为 48 字节随机值；
- 数据库只保存 SHA-256 hash；
- 默认有效期 86400 秒（每天轮换）；
- 过期后自动生成新入口，旧入口立即失效；
- 启动日志只显示 `/admin/[one-time-token]`，不泄露完整地址；
- 管理员可在后台查看当前入口、立即轮换，并修改有效期（范围 `300–31536000` 秒）。

需要兼容固定入口时，可设置：

```env
ADMIN_ALLOW_LEGACY_PATH=true
```

此时 `/admin` 也会开放。仅建议在首次初始化或内网调试时短暂使用。

## API Key

后台可以创建 API Key，用于程序化调用图片接口：

```bash
curl -H "X-API-Key: owk_你的密钥" \
  "https://服务器地址:18080/api/random?info=true"

curl -H "Authorization: Bearer owk_你的密钥" \
  "https://服务器地址:18080/api/random?info=true"
```

说明：

- 密钥为 48 字节随机值，创建时只显示一次；
- 数据库只保存 SHA-256 hash；
- 支持启用、禁用、删除；
- 支持自定义请求限额；
- 支持 unlimited 模式，绕过普通按 IP 的接口限流；
- unlimited 仍保留独立滥用保护，可通过 `API_KEY_ABUSE_RATE_MAX` 和 `API_KEY_ABUSE_RATE_WINDOW_SECONDS` 调整。

未携带有效 Key 的调用按普通接口限流处理。

## 图片 API 与缓存

随机图片接口：

```bash
# 302 跳转到图片
curl -I 'https://服务器IP:18080/api/random?query=nature'

# 返回 JSON 元数据
curl -k 'https://服务器IP:18080/api/random?query=nature&info=true'

# 指定图源和方向
curl -k 'https://服务器IP:18080/api/random?source=unsplash&orientation=landscape&info=true'

# 绕过缓存重新请求图源
curl -k 'https://服务器IP:18080/api/random?reload=true&info=true'
```

普通随机接口默认使用 `Cache-Control: no-store`，服务端缓存是候选池而不是固定结果；近期已经返回的图片会暂时排除，避免连续重复。相关配置：

```env
IMAGE_CACHE_TTL_SECONDS=900
IMAGE_RECENT_TTL_SECONDS=300
```

`/api/daily` 按日期和方向返回当天固定图片。`reload=true` 用于绕过普通随机缓存；`no-store=true` 或请求头 `Cache-Control: no-store` 会同时绕过读取和写入缓存。

## 备份与恢复

停止服务后备份 SQLite 主文件及 WAL/SHM 文件，避免复制过程中数据库仍在写入：

```bash
sudo systemctl stop omniwall
sudo mkdir -p /backup/omniwall
sudo cp -a /opt/omniwall-server/data/omniwall.sqlite* /backup/omniwall/
sudo cp -a /opt/omniwall-server/.env /backup/omniwall/
sudo chmod 600 /backup/omniwall/.env
sudo systemctl start omniwall
```

恢复时先停止服务，将备份文件放回 `data/`，确认 `.env` 中的 `DATABASE_PATH` 正确，再启动并检查 `/healthz`。不要把数据库、`.env` 或自签私钥提交到 Git。

## 常见问题

### 浏览器提示证书不受信任

这是自签证书的正常表现。导入 `certs/server.crt`，或仅在可信内网中接受证书警告。公网环境建议使用受信任证书。

### `/healthz` 正常但图片无法返回

检查图源 API Key、服务器出站网络和日志：

```bash
sudo journalctl -u omniwall -n 200 --no-pager
```

Bing 默认可用，但其他图源需要有效 Key；外部图源限流或故障时可能返回 `503`。

### 通知测试失败

先确认管理会话和 CSRF 正常，再检查渠道配置。`/healthz` 不会检查 Telegram、飞书、钉钉或邮件服务。通知测试必须从后台操作，不能只调用健康检查接口。

### 修改 `.env` 没有生效

systemd 服务不会自动重新读取配置：

```bash
sudo systemctl restart omniwall
sudo systemctl status omniwall --no-pager
```

### 忘记当前管理员入口

入口无法从日志或数据库明文找回。可以直接登录服务器执行：

```bash
sudo sqlite3 /opt/omniwall-server/data/omniwall.sqlite \
  "UPDATE admin_entrypoints SET expires_at = 0 WHERE id = 1;"
```

然后重启服务，启动日志会提示入口已重置；也可以在管理员仍能登录时从后台查看当前入口。若已无法登录，临时设置 `ADMIN_ALLOW_LEGACY_PATH=true` 并重启，通过 `/admin` 登录后立即关闭该开关并手动轮换入口。

### API Key 返回 401

确认使用了正确的请求头和完整密钥：

```bash
curl -H "X-API-Key: owk_..." 'https://服务器地址:18080/api/random?info=true'
```

密钥只显示一次，遗失后无法找回，请在后台删除旧 Key 并创建新 Key。

### 端口无法访问

确认服务状态、防火墙和端口监听：

```bash
sudo systemctl status omniwall --no-pager
sudo ss -ltnp | grep 18080
```

如果修改过端口，请将命令中的 `18080` 换成实际端口。

## 卸载

卸载脚本会停止并删除 systemd 服务、安装目录、SQLite 数据、`.env`、日志和证书。执行前会要求输入完整确认字符串：

```bash
sudo ./uninstall.sh
# 输入：DELETE-OMNIWALL
```

该操作不可恢复；如需保留数据，请先按上面的备份步骤复制数据库和配置。

## systemd 部署

建议将项目放在 `/opt/omniwall-server`，并使用专用非 root 用户运行：

```ini
# /etc/systemd/system/omniwall.service
[Unit]
Description=OmniWall Node.js server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=omniwall
Group=omniwall
WorkingDirectory=/opt/omniwall-server
EnvironmentFile=/opt/omniwall-server/.env
ExecStart=/usr/bin/node /opt/omniwall-server/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now omniwall
sudo journalctl -u omniwall -f
```

更新代码时先运行测试，再重启服务：

```bash
npm ci
npm test
sudo systemctl restart omniwall
```

## 配置与数据

复制 [`.env.example`](.env.example) 为 `.env`。必需配置是 `ADMIN_PASSWORD`；常用配置包括 `HOST`、`PORT`、`DATABASE_PATH`、`PUBLIC_BASE_URL`、`TRUST_PROXY`、图片源 API Key 和站点信息。SQLite 默认位于 `./data/omniwall.sqlite`，备份时同时保留 WAL/SHM 文件，并保护 `.env` 权限。

环境变量是运行时配置的初始值和兜底，优先级高于后台数据库配置。后台保存的图源 Key、CAP/Turnstile Secret 使用 AES-256-GCM 加密存储，页面只显示是否已配置，不回显原值；留空保存表示保留原值。

检查服务是否已启动：

```bash
curl http://127.0.0.1:18080/healthz
# 预期：{"status":"ok"}
```

如需使用 HTTPS 直连，请在 `.env` 中同时设置 `HTTPS=true`、`TLS_KEY_FILE` 和 `TLS_CERT_FILE`；`install.sh` 会自动生成自签证书并写入这些配置。生产后台和 `/api/bg` Cookie 需要 HTTPS。管理员登录使用 `.env` 中的 `ADMIN_USERNAME` 与 `ADMIN_PASSWORD`，登录后可在后台配置图片源、反馈、API key、TOTP 和通知渠道。通知渠道的“测试通知”接口为 `POST /api/admin/notifications/:provider/test`，需要管理员会话和 CSRF。`GET /healthz` 仅验证服务存活，不代表外部图片源或通知渠道可达。

## 开发与测试

```bash
npm install
npm run dev
npm test
```

## 仓库结构

```txt
src/server.js       # 裸 Node/Fastify 生产入口
src/app.js          # Fastify 应用
src/db/             # SQLite 数据库与迁移
public/              # 前端静态资源
tests/               # Vitest 测试
legacy/              # 旧 Worker、D1/runtime 兼容层、Docker 和同步脚本（迁移参考）
```

`legacy/` 中的旧 Worker 源码不会被删除，也不会被默认 npm scripts 引用。如需研究迁移历史，可直接查看 `legacy/worker/` 和 `legacy/deployment/`。
