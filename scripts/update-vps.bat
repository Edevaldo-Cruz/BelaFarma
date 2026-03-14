@echo off
set PROD_USER=ed
set PROD_IP=192.168.1.10
set REMOTE_DIR=~/projects/BelaFarma

echo ===============================================
echo    ATUALIZANDO VPS - BELAFARMA (COMPLETO)
echo ===============================================
echo.

echo 1. Enviando arquivo .env (Chaves) para a VPS...
echo Digite a senha (2494) quando solicitado.
scp .env %PROD_USER%@%PROD_IP%:%REMOTE_DIR%/.env

echo.
echo 2. Atualizando codigo e reconstruindo containers na VPS...
echo Digite a senha (2494) novamente se solicitado.
echo Isso pode demorar alguns minutos (reconstruindo o frontend)...
echo.

ssh -t %PROD_USER%@%PROD_IP% "cd %REMOTE_DIR% && git fetch origin && git reset --hard origin/main && docker-compose up -d --build"

echo.
echo ===============================================
echo TRABALHO CONCLUIDO! 
echo A Central de IA deve aparecer agora.
echo ===============================================
pause
