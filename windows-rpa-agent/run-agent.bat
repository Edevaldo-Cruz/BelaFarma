@echo off
title BELAFARMA - Windows RPA Agent
color 0A

echo ========================================================
echo       🤖 BELAFARMA - INICIANDO WINDOWS RPA AGENT 🤖       
echo ========================================================
echo.

:: Verifica se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO] O Node.js nao foi encontrado no seu sistema!
    echo Por favor, instale o Node.js v18 ou superior antes de rodar o agente.
    echo Baixe em: https://nodejs.org/
    echo.
    pause
    exit /b
)

:: Se a pasta node_modules não existir, roda npm install
if not exist node_modules (
    color 0E
    echo [INFO] Primeira execucao detectada. Instalando dependencias (Puppeteer)...
    echo Isso pode levar alguns minutos pois o Chromium sera baixado automaticamente.
    echo Aguarde...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERRO] Falha ao instalar dependencias. Verifique sua conexao com a internet.
        pause
        exit /b
      )
    color 0A
    echo.
    echo [SUCESSO] Dependencias instaladas com sucesso!
    echo.
)

:: Roda o agente
echo [INFO] Iniciando Agente...
node agent.js

echo.
echo ========================================================
echo [AVISO] O Agente foi encerrado.
echo ========================================================
pause
