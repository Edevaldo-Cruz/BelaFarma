#!/bin/bash

# Script to fix database permissions and restart backend on VPS
# Author: Antigravity Agent
# Date: 2026-02-02

PROD_USER="ed"
PROD_IP="192.168.1.9"
REMOTE_DIR="~/projects/BelaFarma"

echo "==============================================="
echo "   FIXING PRODUCTION DATABASE PERMISSIONS"
echo "==============================================="
echo ""

# Fix permissions and restart
echo "Attempting to fix permissions on 'data' folder and restart..."
ssh -t "$PROD_USER@$PROD_IP" "cd $REMOTE_DIR && sudo chmod -R 777 data && docker-compose restart backend"

echo ""
echo "Done. Please wait 30 seconds and try to login again."
