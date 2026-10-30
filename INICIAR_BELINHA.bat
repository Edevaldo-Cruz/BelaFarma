@echo off
chcp 65001 >nul
title Belinha - Bela Farma Sul
color 0A
cd /d "%~dp0backend"
echo ========================================================
echo   🌸 INICIANDO BELINHA - BELA FARMA SUL
echo ========================================================
echo.
echo Servidor acessível em: http://localhost:3001
echo.
node server.js
pause