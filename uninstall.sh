#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/omniwall-server}"
SERVICE_NAME="${SERVICE_NAME:-omniwall}"
[[ $EUID -eq 0 ]] || { printf '请以 root 运行。\n' >&2; exit 1; }
printf '此操作将删除 systemd 服务、安装目录、SQLite、.env、日志和证书：%s\n' "$APP_DIR"
read -r -p '请输入 DELETE-OMNIWALL 以确认： ' confirm
[[ "$confirm" == DELETE-OMNIWALL ]] || { printf '未确认，未执行任何操作。\n'; exit 0; }
systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
rm -rf -- "$APP_DIR"
printf '已删除服务和安装目录：%s\n' "$APP_DIR"
