@echo off
setlocal EnableDelayedExpansion

set PROD_USER=ed
set PROD_IP=192.168.1.70
set REMOTE_DIR=/home/ed/projects/BelaFarma

echo =======================================================
echo    DEPLOY LIMPO E COMPLETO - BELAFARMA (RASPBERRY PI)
echo =======================================================
echo.

echo [1/3] Enviando configuracoes .env atualizadas...
echo Digite a senha (2494) se solicitado:
scp .env %PROD_USER%@%PROD_IP%:%REMOTE_DIR%/.env

echo.
echo [2/3] Atualizando e Reconstruindo na VPS (192.168.1.70)...
echo - Resetando para branch main
echo - Derrubando containers antigos
echo - Limpando imagens orfas
echo - Reconstruindo sem cache (--no-cache)
echo - Subindo containers
echo.
echo Digite a senha (2494) se solicitado:

ssh -t %PROD_USER%@%PROD_IP% "cd %REMOTE_DIR% && git fetch origin && git reset --hard origin/main && docker-compose down --remove-orphans && docker image prune -f && docker-compose build --no-cache && docker-compose up -d && docker-compose ps"

echo.
echo =======================================================
echo    DEPLOY CONCLUIDO COM SUCESSO!
echo    Servidor online em http://192.168.1.70
echo =======================================================
pause

