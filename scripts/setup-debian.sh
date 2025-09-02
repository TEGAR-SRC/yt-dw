#!/usr/bin/env bash
# Automated setup script for fresh Debian/Ubuntu server
# Installs system packages, Node.js LTS, clones (optional) or sets up current project, and starts app.
# Usage (existing project directory):
#   chmod +x scripts/setup-debian.sh
#   sudo scripts/setup-debian.sh
# Usage (remote fresh server without code):
#   curl -fsSL https://raw.githubusercontent.com/TEGAR-SRC/yt-dw/main/scripts/setup-debian.sh | sudo bash -s -- -c
# Flags:
#   -c|--clone <repo_url>   Clone repository (default: skip)
#   -b|--branch <branch>    Branch to checkout (default: main)
#   -p|--project <dir>      Target project directory (default: /opt/yt-converter)
#   --no-build-frontend     Skip frontend build
#   --pnpm                  Use pnpm if available / install it
#   --yarn                  Use yarn instead of npm
#   --dev                   Install dev tools (build-essential)
#   --no-service            Skip creating systemd service
#   --port <port>           Override PORT env (default 3000)
#   --user <user>           Service user (default: www-data)
#   --skip-update           Skip apt update/upgrade
set -euo pipefail

COLOR_GREEN='\033[0;32m'; COLOR_RED='\033[0;31m'; COLOR_YELLOW='\033[0;33m'; COLOR_RESET='\033[0m'
log(){ echo -e "${COLOR_GREEN}[INFO]${COLOR_RESET} $*"; }
warn(){ echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $*"; }
err(){ echo -e "${COLOR_RED}[ERR ]${COLOR_RESET} $*" >&2; }

REPO_URL=""
BRANCH="main"
PROJECT_DIR="/opt/yt-converter"
BUILD_FRONTEND=1
PACKAGE_MANAGER="npm"
INSTALL_DEV=0
CREATE_SERVICE=1
PORT_OVERRIDE=3000
SERVICE_USER="www-data"
DO_APT_UPDATE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--clone) REPO_URL="$2"; shift 2;;
    -b|--branch) BRANCH="$2"; shift 2;;
    -p|--project) PROJECT_DIR="$2"; shift 2;;
    --no-build-frontend) BUILD_FRONTEND=0; shift;;
    --pnpm) PACKAGE_MANAGER="pnpm"; shift;;
    --yarn) PACKAGE_MANAGER="yarn"; shift;;
    --dev) INSTALL_DEV=1; shift;;
    --no-service) CREATE_SERVICE=0; shift;;
    --port) PORT_OVERRIDE="$2"; shift 2;;
    --user) SERVICE_USER="$2"; shift 2;;
    --skip-update) DO_APT_UPDATE=0; shift;;
    *) warn "Unknown arg $1"; shift;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  err "Please run as root (sudo)."; exit 1; fi

log "Updating system packages (this may take a while)..."
if [[ $DO_APT_UPDATE -eq 1 ]]; then
  apt-get update -y
  apt-get upgrade -y
else
  log "Skipping apt update/upgrade as requested"
fi

log "Installing base packages: curl git ca-certificates ffmpeg"
apt-get install -y curl git ca-certificates ffmpeg

if [[ $INSTALL_DEV -eq 1 ]]; then
  log "Installing build essentials"
  apt-get install -y build-essential python3 make g++
fi

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js LTS (18.x)"
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

case "$PACKAGE_MANAGER" in
  pnpm)
    if ! command -v pnpm >/dev/null 2>&1; then
      log "Installing pnpm"
      npm install -g pnpm
    fi
    ;;
  yarn)
    if ! command -v yarn >/dev/null 2>&1; then
      log "Installing yarn"
      npm install -g yarn
    fi
    ;;
  npm) : ;; # default
esac

# Clone repository if URL provided and directory missing
if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    log "Existing git repo found in $PROJECT_DIR; skipping clone"
  else
    log "Cloning $REPO_URL to $PROJECT_DIR"
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  fi
else
  if [[ ! -f package.json ]]; then
    warn "No repo URL provided and current directory lacks package.json. Provide --clone <repo> for fresh setup."
  fi
  PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
fi

cd "$PROJECT_DIR"

log "Installing backend dependencies"
case "$PACKAGE_MANAGER" in
  pnpm) pnpm install;;
  yarn) yarn install;;
  npm) npm install;;
esac

if [[ -f frontend/package.json && $BUILD_FRONTEND -eq 1 ]]; then
  log "Installing frontend dependencies"
  pushd frontend >/dev/null
  case "$PACKAGE_MANAGER" in
    pnpm) pnpm install;;
    yarn) yarn install;;
    npm) npm install;;
  esac
  log "Building frontend"
  case "$PACKAGE_MANAGER" in
    pnpm) pnpm run build;;
    yarn) yarn build;;
    npm) npm run build;;
  esac
  popd >/dev/null
else
  log "Skipping frontend build"
fi

# Create .env if doesn't exist
if [[ ! -f .env ]]; then
  log "Creating default .env"
  cat > .env <<EOF
SITE_DOMAIN=yt-converter.elfan.id
API_DOMAIN=api.yt-converter.elfan.id
PORT=${PORT_OVERRIDE}
DEBUG=0
VITE_SITE_DOMAIN=yt-converter.elfan.id
VITE_API_BASE_URL=https://api.yt-converter.elfan.id
EOF
fi

if [[ $CREATE_SERVICE -eq 1 ]]; then
  # Ensure service user exists
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating user $SERVICE_USER"
    useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi

  log "Creating systemd service file /etc/systemd/system/yt-converter.service"
  cat > /etc/systemd/system/yt-converter.service <<SERVICE
[Unit]
Description=YT Converter Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT_OVERRIDE}
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=${SERVICE_USER}
Group=${SERVICE_USER}
# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
SERVICE

  log "Reloading systemd daemon"
  systemctl daemon-reload
  log "Enabling and starting service"
  systemctl enable yt-converter.service
  systemctl restart yt-converter.service || systemctl start yt-converter.service
  systemctl --no-pager status yt-converter.service || true
else
  log "Skipping systemd service creation. Starting app in background with nohup"
  nohup node server.js >/var/log/yt-converter.out 2>&1 &
fi

log "Setup complete." 
log "App should be reachable on port ${PORT_OVERRIDE}." 
