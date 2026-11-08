# OmniWall 裸 Node + systemd 部署

当前生产入口是 `src/server.js`，使用 Node.js 20+、Fastify 和本地 SQLite。Docker、Cloudflare Worker/D1 兼容代码已隔离到 `legacy/`，仅供迁移参考。

## 安装

```bash
sudo useradd --system --home /opt/omniwall-server --shell /usr/sbin/nologin omniwall
sudo mkdir -p /opt/omniwall-server
sudo chown omniwall:omniwall /opt/omniwall-server
git clone <仓库地址> /opt/omniwall-server
cd /opt/omniwall-server
npm ci
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，至少设置 32 位以上的 `ADMIN_PASSWORD`。默认端口为高位端口 `18080`，可由安装脚本交互覆盖。运行 `sudo ./install.sh --dry-run` 可仅做静态前置检查，不会改文件、复制源码、安装依赖或启停服务。安装脚本必须从源码树运行，会将源码复制到 `APP_DIR` 后再执行 `npm ci`；通知配置按 provider 写入 `NOTIFICATION_PROVIDER` 与 JSON `NOTIFICATION_CONFIG`（Telegram 需要 token/chatId，邮件需要 apiKey/from/to，Webhook 需要 HTTPS URL）。脚本使用 `node JSON.stringify` 生成并规范化 JSON，避免 shell quoting 混入 dotenv 值；`EnvironmentFile` 会按 dotenv/systemd 的 `KEY=value` 规则读取该单行 JSON，JSON 内的双引号不需要 shell 转义。IP/主机名直连部署使用 `HTTPS=true`、`TLS_KEY_FILE`、`TLS_CERT_FILE`，脚本生成的 SAN 对 IPv4/IPv6 使用 IP，对主机名使用 DNS，并拒绝空格、路径分隔符及其他非法主机名字符。systemd 使用实际解析出的 Node 路径。安装并登录管理后台后，进入通知设置保存配置，再调用对应 provider 的“测试通知”步骤（`POST /api/admin/notifications/:provider/test`，需管理员会话和 CSRF），确认实际连通性；`GET /healthz` 仅验证服务存活，不代表通知渠道可达。卸载请仅手动运行 `sudo ./uninstall.sh`，运行时必须二次输入 `DELETE-OMNIWALL`，将删除服务、安装目录、SQLite、`.env`、日志和证书。

## systemd

创建 `/etc/systemd/system/omniwall.service`：

```ini
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

## 更新与备份

```bash
cd /opt/omniwall-server
git pull
npm ci
npm test
sudo systemctl restart omniwall
```

备份 `data/omniwall.sqlite`、对应的 `-wal`/`-shm` 文件和 `.env`。迁移历史文件位于 `legacy/`，不要从其中的 Docker 或 Worker 文件启动生产服务。
