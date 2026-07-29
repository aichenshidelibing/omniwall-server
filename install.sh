#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
GENERATED_ADMIN_PASSWORD=""
ADMIN_PATH_SOURCE="fallback"

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[1;33m警告：%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

trim() {
  local s="$*"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

read_env_value() {
  local key="$1" line value
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  if [[ "$value" == "\""*"\"" && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\"/\"}"
    value="${value//\\\$/\$}"
    value="${value//\\\`/\`}"
    value="${value//\\\\/\\}"
  elif [[ "$value" == "'"*"'" && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

prompt_default() {
  local label="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$label" "$default" >&2
  else
    printf '%s: ' "$label" >&2
  fi
  read -r value
  value="$(trim "$value")"
  printf '%s' "${value:-$default}"
}

prompt_secret() {
  local label="$1" value
  printf '%s: ' "$label" >&2
  read -r -s value
  printf '\n' >&2
  printf '%s' "$value"
}

prompt_yes_no() {
  local label="$1" default="${2:-y}" answer suffix
  if [[ "$default" == "y" ]]; then suffix="Y/n"; else suffix="y/N"; fi
  while true; do
    printf '%s [%s]: ' "$label" "$suffix" >&2
    read -r answer
    answer="$(trim "$answer")"
    [[ -z "$answer" ]] && answer="$default"
    case "${answer,,}" in
      y|yes|是) return 0 ;;
      n|no|否) return 1 ;;
      *) warn "请输入 y 或 n" ;;
    esac
  done
}

validate_admin_username() {
  [[ "$1" =~ ^[A-Za-z0-9_-]{3,32}$ ]]
}

validate_int_min() {
  local value="$1" min="$2"
  [[ "$value" =~ ^[0-9]+$ ]] && (( value >= min ))
}

validate_url_optional() {
  local value="$1"
  [[ -z "$value" || "$value" =~ ^https?://[^[:space:]]+$ ]]
}

validate_port_binding() {
  local value="$1" host port
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    port="$value"
  elif [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]+$ || "$value" =~ ^(127\.0\.0\.1|0\.0\.0\.0):[0-9]+$ ]]; then
    host="${value%:*}"
    port="${value##*:}"
    if [[ "$host" != "localhost" ]]; then
      IFS='.' read -r a b c d <<< "$host"
      for octet in "$a" "$b" "$c" "$d"; do
        [[ "$octet" =~ ^[0-9]+$ ]] && (( octet >= 0 && octet <= 255 )) || return 1
      done
    fi
  else
    return 1
  fi
  [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 ))
}

normalize_bool() {
  local value="${1,,}"
  case "$value" in
    1|true|yes|y|on|是) printf 'true' ;;
    0|false|no|n|off|否) printf 'false' ;;
    *) return 1 ;;
  esac
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr -d '\n'
  else
    tr -dc 'A-Za-z0-9_@%+=:,./-' < /dev/urandom | head -c 48
  fi
}

env_quote() {
  local value="$1"
  if [[ -z "$value" ]]; then
    printf ''
  elif [[ "$value" =~ ^[A-Za-z0-9_./:@%+=,-]+$ ]]; then
    printf '%s' "$value"
  else
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//\$/\\\$}"
    value="${value//\`/\\\`}"
    printf '"%s"' "$value"
  fi
}

backup_file() {
  local file="$1" stamp backup
  [[ -f "$file" ]] || return 0
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup="${file}.backup-${stamp}"
  cp "$file" "$backup"
  info "已备份：$backup"
}

require_tools() {
  command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装 Docker。"
  docker compose version >/dev/null 2>&1 || die "未找到 Docker Compose v2，请确认 'docker compose version' 可用。"
}

ask_validated() {
  local label="$1" default="$2" validator="$3" value
  while true; do
    value="$(prompt_default "$label" "$default")"
    if "$validator" "$value"; then
      printf '%s' "$value"
      return 0
    fi
    warn "输入无效，请重新输入。"
  done
}

ask_int() {
  local label="$1" default="$2" min="$3" value
  while true; do
    value="$(prompt_default "$label" "$default")"
    if validate_int_min "$value" "$min"; then
      printf '%s' "$value"
      return 0
    fi
    warn "请输入大于等于 ${min} 的整数。"
  done
}

ask_bool() {
  local label="$1" default="$2" value normalized
  while true; do
    value="$(prompt_default "$label" "$default")"
    if normalized="$(normalize_bool "$value")"; then
      printf '%s' "$normalized"
      return 0
    fi
    warn "请输入 true/false、yes/no 或 y/n。"
  done
}

ask_admin_password() {
  local existing="${1:-}" first second generated
  if [[ -n "$existing" ]]; then
    info "检测到已有 ADMIN_PASSWORD，默认将保留。"
    if prompt_yes_no "是否更换 ADMIN_PASSWORD？更换后旧加密数据可能无法解密" "n"; then
      printf 'CHANGE ADMIN PASSWORD 以确认更换：' >&2
      read -r confirm
      [[ "$confirm" == "CHANGE ADMIN PASSWORD" ]] || die "未确认更换 ADMIN_PASSWORD，已退出。"
    else
      printf '%s' "$existing"
      return 0
    fi
  fi

  if prompt_yes_no "是否自动生成 32 位以上强密码？" "y"; then
    generated="$(generate_secret)"
    GENERATED_ADMIN_PASSWORD="$generated"
    printf '%s' "$generated"
    return 0
  fi

  while true; do
    first="$(prompt_secret "请输入 ADMIN_PASSWORD（至少 32 位）")"
    if (( ${#first} < 32 )); then
      warn "ADMIN_PASSWORD 至少需要 32 位。"
      continue
    fi
    second="$(prompt_secret "请再次输入 ADMIN_PASSWORD")"
    if [[ "$first" != "$second" ]]; then
      warn "两次输入不一致。"
      continue
    fi
    printf '%s' "$first"
    return 0
  done
}

choose_mode() {
  local default_mode="${1:-2}" mode
  say "选择部署模式"
  info "1) 本地/LAN/直接端口 demo（HTTP 可用于测试，TRUST_PROXY=false）"
  info "2) 生产 HTTPS 反向代理（推荐，端口只绑定 127.0.0.1，TRUST_PROXY=true）"
  while true; do
    mode="$(prompt_default "请选择" "$default_mode")"
    case "$mode" in
      1|2) printf '%s' "$mode"; return 0 ;;
      *) warn "请输入 1 或 2。" ;;
    esac
  done
}

write_env_file() {
  local tmp="$ENV_FILE.tmp"
  cat > "$tmp" <<EOF_ENV
# Generated by OmniWall install.sh
# Server
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=./data/omniwall.sqlite
# Host port binding for Docker Compose. Use 3000 for direct demo, or 127.0.0.1:3000 behind a local reverse proxy.
OMNIWALL_PORT_BINDING=$(env_quote "$OMNIWALL_PORT_BINDING")
# Keep false for direct/public :3000 access. Set true only behind a trusted reverse proxy that controls X-Forwarded-* headers.
TRUST_PROXY=$TRUST_PROXY
MAX_REQUEST_BODY_BYTES=$MAX_REQUEST_BODY_BYTES
SCHEDULE_INTERVAL_SECONDS=$SCHEDULE_INTERVAL_SECONDS
RUN_SCHEDULED_ON_START=$RUN_SCHEDULED_ON_START
PUBLIC_BASE_URL=$(env_quote "$PUBLIC_BASE_URL")

# Required admin credentials
ADMIN_USERNAME=$(env_quote "$ADMIN_USERNAME")
ADMIN_PASSWORD=$(env_quote "$ADMIN_PASSWORD")

# Optional image providers; configure at least one of these for non-Bing sources
UNSPLASH_ACCESS_KEY=$(env_quote "$UNSPLASH_ACCESS_KEY")
PEXELS_API_KEY=$(env_quote "$PEXELS_API_KEY")
PIXABAY_API_KEY=$(env_quote "$PIXABAY_API_KEY")

# Optional site branding
SITE_NAME=$(env_quote "$SITE_NAME")
SITE_FAVICON=$(env_quote "$SITE_FAVICON")

# Optional /api/bg signing secret; recommended to use a separate random value.
BG_TOKEN_SECRET=$(env_quote "$BG_TOKEN_SECRET")

# Optional Cloudflare Turnstile; both keys are required for Turnstile to work.
TURNSTILE_SITE_KEY=$(env_quote "$TURNSTILE_SITE_KEY")
TURNSTILE_SECRET_KEY=$(env_quote "$TURNSTILE_SECRET_KEY")

# Optional external moderation / translation
OPENAI_API_KEY=$(env_quote "$OPENAI_API_KEY")
TRANSLATE_API_URL=$(env_quote "$TRANSLATE_API_URL")
TRANSLATE_API_KEY=$(env_quote "$TRANSLATE_API_KEY")
EOF_ENV
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE" || true
}

http_base_for_binding() {
  local binding="$1" port
  if [[ "$binding" =~ ^[0-9]+$ ]]; then
    port="$binding"
  else
    port="${binding##*:}"
  fi
  printf 'http://127.0.0.1:%s' "$port"
}

wait_for_http() {
  local url="$1" tries="${2:-30}" i
  command -v curl >/dev/null 2>&1 || return 2
  for i in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_and_init() {
  local base init_url init_result
  require_tools
  say "启动 OmniWall Docker 服务"
  (cd "$ROOT_DIR" && docker compose up -d --build)

  base="$(http_base_for_binding "$OMNIWALL_PORT_BINDING")"
  if wait_for_http "$base/docs" 45; then
    info "服务已就绪：$base/docs"
  else
    warn "未能确认 /docs 已就绪。最近日志如下："
    (cd "$ROOT_DIR" && docker compose logs --tail=80 omniwall || true)
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    warn "未找到 curl，跳过数据库初始化检查。"
    info "可稍后手动执行：curl -H 'Authorization: Bearer <ADMIN_PASSWORD>' '$base/api/d1/init'"
    return 0
  fi

  init_url="$base/api/d1/init"
  if init_result="$(curl -fsS -H "Authorization: Bearer $ADMIN_PASSWORD" "$init_url" 2>/dev/null)" && grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<< "$init_result"; then
    info "数据库初始化检查通过。"
  else
    warn "数据库初始化接口未返回 ok=true。最近日志如下："
    (cd "$ROOT_DIR" && docker compose logs --tail=80 omniwall || true)
  fi
}

site_origin_for_summary() {
  local base
  if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
    base="${PUBLIC_BASE_URL%/}"
  else
    base="$(http_base_for_binding "${OMNIWALL_PORT_BINDING:-3000}")"
  fi
  printf '%s' "$base"
}

current_admin_suffix() {
  local fallback="${ADMIN_USERNAME:-admin}" suffix=""
  ADMIN_PATH_SOURCE="fallback"

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    suffix="$(cd "$ROOT_DIR" && docker compose exec -T omniwall node --input-type=module -e '
import Database from "better-sqlite3";
const dbPath = process.env.DATABASE_PATH || "/app/data/omniwall.sqlite";
const db = new Database(dbPath, { readonly: true });
const get = (key) => {
  try { return db.prepare("SELECT value FROM admin_config WHERE key = ?").get(key)?.value || ""; }
  catch { return ""; }
};
const username = get("config:admin_username") || process.env.ADMIN_USERNAME || "admin";
const firstDone = get("config:first_login_done");
const savedDate = get("config:daily_path_date");
const savedPath = get("config:daily_path");
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
if (!firstDone) console.log(username);
else if (savedPath && savedDate === today) console.log(savedPath);
else console.log(username);
' 2>/dev/null | tail -n 1 || true)"
    if [[ -n "$suffix" ]]; then
      ADMIN_PATH_SOURCE="database"
      printf '%s' "$suffix"
      return 0
    fi
  fi

  printf '%s' "$fallback"
}

print_completion_summary() {
  local base suffix login_url dashboard_url docs_url admin_password_display proxy_mode bg_secret_hint image_provider_hint
  base="$(site_origin_for_summary)"
  suffix="$(current_admin_suffix)"
  login_url="$base/$suffix/login"
  dashboard_url="$base/$suffix/dashboard"
  docs_url="$base/docs"
  admin_password_display="${ADMIN_PASSWORD:-<未配置>}"

  if [[ "${TRUST_PROXY:-false}" == "true" ]]; then
    proxy_mode="可信 HTTPS 反向代理模式（TRUST_PROXY=true）"
  else
    proxy_mode="直接端口/demo 模式（TRUST_PROXY=false）"
  fi

  if [[ -n "${BG_TOKEN_SECRET:-}" ]]; then
    bg_secret_hint="已配置独立 BG_TOKEN_SECRET"
  else
    bg_secret_hint="未配置，/api/bg 将 fallback 到 ADMIN_PASSWORD"
  fi

  if [[ -n "${UNSPLASH_ACCESS_KEY:-}" || -n "${PEXELS_API_KEY:-}" || -n "${PIXABAY_API_KEY:-}" ]]; then
    image_provider_hint="已配置至少一个第三方图片源 Key"
  else
    image_provider_hint="未配置第三方图片源 Key；仍可使用 Bing 每日壁纸，建议稍后补充图片源 Key"
  fi

  say "部署完成信息"
  printf '\n'
  printf '┌────────────────────────────────────────────────────────────\n'
  printf '│ OmniWall 安装/配置已完成\n'
  printf '├────────────────────────────────────────────────────────────\n'
  printf '│ 站点地址：%s\n' "$base/"
  printf '│ 在线文档：%s\n' "$docs_url"
  printf '│ 后台后缀：/%s\n' "$suffix"
  printf '│ 后台登录：%s\n' "$login_url"
  printf '│ 后台面板：%s\n' "$dashboard_url"
  printf '├────────────────────────────────────────────────────────────\n'
  printf '│ 管理员用户名：%s\n' "${ADMIN_USERNAME:-admin}"
  printf '│ 管理员密码：%s\n' "$admin_password_display"
  printf '├────────────────────────────────────────────────────────────\n'
  printf '│ .env 文件：%s\n' "$ENV_FILE"
  printf '│ 数据库文件：%s\n' "$ROOT_DIR/data/omniwall.sqlite"
  printf '│ 端口绑定：%s -> 容器 3000\n' "${OMNIWALL_PORT_BINDING:-3000}"
  printf '│ 部署模式：%s\n' "$proxy_mode"
  printf '│ /api/bg 密钥：%s\n' "$bg_secret_hint"
  printf '│ 图片源状态：%s\n' "$image_provider_hint"
  printf '└────────────────────────────────────────────────────────────\n'
  printf '\n'

  warn "请立即保存上面的管理员用户名、密码和后台入口；管理员密码只保存在 .env 中。"
  if [[ "$ADMIN_PATH_SOURCE" == "fallback" ]]; then
    warn "当前后台后缀通常是首次登录后缀；首次登录成功后系统会自动生成每日随机后台后缀。"
  else
    warn "后台后缀来自当前数据库状态；首次登录后或每天轮换后以后端/通知中的新后缀为准。"
  fi
  warn "生产环境后台登录和 /api/bg Cookie 功能必须通过 HTTPS。"
}

configure() {
  local mode existing_admin existing_bg existing_value default_binding default_trust generated_bg default_admin_username default_max_body default_schedule default_run_on_start
  local change_action="new"

  if [[ -f "$ENV_FILE" ]]; then
    say "检测到已有 .env"
    info "1) 保留现有配置，仅可选择启动/初始化"
    info "2) 交互式重新配置（会先备份 .env）"
    info "3) 退出"
    while true; do
      change_action="$(prompt_default "请选择" "1")"
      case "$change_action" in
        1) return 10 ;;
        2) backup_file "$ENV_FILE"; break ;;
        3) exit 0 ;;
        *) warn "请输入 1、2 或 3。" ;;
      esac
    done
  fi

  mode="$(choose_mode "2")"
  if [[ "$mode" == "2" ]]; then
    default_binding="$(read_env_value OMNIWALL_PORT_BINDING || true)"; default_binding="${default_binding:-127.0.0.1:3000}"
    default_trust="$(read_env_value TRUST_PROXY || true)"; default_trust="${default_trust:-true}"
  else
    default_binding="$(read_env_value OMNIWALL_PORT_BINDING || true)"; default_binding="${default_binding:-3000}"
    default_trust="$(read_env_value TRUST_PROXY || true)"; default_trust="${default_trust:-false}"
  fi

  OMNIWALL_PORT_BINDING="$(ask_validated "Docker 宿主机端口绑定" "$default_binding" validate_port_binding)"
  TRUST_PROXY="$(ask_bool "是否信任反向代理 TRUST_PROXY" "$default_trust")"
  if [[ "$TRUST_PROXY" == "true" ]]; then
    warn "只有在可信 HTTPS 反向代理后面，且外部不能直连容器端口时，才应启用 TRUST_PROXY=true。"
  fi

  while true; do
    PUBLIC_BASE_URL="$(prompt_default "公网访问地址 PUBLIC_BASE_URL（可留空，例如 https://example.com）" "$(read_env_value PUBLIC_BASE_URL || true)")"
    validate_url_optional "$PUBLIC_BASE_URL" && break
    warn "URL 需以 http:// 或 https:// 开头，或留空。"
  done
  if [[ "$mode" == "2" ]]; then
    if [[ -z "$PUBLIC_BASE_URL" ]]; then
      warn "生产模式建议设置 HTTPS 的 PUBLIC_BASE_URL，通知中会使用它生成完整链接。"
    elif [[ "$PUBLIC_BASE_URL" == http://* ]]; then
      warn "生产后台登录需要 HTTPS；当前 PUBLIC_BASE_URL 是 HTTP。"
      prompt_yes_no "确认继续使用 HTTP？" "n" || exit 1
    fi
  fi

  default_admin_username="$(read_env_value ADMIN_USERNAME || true)"
  default_admin_username="${default_admin_username:-admin}"
  ADMIN_USERNAME="$(ask_validated "后台用户名 ADMIN_USERNAME" "$default_admin_username" validate_admin_username)"
  existing_admin="$(read_env_value ADMIN_PASSWORD || true)"
  ADMIN_PASSWORD="$(ask_admin_password "$existing_admin")"

  UNSPLASH_ACCESS_KEY="$(prompt_default "Unsplash Access Key（可留空）" "$(read_env_value UNSPLASH_ACCESS_KEY || true)")"
  PEXELS_API_KEY="$(prompt_default "Pexels API Key（可留空）" "$(read_env_value PEXELS_API_KEY || true)")"
  PIXABAY_API_KEY="$(prompt_default "Pixabay API Key（可留空）" "$(read_env_value PIXABAY_API_KEY || true)")"

  SITE_NAME="$(prompt_default "站点名称 SITE_NAME" "$(read_env_value SITE_NAME || true)")"
  SITE_NAME="${SITE_NAME:-OmniWall}"
  SITE_FAVICON="$(prompt_default "站点图标 SITE_FAVICON（可留空）" "$(read_env_value SITE_FAVICON || true)")"

  existing_bg="$(read_env_value BG_TOKEN_SECRET || true)"
  if [[ -n "$existing_bg" ]]; then
    BG_TOKEN_SECRET="$(prompt_default "BG_TOKEN_SECRET（建议保留已有值）" "$existing_bg")"
  else
    generated_bg="$(generate_secret)"
    BG_TOKEN_SECRET="$(prompt_default "BG_TOKEN_SECRET（默认生成独立随机值）" "$generated_bg")"
  fi

  TURNSTILE_SITE_KEY="$(prompt_default "Turnstile Site Key（可留空）" "$(read_env_value TURNSTILE_SITE_KEY || true)")"
  TURNSTILE_SECRET_KEY="$(prompt_default "Turnstile Secret Key（可留空，输入不会隐藏；如需隐藏可稍后手动编辑 .env）" "$(read_env_value TURNSTILE_SECRET_KEY || true)")"
  if [[ -n "$TURNSTILE_SITE_KEY" && -z "$TURNSTILE_SECRET_KEY" || -z "$TURNSTILE_SITE_KEY" && -n "$TURNSTILE_SECRET_KEY" ]]; then
    warn "Turnstile 需要 Site Key 和 Secret Key 同时存在才会生效。"
  fi

  default_max_body="$(read_env_value MAX_REQUEST_BODY_BYTES || true)"; default_max_body="${default_max_body:-1048576}"
  MAX_REQUEST_BODY_BYTES="$(ask_int "最大请求体字节数 MAX_REQUEST_BODY_BYTES" "$default_max_body" 1)"
  default_schedule="$(read_env_value SCHEDULE_INTERVAL_SECONDS || true)"; default_schedule="${default_schedule:-900}"
  SCHEDULE_INTERVAL_SECONDS="$(ask_int "定时维护间隔秒数 SCHEDULE_INTERVAL_SECONDS" "$default_schedule" 1)"
  default_run_on_start="$(read_env_value RUN_SCHEDULED_ON_START || true)"; default_run_on_start="${default_run_on_start:-true}"
  RUN_SCHEDULED_ON_START="$(ask_bool "启动后立即运行一次维护 RUN_SCHEDULED_ON_START" "$default_run_on_start")"

  OPENAI_API_KEY="$(prompt_default "OpenAI Moderation API Key（可留空）" "$(read_env_value OPENAI_API_KEY || true)")"
  TRANSLATE_API_URL="$(prompt_default "自定义翻译 API URL（可留空）" "$(read_env_value TRANSLATE_API_URL || true)")"
  TRANSLATE_API_KEY="$(prompt_default "自定义翻译 API Key（可留空）" "$(read_env_value TRANSLATE_API_KEY || true)")"

  write_env_file
  return 0
}

main() {
  cd "$ROOT_DIR"
  say "OmniWall Node.js + SQLite + Docker 安装向导"
  info "本脚本会生成 .env，并可选择启动 Docker Compose。"
  warn "ADMIN_PASSWORD 同时用于后台登录和加密/签名派生，上线后不要随意更换。"

  local config_status=0
  configure || config_status=$?

  if [[ "$config_status" == "10" ]]; then
    info "保留现有 .env。"
    OMNIWALL_PORT_BINDING="$(read_env_value OMNIWALL_PORT_BINDING || true)"; OMNIWALL_PORT_BINDING="${OMNIWALL_PORT_BINDING:-3000}"
    ADMIN_USERNAME="$(read_env_value ADMIN_USERNAME || true)"; ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    ADMIN_PASSWORD="$(read_env_value ADMIN_PASSWORD || true)"
    PUBLIC_BASE_URL="$(read_env_value PUBLIC_BASE_URL || true)"
    TRUST_PROXY="$(read_env_value TRUST_PROXY || true)"; TRUST_PROXY="${TRUST_PROXY:-false}"
    BG_TOKEN_SECRET="$(read_env_value BG_TOKEN_SECRET || true)"
    UNSPLASH_ACCESS_KEY="$(read_env_value UNSPLASH_ACCESS_KEY || true)"
    PEXELS_API_KEY="$(read_env_value PEXELS_API_KEY || true)"
    PIXABAY_API_KEY="$(read_env_value PIXABAY_API_KEY || true)"
  else
    info "已写入：$ENV_FILE"
  fi

  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    warn ".env 中 ADMIN_PASSWORD 为空，服务将无法启动。请编辑 .env 后重试。"
  fi

  if prompt_yes_no "是否立即构建并启动 Docker 服务？" "y"; then
    start_and_init
  else
    info "你可以稍后执行：docker compose up -d --build"
  fi

  print_completion_summary
}

main "$@"
