# OmniWall Node.js + SQLite + Docker 部署指南

这个部署方式适合 VPS、NAS、宝塔 Docker、1Panel、CasaOS、Portainer 或任意支持 Docker Compose 的服务器。

## 运行架构

```txt
浏览器 / API 客户端
  -> Nginx / Caddy / 面板反代，可选
  -> Docker 容器：Node.js + Express
  -> SQLite 数据库：./data/omniwall.sqlite
```

服务器版保留原 Cloudflare Worker 的页面和接口，并用 SQLite 替代 Cloudflare D1。

## 1. 准备服务器

服务器需要安装：

- Docker
- Docker Compose v2

检查命令：

```bash
docker --version
docker compose version
```

## 2. 配置环境变量

复制模板：

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

Docker Compose 会把主机 `./data` 挂载到容器 `/app/data`。容器启动入口会先修复 `/app/data` 的 bind mount 所有权，再切换到 `node` 用户运行应用，因此通常不需要手动处理 SQLite 数据目录权限。

## 3. 一键启动

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f omniwall
```

访问：

```txt
http://服务器IP:3000/
http://服务器IP:3000/docs
http://服务器IP:3000/admin/login
```

如果 `ADMIN_USERNAME` 不是 `admin`，首次后台入口是：

```txt
http://服务器IP:3000/{ADMIN_USERNAME}/login
```

首次登录后，系统会生成每日随机后台路径，后续请使用新的后台路径。

## 4. 初始化数据库

首次访问页面时会自动初始化 SQLite 表。也可以手动初始化：

```bash
curl -H "Authorization: Bearer 你的ADMIN_PASSWORD" http://服务器IP:3000/api/d1/init
```

返回包含 `"ok": true` 即成功。

## 5. 反向代理建议

Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Caddy 示例：

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 6. 数据备份

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

## 7. 更新代码

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

### 获取真实客户端 IP

如果部署在反向代理后面，保持：

```bash
TRUST_PROXY=true
```

并确保反代传递：

```txt
X-Forwarded-For
X-Forwarded-Proto
```
