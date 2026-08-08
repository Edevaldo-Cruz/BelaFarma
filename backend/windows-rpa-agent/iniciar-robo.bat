@echo off
title Robô de WhatsApp BelaFarma - Agente RPA
echo ============================================================
echo      INICIANDO ROBÔ DE WHATSAPP BELAFARMA (RPA AGENT)
echo ============================================================
echo.
echo Conectando ao servidor da farmácia (192.168.1.70:8085)...
echo.

IF NOT EXIST node_modules (
    echo Instalando dependencias necessarias (aguarde alguns instantes)...
    npm install
    echo.
)

node agent.js

echo.
echo ============================================================
echo O robô foi encerrado. Pressione qualquer tecla para reiniciar...
pause
