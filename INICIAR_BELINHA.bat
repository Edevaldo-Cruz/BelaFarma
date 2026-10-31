@echo off
title Belinha - Bela Farma Sul (Servidor Backend com Auto-Recuperacao)
color 0A
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo       🌸 DROGARIA BELA FARMA - SERVIDOR BACKEND COM AUTO-RECUPERACAO
echo ======================================================================
echo.

:: 1. Tentar gerenciar via PM2 (Process Manager 24/7)
call pm2 start ecosystem.config.cjs >nul 2>&1
if %errorlevel% equ 0 (
    call pm2 save >nul 2>&1
    echo [OK] Servidor iniciado e protegido pelo PM2!
    echo [OK] Se houver qualquer oscilacao, o PM2 reinicia o servidor em 2 segundos.
    echo.
    call pm2 status
    echo.
    echo A janela pode ser fechada com seguranca. O servidor continua ativo em segundo plano.
    echo Pressione qualquer tecla para ver os logs ao vivo ou feche a janela:
    pause >nul
    call pm2 logs belafarma-backend
    exit /b 0
)

:: 2. Fallback direto com Loop Guardiao Infinito (Watchdog)
:loop
echo [%date% %time%] Iniciando servidor Node com auto-recuperacao...
echo [INFO] Servidor rodando na porta 3001.

:: Limpa qualquer processo fantasma na porta 3001 antes de subir
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

node --dns-result-order=ipv4first backend/server.js

echo.
echo ======================================================================
echo [ALERTA] Servidor caiu ou foi interrompido em %time%!
echo [ALERTA] Reiniciando automaticamente em 3 segundos...
echo ======================================================================
echo.
timeout /t 3 >nul
goto loop