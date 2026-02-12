#!/usr/bin/env bash
set -euo pipefail

echo "=== Hell2Bot Deploy (Ubuntu/Oracle) ==="

# Install Node LTS if not present
if ! command -v node &>/dev/null; then
  echo "Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

# Install PM2 globally
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

# Install dependencies
echo "Installing project dependencies..."
npm install --production

# Copy .env if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env from .env.example — EDIT IT with your real values!"
  echo "   nano .env"
  exit 1
fi

# Create data dir
mkdir -p data logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash || true

echo ""
echo "=== Deploy complete! ==="
echo "  pm2 logs hell2bot    # view logs"
echo "  pm2 status           # check status"
