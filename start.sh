#!/usr/bin/env bash
set -e

echo ""
echo "  ██╗   ██╗ ██████╗ ██╗  ████████╗██████╗ ██████╗ ██╗██╗   ██╗███████╗"
echo "  ██║   ██║██╔═══██╗██║  ╚══██╔══╝██╔══██╗██╔══██╗██║██║   ██║██╔════╝"
echo "  ██║   ██║██║   ██║██║     ██║   ██║  ██║██████╔╝██║██║   ██║█████╗  "
echo "  ╚██╗ ██╔╝██║   ██║██║     ██║   ██║  ██║██╔══██╗██║╚██╗ ██╔╝██╔══╝  "
echo "   ╚████╔╝ ╚██████╔╝███████╗██║   ██████╔╝██║  ██║██║ ╚████╔╝ ███████╗"
echo "    ╚═══╝   ╚═════╝ ╚══════╝╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚══════╝"
echo ""
echo "  PenServe 2 — Starting server..."
echo ""

if ! command -v node &> /dev/null; then
  echo "  [ERROR] Node.js is not installed."
  echo "  Install it from: https://nodejs.org"
  exit 1
fi

# Auto install if node_modules missing
if [ ! -d "$(dirname "$0")/node_modules" ]; then
  echo "  [WAIT] Installing packages..."
  cd "$(dirname "$0")" && npm install
  echo "  [ OK ] Packages installed"
fi

node "$(dirname "$0")/server.js"
