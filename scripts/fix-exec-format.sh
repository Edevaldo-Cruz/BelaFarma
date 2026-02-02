#!/bin/bash

# Script to fix Exec format error by ensuring clean build
PROD_USER="ed"
PROD_IP="192.168.1.9"
REMOTE_DIR="~/projects/BelaFarma"

echo "1. Uploading backend/.dockerignore..."
scp backend/.dockerignore "$PROD_USER@$PROD_IP:$REMOTE_DIR/backend/.dockerignore"

echo "2. Rebuilding backend on VPS (clean build)..."
ssh -t "$PROD_USER@$PROD_IP" "cd $REMOTE_DIR && docker-compose down && docker-compose build --no-cache backend && docker-compose up -d"

echo "Done."
