#!/bin/bash

# Script to deploy the backend fix to production VPS
# Author: Antigravity Agent
# Date: 2026-02-02

PROD_USER="ed"
PROD_IP="192.168.1.10"
REMOTE_DIR="~/projects/BelaFarma"

echo "==============================================="
echo "   DEPLOYING BACKEND FIX TO PRODUCTION"
echo "==============================================="
echo ""
echo "Target: $PROD_USER@$PROD_IP"
echo "File: backend/server.js"
echo ""

# 1. Copy the fixed file
echo "1. Uploading fixed server.js..."
scp backend/server.js "$PROD_USER@$PROD_IP:$REMOTE_DIR/backend/server.js"

if [ $? -eq 0 ]; then
    echo "   ✅ Upload successful."
else
    echo "   ❌ Upload failed. Please check connection and paths."
    exit 1
fi

# 2. Restart backend service
echo ""
echo "2. Restarting backend service on VPS..."
ssh -t "$PROD_USER@$PROD_IP" "cd $REMOTE_DIR && docker-compose restart backend"

if [ $? -eq 0 ]; then
    echo ""
    echo "   ✅ Backend restarted successfully."
    echo "   🚀 FIX DEPLOYED! Please test the application in browser."
else
    echo ""
    echo "   ⚠️  Could not restart backend automatically. You may need to do it manually."
fi
