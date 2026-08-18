@echo off
chcp 65001 > nul
set PROD_USER=ed
set PROD_IP=192.168.1.70
set REMOTE_DIR=~/projects/BelaFarma

echo =======================================================
echo    🚀 DEPLOY HARD & LIMPO - BELAFARMA (RASPBERRY PI)
echo =======================================================
echo.

echo [1/4] Fazendo Git Commit e Push local...
git add .
git commit -m "feat: modulo bloco de notas e deploy hard limpo"
git push origin main

echo.
echo [2/4] Enviando configuracoes .env atualizadas...
scp .env %PROD_USER%@%PROD_IP%:%REMOTE_DIR%/.env

echo.
echo [3/4] Executando Hard Clean e Rebuild na VPS (192.168.1.70)...
echo - Resetando branch main na VPS...
echo - Derrubando containers antigos...
echo - Reconstruindo imagens sem cache (--no-cache)...
echo - Subindo containers em background...
echo.

ssh -t %PROD_USER%@%PROD_IP% "cd %REMOTE_DIR% && git fetch origin && git reset --hard origin/main && docker-compose down --remove-orphans && docker image prune -f && docker-compose build --no-cache && docker-compose up -d && docker-compose ps"

echo.
echo =======================================================
echo    ✅ DEPLOY HARD CONCLUIDO COM SUCESSO!
echo    🌐 Servidor online em http://192.168.1.70
echo =======================================================
pause
