#!/bin/sh
set -e
# Copy Next.js source files (src/ needs special handling to avoid recursion)
cp -r /app/src/src/. /app/src/
# Copy config/public files (skip src, node_modules, .next)
cd /app/src
for item in *; do
  case "$item" in
    node_modules|.next|src) continue ;;
    *) cp -r "$item" /app/ ;;
  esac
done
cd /app
NEXT_PUBLIC_API_URL=http://localhost:8001 npm run build
