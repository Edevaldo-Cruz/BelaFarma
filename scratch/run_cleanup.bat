@echo off
set PROD_USER=ed
set PROD_IP=192.168.1.70
set REMOTE_DIR=~/projects/BelaFarma

echo Enviando script de limpeza para a VPS...
scp scratch\check_vps_db.js %PROD_USER%@%PROD_IP%:%REMOTE_DIR%/check_vps_db.js

echo.
echo Executando limpeza na VPS...
ssh -t %PROD_USER%@%PROD_IP% "cd %REMOTE_DIR% && node check_vps_db.js && rm check_vps_db.js"

echo.
echo Limpeza concluida!
pause
