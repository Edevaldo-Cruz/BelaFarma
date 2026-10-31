@echo off
title Belinha - Bela Farma Sul (Servidor Backend com Auto-Recuperacao 24/7)
color 0A
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo       🌸 DROGARIA BELA FARMA - SERVIDOR BACKEND COM AUTO-RECUPERACAO 24/7
echo ======================================================================
echo.

:loop
echo [%date% %time%] Verificando e liberando portas locais (3001 e 80)...

:: 1. Limpa qualquer processo fantasma segurando as portas antes de subir
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :80 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo [%date% %time%] Iniciando servidor BelaFarma com protecao ativa...
echo [INFO] Servidor ativo em:
echo   - Local: http://localhost:3001
echo   - Rede:  http://192.168.1.4:3001
echo   - Porta: 80 (compatibilidade com Cloudflare)
echo.

node --dns-result-order=ipv4first backend/server.js

echo.
echo ======================================================================
echo [ALERTA] O servidor encerrou ou reiniciou em %time%!
echo [AUTO-RECUPERACAO] Subindo o servidor novamente em 2 segundos...
echo ======================================================================
echo.
timeout /t 2 >nul
goto loop