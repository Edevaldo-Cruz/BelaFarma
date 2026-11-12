$ErrorActionPreference = 'SilentlyContinue'

# 1. Detectar navegador Chromium (Chrome ou Edge)
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

$browserExe = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $browserExe = $path
        break
    }
}

# 2. Detectar endereco do servidor
$serverHost = "192.168.1.70:3001"
$tcp = New-Object Net.Sockets.TcpClient
try {
    $tcp.Connect('127.0.0.1', 3001)
    $tcp.Close()
    $serverHost = "127.0.0.1:3001"
} catch {}

$url = "http://$serverHost/?app=pdv"
$userData = Join-Path $env:LOCALAPPDATA "BelaFarmaPDV"

if (-not (Test-Path $userData)) {
    New-Item -ItemType Directory -Path $userData -Force | Out-Null
}

# 3. Criar o atalho no Desktop do usuario atual e Desktop publico
$desktopPaths = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory')
)

$ws = New-Object -ComObject WScript.Shell

foreach ($d in $desktopPaths) {
    if (Test-Path $d) {
        try {
            $shortcutPath = Join-Path $d "PDV BelaFarma.lnk"
            $shortcut = $ws.CreateShortcut($shortcutPath)
            
            if ($browserExe) {
                $shortcut.TargetPath = $browserExe
                $shortcut.Arguments = "--app=`"$url`" --user-data-dir=`"$userData`" --kiosk-printing --disable-print-preview --start-maximized"
            } else {
                $shortcut.TargetPath = $url
            }
            
            $shortcut.Description = "Drogaria Bela Farma - Frente de Caixa PDV"
            $shortcut.WindowStyle = 3 # Maximized
            $shortcut.Save()
        } catch {}
    }
}

# 4. Iniciar o PDV imediatamente
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "PDV BelaFarma.lnk"
if (Test-Path $desktopShortcut) {
    Start-Process $desktopShortcut
} elseif ($browserExe) {
    Start-Process -FilePath $browserExe -ArgumentList "--app=`"$url`" --user-data-dir=`"$userData`" --kiosk-printing --disable-print-preview --start-maximized"
} else {
    Start-Process $url
}

# 5. Notificar o usuario na tela
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("O atalho 'PDV BelaFarma' foi criado com sucesso na sua Area de Trabalho e o PDV ja foi iniciado!", "BelaFarma PDV", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
