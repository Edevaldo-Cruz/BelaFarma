@echo off
title BELAFARMA - Windows RPA Agent
color 0A

echo ========================================================
echo       🤖 BELAFARMA - INICIANDO WINDOWS RPA AGENT 🤖       
echo ========================================================
echo.

:: 1. Define executáveis padrão
set "NODE_EXE=node"
set "NPM_CMD=npm"

:: 2. Verifica se o Node.js está instalado globalmente
where node >nul 2>nul
if %errorlevel% neq 0 (
    :: Se não está global, verifica se já baixamos a versão portátil
    if exist "node-bin\node.exe" (
        echo [INFO] Utilizando versao portatil do Node.js localizada em node-bin.
        set "NODE_EXE=node-bin\node.exe"
        set "NPM_CMD=node-bin\npm.cmd"
    ) else (
        color 0E
        echo [INFO] Node.js nao foi encontrado no sistema.
        echo [INFO] Baixando versao portatil oficial do Node.js automaticamente...
        echo [INFO] Isso pode levar cerca de 30 segundos, por favor aguarde...
        echo.
        
        :: Cria diretório para download
        mkdir node-temp >nul 2>nul
        mkdir node-bin >nul 2>nul

        :: Baixa o ZIP portátil do Node.js v20.11.0 LTS (x64) via PowerShell
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; echo '📥 Baixando arquivo ZIP...'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip' -OutFile 'node-temp\node.zip'"
        if %errorlevel% neq 0 (
            color 0C
            echo [ERRO] Falha ao baixar o Node.js. Verifique sua conexao com a internet.
            pause
            exit /b
        )

        :: Extrai o ZIP
        echo 📦 Extraindo arquivos...
        powershell -Command "Expand-Archive -Path 'node-temp\node.zip' -DestinationPath 'node-temp\extracted' -Force"
        
        :: Move para a pasta final
        echo 🚚 Configurando ambiente local...
        powershell -Command "Move-Item -Path 'node-temp\extracted\node-v20.11.0-win-x64\*' -DestinationPath 'node-bin' -Force"
        
        :: Limpa arquivos temporários
        powershell -Command "Remove-Item -Path 'node-temp' -Recurse -Force"

        if exist "node-bin\node.exe" (
            color 0A
            echo [SUCESSO] Node.js portatil instalado localmente com sucesso!
            echo.
            set "NODE_EXE=node-bin\node.exe"
            set "NPM_CMD=node-bin\npm.cmd"
        ) else (
            color 0C
            echo [ERRO] Falha ao extrair o Node.js portatil.
            pause
            exit /b
        )
    )
)

:: 3. Se a pasta node_modules não existir, roda npm install
if not exist node_modules (
    color 0E
    echo [INFO] Primeira execucao detectada. Instalando dependencias [Puppeteer]...
    echo Isso pode levar alguns minutos pois o Chromium sera baixado automaticamente.
    echo Aguarde...
    echo.
    call %NPM_CMD% install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERRO] Falha ao instalar dependencias. Verifique sua conexao com a internet.
        pause
        exit /b
    )
    echo.
    echo [INFO] Baixando navegador Chromium oficial para o Puppeteer...
    if exist "node-bin\npx.cmd" (
        call node-bin\npx.cmd puppeteer browsers install chrome
    ) else (
        call npx puppeteer browsers install chrome
    )
    color 0A
    echo.
    echo [SUCESSO] Dependencias e navegador instalados com sucesso!
    echo.
)

:: 4. Roda o agente
echo [INFO] Iniciando Agente...
%NODE_EXE% agent.js
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo --------------------------------------------------------
    echo [DICA] O agente falhou ao iniciar. 
    echo Se o erro for de "Could not find Chrome", certifique-se de que:
    echo 1. O Google Chrome oficial esta instalado no seu Windows.
    echo 2. Ou force a instalacao do Chromium do Puppeteer rodando o comando:
    echo    npx puppeteer browsers install chrome
    echo --------------------------------------------------------
    echo.
)

echo.
echo ========================================================
echo [AVISO] O Agente foi encerrado.
echo ========================================================
pause
