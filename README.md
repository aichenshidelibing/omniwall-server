# OmniWall Server

OmniWall Server 是基于 **Node.js 20+、Fastify 和 SQLite** 的服务器部署版。当前入口是 `src/server.js`，生产环境建议使用裸 Node 进程并交由 systemd 管理；Docker、Worker/D1 兼容层和同步脚本仅保留在 `legacy/` 作为迁移参考，不参与默认运行。

## 快速开始

```bash
git clone https://github.com/aichenshidelibing/omniwall-server.git
cd omniwall-server
npm ci
cp .env.example .env
# 编辑 .env，至少设置 ADMIN_PASSWORD（建议 32 位以上随机值）
npm test
npm start
```

服务默认监听 `0.0.0.0:18080`。生产环境可使用 `install.sh` 交互安装：它生成管理员密码、配置文件、systemd 服务及 IP 直连 HTTPS 自签证书，并允许覆盖端口。直接暴露端口时保持 `TRUST_PROXY=false`。

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
