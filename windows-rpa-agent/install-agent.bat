@echo off
title INSTALADOR E CONFIGURADOR - BELAFARMA RPA AGENT
color 0A

echo =======================================================================
echo       🤖 INSTALADOR RESILIENTE - BELAFARMA WHATSAPP RPA AGENT 🤖       
echo =======================================================================
echo.
echo Este instalador ira verificar e configurar tudo que o seu computador
echo precisa para rodar o robo 100%% em segundo plano de forma invisivel.
echo.
echo =======================================================================
echo.

:: 1. Verifica privilegios administrativos
NET SESSION >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️  [PERMISSAO] O instalador precisa de privilegios de administrador
    echo para registrar o robo no Agendador de Tarefas do Windows (Task Scheduler).
    echo.
    echo Solicitando elevacao de privilegios automaticamente...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [✓] Privilegios administrativos confirmados!
echo.

:: 2. Define caminhos dos executaveis locais/portateis
set "NODE_EXE=node"
set "NPM_CMD=npm"
set "NPX_CMD=npx"

:: 3. Verifica Node.js
echo 🔍 1/5. Verificando ambiente Node.js...
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [✓] Node.js detectado instalado globalmente no sistema.
    for /f "tokens=*" %%i in ('node -v') do set "NODE_VERSION=%%i"
    echo     Versao: %NODE_VERSION%
) else (
    if exist "node-bin\node.exe" (
        echo [✓] Node.js portatil localizado localmente na pasta node-bin.
        set "NODE_EXE=node-bin\node.exe"
        set "NPM_CMD=node-bin\npm.cmd"
        set "NPX_CMD=node-bin\npx.cmd"
    ) else (
        echo [i] Node.js nao foi encontrado no sistema.
        echo [i] Baixando versao portatil oficial e estavel do Node.js automaticamente...
        echo     Isso garante 100%% de compatibilidade e mantem seu PC limpo!
        echo     Por favor, aguarde o download...
        echo.
        
        mkdir node-temp >nul 2>nul
        mkdir node-bin >nul 2>nul

        :: Baixa o ZIP portátil do Node.js LTS
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; echo '📥 Baixando arquivo ZIP...'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip' -OutFile 'node-temp\node.zip'"
        if %errorlevel% neq 0 (
            color 0C
            echo.
            echo ❌ [ERRO] Falha ao baixar o Node.js. Verifique sua conexao com a internet.
            pause
            exit /b
        )

        echo 📦 Extraindo arquivos de instalacao...
        powershell -Command "Expand-Archive -Path 'node-temp\node.zip' -DestinationPath 'node-temp\extracted' -Force"
        
        echo 🚚 Configurando ambiente portatil...
        powershell -Command "Move-Item -Path 'node-temp\extracted\node-v20.11.0-win-x64\*' -DestinationPath 'node-bin' -Force"
        powershell -Command "Remove-Item -Path 'node-temp' -Recurse -Force"

        if exist "node-bin\node.exe" (
            echo [✓] Node.js portatil instalado com sucesso em node-bin!
            set "NODE_EXE=node-bin\node.exe"
            set "NPM_CMD=node-bin\npm.cmd"
            set "NPX_CMD=node-bin\npx.cmd"
        ) else (
            color 0C
            echo ❌ [ERRO] Falha ao configurar o Node.js portatil.
            pause
            exit /b
        )
    )
)
echo.

:: 4. Instala dependencias do Node
echo 📦 2/5. Instalando bibliotecas e dependencias do robo...
if exist "package.json" (
    call %NPM_CMD% install
    if %errorlevel% neq 0 (
        color 0C
        echo ❌ [ERRO] Falha ao rodar npm install. Verifique sua conexao.
        pause
        exit /b
    )
    echo [✓] Dependencias do projeto instaladas!
) else (
    color 0C
    echo ❌ [ERRO] Arquivo package.json nao encontrado! Execute o instalador na pasta correta.
    pause
    exit /b
)
echo.

:: 5. Verifica e Instala Navegador de Alta Compatibilidade
echo 🌐 3/5. Verificando navegador Google Chrome / Chromium...
set "CHROME_DETECTED=0"

:: Tenta localizar Chrome oficial instalado no Windows
const paths = [
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
]
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_DETECTED=1"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_DETECTED=1"

:: Forca download de Chromium dedicado para nao depender do Chrome do usuario e evitar conflitos
echo [i] Para garantir compatibilidade absoluta de layout e sessoes do WhatsApp Web,
echo     iremos instalar uma instancia dedicada e certificada do Chromium para o robo.
echo     Fazendo download do Chromium... (Aguarde alguns instantes)
echo.
call %NPX_CMD% puppeteer browsers install chrome
if %errorlevel% equ 0 (
    echo [✓] Chromium dedicado do Puppeteer configurado com sucesso!
) else (
    if "%CHROME_DETECTED%"=="1" (
        echo [⚠️] Falha ao baixar Chromium, mas o Google Chrome oficial foi detectado no PC.
        echo     O robo usara o Google Chrome do sistema em modo de compatibilidade.
    ) else (
        color 0C
        echo ❌ [ERRO CRITICO] O Puppeteer nao conseguiu baixar o Chromium e o Google Chrome
        echo                  nao foi encontrado neste PC. O robo nao funcionara!
        pause
        exit /b
    )
)
echo.

:: 6. Cria start-background.vbs se nao existir
echo ⚙️  4/5. Configurando scripts de segundo plano...
set "VBS_PATH=%~dp0start-background.vbs"
if not exist "start-background.vbs" (
    (
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo WshShell.Run "cmd.exe /c run-agent.bat", 0, false
    ) > "start-background.vbs"
)
echo [✓] Script VBScript oculto verificado!

:: Cria atalho facilitador de inicializacao manual em segundo plano
(
echo @echo off
echo echo Iniciando BelaFarma RPA Agent em segundo plano...
echo wscript.exe "%~dp0start-background.vbs"
echo echo [✓] Ativado! O terminal e o navegador estao invisiveis.
echo timeout /t 3 >nul
) > "start-in-background.bat"
echo [✓] Script de acionamento rapido 'start-in-background.bat' gerado!
echo.

:: 7. Registra no Agendador de Tarefas do Windows (Task Scheduler)
echo 📅 5/5. Configurando inicializacao automatica no boot do Windows...
echo [i] Criando tarefa agendada "BelaFarmaRPAAgent" para iniciar na inicializacao silenciosa...

schtasks /delete /tn "BelaFarmaRPAAgent" /f >nul 2>nul
schtasks /create /tn "BelaFarmaRPAAgent" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f

if %errorlevel% equ 0 (
    echo [✓] Inicializacao automatica registrada no Agendador de Tarefas com SUCESSO!
) else (
    echo [⚠️] Falha ao registrar tarefa automatica. Mas voce ainda pode
    echo     iniciar o robo clicando em 'start-in-background.bat' manualmente.
)
echo.

:: 8. Finalizacao com placa de sucesso
color 0A
echo =======================================================================
echo          🎉 INSTALACAO E CONFIGURACAO CONCLUIDA COM SUCESSO! 🎉
echo =======================================================================
echo.
echo O robô BelaFarma RPA Agent está 100%% pronto para rodar!
echo.
echo REGRAS OPERACIONAIS IMPORTANTES:
echo.
echo 1. PRIMEIRA EXECUCAO (IMPORTANTE!):
echo    Como e a primeira vez, de um duplo clique no arquivo 'run-agent.bat'.
echo    O navegador visivel ira abrir. Escaneie o QR Code do seu celular.
echo    Assim que carregar as conversas e o terminal disser "ONLINE",
echo    voce pode fechar a janela preta e o navegador. O login ja estara salvo!
echo.
echo 2. RODANDO EM SEGUNDO PLANO (INVISIVEL):
echo    Após fazer o login a primeira vez, clique em 'start-in-background.bat'.
echo    O robo ira rodar de forma 100%% oculta (sem janelas e sem navegador).
echo.
echo 3. INICIALIZACAO COM O PC:
echo    Sempre que voce ligar o computador e fizer login no Windows, o robô
echo    iniciará silenciosamente de forma automatica!
echo.
echo =======================================================================
pause
exit /b
