# OmniWall Node.js + SQLite + Docker 部署指南

这个部署方式适合 VPS、NAS、宝塔 Docker、1Panel、CasaOS、Portainer 或任意支持 Docker Compose 的服务器。

## 运行架构

```txt
浏览器 / API 客户端
  -> HTTPS 反向代理：Nginx / Caddy / 面板反代（生产必需）
  -> Docker 容器：Node.js + Express
  -> SQLite 数据库：./data/omniwall.sqlite
```

服务器版保留原 Cloudflare Worker 的页面和接口，并用 SQLite 替代 Cloudflare D1。

## 1. 准备服务器

服务器需要安装：

- Docker
- Docker Compose v2
- 一个已配置 TLS 证书的域名或 HTTPS 反向代理

检查命令：

```bash
docker --version
docker compose version
```

## 2. 推荐：交互安装脚本

推荐直接运行安装向导：

```bash
chmod +x install.sh
./install.sh
```

脚本会引导你配置：

- 后台用户名和 32 位以上强密码
- Docker 端口绑定：例如 `3000` 或 `127.0.0.1:3000`
- 直接 demo 模式或生产 HTTPS 反向代理模式
- `TRUST_PROXY` 安全选项
- `PUBLIC_BASE_URL`
- Unsplash / Pexels / Pixabay API Key
- 站点名称和图标
- `/api/bg` 签名密钥、Turnstile、人机验证和可选外部审核/翻译配置
- 是否立即执行 `docker compose up -d --build` 并初始化数据库

安装脚本会生成 `.env`。如果重复运行且检测到已有 `.env`，会询问保留、重新配置或退出；重新配置前会自动备份为 `.env.backup-YYYYMMDD-HHMMSS`。

生产反向代理模式推荐端口绑定：

```bash
OMNIWALL_PORT_BINDING=127.0.0.1:3000
TRUST_PROXY=true
PUBLIC_BASE_URL=https://你的域名
```

直接端口 demo 模式推荐：

```bash
OMNIWALL_PORT_BINDING=3000
TRUST_PROXY=false
```

生产环境后台登录和 `/api/bg` Cookie 功能必须通过 HTTPS 访问，因为兼容 Worker 的 Cookie 会设置 `Secure`。

## 3. 手动配置环境变量

如果不使用安装脚本，也可以复制模板：

```bash
cp .env.example .env
```

至少修改：

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成32位以上强密码
UNSPLASH_ACCESS_KEY=你的 Unsplash key，可留空
PEXELS_API_KEY=你的 Pexels key，可留空
PIXABAY_API_KEY=你的 Pixabay key，可留空
SITE_NAME=OmniWall
```

`ADMIN_PASSWORD` 同时用于后台登录和加密密钥派生。上线后不要随意更换，否则旧的加密缓存、通知配置或反馈内容可能无法解密。

安全默认值：

```bash
TRUST_PROXY=false
MAX_REQUEST_BODY_BYTES=1048576
```

只有当 OmniWall 位于你控制的可信反向代理后面，并且外部用户不能直接访问容器端口时，才设置 `TRUST_PROXY=true`。启用后服务会信任反代传入的 `X-Forwarded-*` 头用于协议/IP 判断。

## 4. 一键启动

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f omniwall
```

本地或局域网 smoke/demo 可以直接访问：

```txt
http://服务器IP:3000/
http://服务器IP:3000/docs
```

生产环境的后台登录和 `/api/bg` 背景 Cookie 功能需要 HTTPS，因为 Worker 兼容逻辑设置的是 `Secure` Cookie。请把 TLS 放在 OmniWall 前面，然后访问：

```txt
https://你的域名/
https://你的域名/docs
https://你的域名/admin/login
```

如果 `ADMIN_USERNAME` 不是 `admin`，首次后台入口是：

```txt
https://你的域名/{ADMIN_USERNAME}/login
```

首次登录后，系统会生成每日随机后台路径，后续请使用新的后台路径。

## 5. 初始化数据库

首次访问页面时会自动初始化 SQLite 表。也可以手动初始化：

```bash
curl -H "Authorization: Bearer 你的ADMIN_PASSWORD" https://你的域名/api/d1/init
```

本地 smoke/demo 可使用：

```bash
curl -H "Authorization: Bearer 你的ADMIN_PASSWORD" http://127.0.0.1:3000/api/d1/init
```

返回包含 `"ok": true` 即成功。

## 6. HTTPS 反向代理建议

推荐只让反向代理暴露到公网，容器端口 `3000` 只监听本机或内网。若使用 Docker Compose 默认的 `3000:3000` 公网映射，请保持 `TRUST_PROXY=false`，不要信任直连客户端伪造的 `X-Forwarded-*` 头。

### Nginx HTTPS 示例

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

确认 3000 端口只允许反代访问后，可在 `.env` 中启用：

```bash
TRUST_PROXY=true
```

### Caddy HTTPS 示例

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-Proto https
    }
}
```

Caddy 会自动申请和续期 HTTPS 证书。同样建议确认直连 3000 端口不对公网开放后再设置 `TRUST_PROXY=true`。

## 7. 数据备份

SQLite 数据在：

```txt
./data/omniwall.sqlite
```

推荐同时备份这些文件：

```txt
./data/omniwall.sqlite
./data/omniwall.sqlite-wal
./data/omniwall.sqlite-shm
.env
```

在线备份前可以先短暂停止容器：

```bash
docker compose down
cp -a data data-backup-$(date +%F)
docker compose up -d
```

## 8. 更新代码

```bash
git pull
docker compose up -d --build
```

数据库迁移会在启动和首次请求时自动执行。

## 8. 常见问题

### 页面提示 ADMIN_PASSWORD 未配置

检查 `.env` 是否存在，并确认：

```bash
grep ADMIN_PASSWORD .env
```

### 图片源不可用

至少配置一个图片平台 Key，或者只使用不需要 Key 的 Bing 每日壁纸源。配置后重启：

```bash
docker compose restart omniwall
```

### 后台登录后仍未保持登录，或首页背景接口提示缺少 Cookie

生产后台会设置 `Secure` Cookie，浏览器只会在 HTTPS 下保存和发送。请使用 `https://你的域名/{ADMIN_USERNAME}/login`，不要用公网明文 HTTP 做生产后台登录。

### 获取真实客户端 IP

如果部署在可信反向代理后面，并且直连端口没有暴露给公网，可以设置：

```bash
TRUST_PROXY=true
```

并确保反代传递：

```txt
X-Forwarded-For
X-Forwarded-Proto
```

如果是直接暴露 `3000:3000`，请保持 `TRUST_PROXY=false`。
