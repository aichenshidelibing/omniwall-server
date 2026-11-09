#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
APP_DIR="${APP_DIR:-/opt/omniwall-server}"
SERVICE_NAME="${SERVICE_NAME:-omniwall}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
APP_USER="${APP_USER:-omniwall}"
DEFAULT_PORT=18080
DRY_RUN=0
for arg in "$@"; do case "$arg" in --dry-run) DRY_RUN=1;; --help|-h) printf '用法：sudo ./install.sh [--dry-run]\n'; exit 0;; *) printf '未知参数：%s\n' "$arg" >&2; exit 2;; esac; done
say(){ printf '%s\n' "$*"; }
die(){ printf '错误：%s\n' "$*" >&2; exit 1; }
run(){ if ((DRY_RUN)); then printf '+ '; printf '%q ' "$@"; printf '\n'; else "$@"; fi; }
[[ -f "$SCRIPT_DIR/package.json" ]] || die "源码目录缺少 package.json：$SCRIPT_DIR"
NODE_BIN=$(command -v node || true); [[ -n "$NODE_BIN" ]] || die '需要 Node.js 20+。'
node -e 'process.exit(+process.versions.node.split(".")[0] < 20 ? 1 : 0)' || die 'Node.js 版本必须为 20+。'
command -v openssl >/dev/null || die '需要 openssl。'; command -v systemctl >/dev/null || die '需要 systemd。'
if ((DRY_RUN)); then say "dry-run：不会修改文件、安装依赖或启停服务。源码目录：$SCRIPT_DIR"; exit 0; fi
[[ $EUID -eq 0 ]] || die '请以 root 运行。'
read -r -p "安装目录 [${APP_DIR}]: " v; APP_DIR=${v:-$APP_DIR}
while :; do read -r -p "HTTPS 端口 [${DEFAULT_PORT}]: " PORT; PORT=${PORT:-$DEFAULT_PORT}; [[ $PORT =~ ^[0-9]+$ && $PORT -ge 1024 && $PORT -le 65535 ]] && break; say '请输入 1024-65535 的端口。'; done
read -r -p '服务器 IP/主机名（证书 SAN） [127.0.0.1]: ' PUBLIC_HOST; PUBLIC_HOST=${PUBLIC_HOST:-127.0.0.1}
node -e 'const net=require("node:net"); const h=process.argv[1]; const hostname=/^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\\.([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/.test(h); process.exit(net.isIP(h) || hostname ? 0 : 1)' "$PUBLIC_HOST" || die '主机名/IP 格式无效。'
if [[ "$PUBLIC_HOST" =~ ^[0-9.]+$ ]] && node -e 'process.exit(require("node:net").isIP(process.argv[1]) === 4 ? 0 : 1)' "$PUBLIC_HOST"; then SAN="IP:${PUBLIC_HOST}"; elif node -e 'process.exit(require("node:net").isIP(process.argv[1]) === 6 ? 0 : 1)' "$PUBLIC_HOST"; then SAN="IP:${PUBLIC_HOST}"; else SAN="DNS:${PUBLIC_HOST}"; fi
read -r -p '管理员用户名 [admin]: ' ADMIN_USERNAME; ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
while :; do read -r -s -p '管理员密码（至少 32 字符）: ' ADMIN_PASSWORD; printf '\n'; [[ ${#ADMIN_PASSWORD} -ge 32 ]] && break; say '密码过短。'; done
ADMIN_PATH_TOKEN=$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-64)
read -r -p '管理员入口有效期（秒，300-31536000） [86400]: ' ADMIN_PATH_DURATION_SECONDS; ADMIN_PATH_DURATION_SECONDS=${ADMIN_PATH_DURATION_SECONDS:-86400}; [[ "$ADMIN_PATH_DURATION_SECONDS" =~ ^[0-9]+$ && "$ADMIN_PATH_DURATION_SECONDS" -ge 300 && "$ADMIN_PATH_DURATION_SECONDS" -le 31536000 ]] || die '管理员入口有效期必须为 300-31536000 秒。'
read -r -p 'CAPTCHA provider（none/cap/turnstile） [none]: ' CAPTCHA_PROVIDER; CAPTCHA_PROVIDER=${CAPTCHA_PROVIDER:-none}; case "$CAPTCHA_PROVIDER" in none|cap|turnstile) ;; *) die '不支持的 CAPTCHA provider。';; esac; read -r -s -p 'CAP secret（可留空）: ' CAP_SECRET; printf '\n'; read -r -s -p 'Turnstile secret（可留空）: ' TURNSTILE_SECRET; printf '\n'; read -r -p 'CAP 服务 URL（可留空）: ' CAP_SERVER_URL
read -r -p '图源 Unsplash API key（可留空）: ' UNSPLASH_ACCESS_KEY; read -r -p '图源 Pexels API key（可留空）: ' PEXELS_API_KEY; read -r -p '图源 Pixabay API key（可留空）: ' PIXABAY_API_KEY; read -r -p '图源 Bing API key（可留空）: ' BING_API_KEY
NOTIFY_PROVIDER=""; while [[ -z "$NOTIFY_PROVIDER" ]]; do read -r -p '通知渠道（telegram/webhook/lark/dingtalk/resend/sendgrid）: ' NOTIFY_PROVIDER; done
case "$NOTIFY_PROVIDER" in telegram) read -r -p 'Telegram bot token: ' N_TOKEN; read -r -p 'Telegram chat ID: ' N_CHAT_ID; NOTIFY_CONFIG=$(node -e 'console.log(JSON.stringify({token:process.argv[1],chatId:process.argv[2]}))' "$N_TOKEN" "$N_CHAT_ID");; webhook|lark|dingtalk) read -r -p 'Webhook URL: ' N_URL; [[ "$N_URL" == https://* ]] || die 'Webhook URL 必须使用 HTTPS。'; NOTIFY_CONFIG=$(node -e 'console.log(JSON.stringify({url:process.argv[1]}))' "$N_URL");; resend|sendgrid) read -r -p 'API key: ' N_KEY; read -r -p '发件人邮箱: ' N_FROM; read -r -p '收件人邮箱: ' N_TO; NOTIFY_CONFIG=$(node -e 'console.log(JSON.stringify({apiKey:process.argv[1],from:process.argv[2],to:process.argv[3]}))' "$N_KEY" "$N_FROM" "$N_TO");; *) die '不支持的通知渠道。'; esac
mkdir -p "$APP_DIR"; cp -a "$SCRIPT_DIR/." "$APP_DIR/"; mkdir -p "$APP_DIR/data" "$APP_DIR/certs" "$APP_DIR/logs"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
openssl req -x509 -newkey rsa:4096 -nodes -days 825 -subj "/CN=${PUBLIC_HOST}" -addext "subjectAltName=${SAN}" -keyout "$APP_DIR/certs/server.key" -out "$APP_DIR/certs/server.crt" >/dev/null 2>&1 || die '证书生成失败。'
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=$PORT
HTTPS=true
TLS_KEY_FILE=$APP_DIR/certs/server.key
TLS_CERT_FILE=$APP_DIR/certs/server.crt
DATABASE_PATH=$APP_DIR/data/omniwall.sqlite
TRUST_PROXY=false
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$(printf '%q' "$ADMIN_PASSWORD")
ADMIN_PATH_TOKEN=$ADMIN_PATH_TOKEN
ADMIN_PATH_DURATION_SECONDS=$ADMIN_PATH_DURATION_SECONDS
CAPTCHA_PROVIDER=$CAPTCHA_PROVIDER
CAP_SERVER_URL=$(printf '%q' "$CAP_SERVER_URL")
CAP_SECRET=$(printf '%q' "$CAP_SECRET")
TURNSTILE_SECRET=$(printf '%q' "$TURNSTILE_SECRET")
UNSPLASH_ACCESS_KEY=$(printf '%q' "$UNSPLASH_ACCESS_KEY")
PEXELS_API_KEY=$(printf '%q' "$PEXELS_API_KEY")
PIXABAY_API_KEY=$(printf '%q' "$PIXABAY_API_KEY")
BING_API_KEY=$(printf '%q' "$BING_API_KEY")
NOTIFICATION_PROVIDER=$NOTIFY_PROVIDER
NOTIFICATION_CONFIG=$(node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.argv[1])))' "$NOTIFY_CONFIG")
PUBLIC_BASE_URL=https://${PUBLIC_HOST}:${PORT}
EOF
chown -R "$APP_USER:$APP_USER" "$APP_DIR"; chmod 600 "$APP_DIR/.env" "$APP_DIR/certs/server.key"; chmod 644 "$APP_DIR/certs/server.crt"
(cd "$APP_DIR" && npm ci --omit=dev)
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=OmniWall Node.js server
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$NODE_BIN $APP_DIR/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/data $APP_DIR/logs
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now "$SERVICE_NAME"
say "安装完成：https://${PUBLIC_HOST}:${PORT}（自签证书，请导入 certs/server.crt）"
say "管理员入口（请立即保存，仅显示一次）：https://${PUBLIC_HOST}:${PORT}/admin/${ADMIN_PATH_TOKEN}"
