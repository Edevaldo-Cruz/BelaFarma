Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Edevaldo\.gemini\antigravity\brain\180a8440-2445-4ebd-925f-f37c1e0fbc05\.user_uploaded\media_1788189272867.png"
$publicDir = "f:\Documentos\Desenvolvimento\BelaFarma\public"
$imagesDir = Join-Path $publicDir "images"

if (-not (Test-Path $imagesDir)) {
    New-Item -ItemType Directory -Path $imagesDir -Force | Out-Null
}

$srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Source width:" $srcImg.Width "height:" $srcImg.Height

# Function to create an icon with high contrast (crisp white circular container with subtle inner/drop shadow or clean white canvas)
function Create-PwaIcon {
    param(
        [int]$size,
        [string]$outPath,
        [bool]$hasBackground = $true
    )
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($hasBackground) {
        # White background with smooth rounded corners / full square for PWA maskable
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $g.FillRectangle($brush, 0, 0, $size, $size)
        $brush.Dispose()
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # Calculate padding to ensure safe area (70% of size)
    $targetDim = [int]($size * 0.72)
    $aspect = $srcImg.Width / $srcImg.Height
    if ($aspect -gt 1) {
        $drawW = $targetDim
        $drawH = [int]($targetDim / $aspect)
    } else {
        $drawH = $targetDim
        $drawW = [int]($targetDim * $aspect)
    }

    $destX = [int](($size - $drawW) / 2)
    $destY = [int](($size - $drawH) / 2)

    $g.DrawImage($srcImg, $destX, $destY, $drawW, $drawH)
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $outPath ($size x $size)"
}

# 1. PWA 192x192 (with solid white background for high contrast & maskable safety)
Create-PwaIcon 192 (Join-Path $publicDir "pwa-192x192.png") $true

# 2. PWA 512x512 (with solid white background for high contrast & maskable safety)
Create-PwaIcon 512 (Join-Path $publicDir "pwa-512x512.png") $true

# 3. Transparent version for UI in-app icons (logo-icon.png)
Create-PwaIcon 256 (Join-Path $imagesDir "logo-icon.png") $false
Create-PwaIcon 256 (Join-Path $imagesDir "logo-icon-badge.png") $true

# 4. Favicon 64x64 & 32x32
Create-PwaIcon 64 (Join-Path $publicDir "favicon.png") $false
Create-PwaIcon 32 (Join-Path $publicDir "favicon-32x32.png") $false

# Convert 32x32 png to favicon.ico
$icoBmp = New-Object System.Drawing.Bitmap 32, 32, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$icoG = [System.Drawing.Graphics]::FromImage($icoBmp)
$icoG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$icoG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$icoG.DrawImage($srcImg, 0, 0, 32, 32)
$icoG.Dispose()
$iconHandle = $icoBmp.GetHicon()
$iconObj = [System.Drawing.Icon]::FromHandle($iconHandle)
$fs = [System.IO.File]::OpenWrite((Join-Path $publicDir "favicon.ico"))
$iconObj.Save($fs)
$fs.Close()
$icoBmp.Dispose()
Write-Host "Generated favicon.ico"

$srcImg.Dispose()
