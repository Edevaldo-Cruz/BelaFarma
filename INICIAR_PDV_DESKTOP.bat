@echo off
title BelaFarma - PDV Frente de Caixa Desktop
chcp 65001 > nul

echo ======================================================================
echo    DROGARIA BELA FARMA SUL - FRENTE DE CAIXA FISCAL (MODO DESKTOP)
echo    Janela dedicada permanente (Estilo Electron / Aplicativo Nativo)
echo ======================================================================
echo.

REM 1. Configurar impressora termica Bematech MP-4200 TH como padrao
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer | Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } | Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter(); Write-Host '[OK] Bematech definida como impressora padrao:' $p.Name -ForegroundColor Green } else { Write-Host '[AVISO] Bematech nao detectada localmente (usando impressora padrao do Windows).' -ForegroundColor Gray }"

REM 2. Detectar se o servidor local esta ativo na porta 3001
set "SERVER_HOST=127.0.0.1:3001"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tcp = New-Object Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 3001); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set "SERVER_HOST=192.168.1.70:3001"
    echo [REDE] Servidor local nao detectado na porta 3001. Conectando via rede ao IP 192.168.1.70:3001...
) else (
    echo [LOCAL] Servidor ativo localmente em 127.0.0.1:3001.
)

set "URL=http://%SERVER_HOST%/?app=pdv&isPrinterStation=true"
set "USER_DATA=%LOCALAPPDATA%\BelaFarmaPDV"

REM 3. Localizar motor Chromium (Chrome ou Edge)
set "CHROME_64=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_32=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set "EDGE_32=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

set "APP_RUNNER="
if exist "%CHROME_64%" set "APP_RUNNER=%CHROME_64%"
if not defined APP_RUNNER if exist "%CHROME_32%" set "APP_RUNNER=%CHROME_32%"
if not defined APP_RUNNER if exist "%EDGE_64%" set "APP_RUNNER=%EDGE_64%"
if not defined APP_RUNNER if exist "%EDGE_32%" set "APP_RUNNER=%EDGE_32%"

REM 4. Criar atalho na Area de Trabalho se ainda nao existir
powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop = [Environment]::GetFolderPath('Desktop'); $shortcutPath = Join-Path $desktop 'PDV BelaFarma.lnk'; if (-not (Test-Path $shortcutPath)) { $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($shortcutPath); $s.TargetPath = '%~dp0INICIAR_PDV_DESKTOP.bat'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Frente de Caixa Fiscal BelaFarma'; $s.WindowStyle = 7; $s.Save(); Write-Host '[OK] Atalho criado na Area de Trabalho: PDV BelaFarma' -ForegroundColor Cyan }" >nul 2>&1

echo.
if defined APP_RUNNER (
    echo [OK] Abrindo janela dedicada do PDV estilo Electron com sessao e vendedor persistentes...
    start "" "%APP_RUNNER%" --app="%URL%" --user-data-dir="%USER_DATA%" --kiosk-printing --disable-print-preview --start-maximized --window-size=1920,1080 --disable-pinch --overscroll-history-navigation=0
) else (
    echo [AVISO] Navegador Chromium nao encontrado. Abrindo navegador padrao do sistema...
    start "" "%URL%"
)

echo.
echo PDV aberto em janela fixa dedicada!
echo O vendedor e a sessao ficam gravados permanentemente no perfil deste computador.
timeout /t 3 /nobreak >nul
exit
