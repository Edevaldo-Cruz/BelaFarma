Add-Type -AssemblyName System.Drawing

$publicDir = "f:\Documentos\Desenvolvimento\BelaFarma\public"
$orig512Path = Join-Path $publicDir "pwa-512x512_orig.png"
$imagesDir = Join-Path $publicDir "images"

if (-not (Test-Path $orig512Path)) {
    Write-Error "pwa-512x512_orig.png not found"
    exit 1
}

$srcBmp = [System.Drawing.Bitmap]::FromFile($orig512Path)
Write-Host "Loaded original icon:" $srcBmp.Width "x" $srcBmp.Height

# Function to generate high-contrast icon with crisp white background & safe-area padding
function Generate-ContrastIcon {
    param(
        [int]$size,
        [string]$outPath,
        [float]$paddingRatio = 0.85
    )
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Clean solid white background to guarantee 100% contrast on any dark/light OS launcher
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()

    # Calculate target dimensions with padding
    $targetDim = [int]($size * $paddingRatio)
    $aspect = $srcBmp.Width / $srcBmp.Height
    if ($aspect -gt 1) {
        $drawW = $targetDim
        $drawH = [int]($targetDim / $aspect)
    } else {
        $drawH = $targetDim
        $drawW = [int]($targetDim * $aspect)
    }

    $destX = [int](($size - $drawW) / 2)
    $destY = [int](($size - $drawH) / 2)

    $g.DrawImage($srcBmp, $destX, $destY, $drawW, $drawH)
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved: $outPath ($size x $size)"
}

# Generate PWA icons with solid high-contrast background
Generate-ContrastIcon 512 (Join-Path $publicDir "pwa-512x512.png") 0.82
Generate-ContrastIcon 192 (Join-Path $publicDir "pwa-192x192.png") 0.82

# Generate UI logo-icon
Generate-ContrastIcon 256 (Join-Path $imagesDir "logo-icon.png") 0.88
Generate-ContrastIcon 256 (Join-Path $imagesDir "logo-icon-badge.png") 0.82

# Generate favicons
Generate-ContrastIcon 64 (Join-Path $publicDir "favicon.png") 0.90
Generate-ContrastIcon 32 (Join-Path $publicDir "favicon-32x32.png") 0.90

# Generate favicon.ico from 32x32
$icoBmp = New-Object System.Drawing.Bitmap 32, 32, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$icoG = [System.Drawing.Graphics]::FromImage($icoBmp)
$icoG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$icoG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$icoG.FillRectangle($brush, 0, 0, 32, 32)
$brush.Dispose()
$icoG.DrawImage($srcBmp, 2, 2, 28, 28)
$icoG.Dispose()
$iconHandle = $icoBmp.GetHicon()
$iconObj = [System.Drawing.Icon]::FromHandle($iconHandle)
$fs = [System.IO.File]::OpenWrite((Join-Path $publicDir "favicon.ico"))
$iconObj.Save($fs)
$fs.Close()
$icoBmp.Dispose()
Write-Host "Saved favicon.ico"

$srcBmp.Dispose()

# Cleanup temporary extraction files
Remove-Item (Join-Path $publicDir "pwa-512x512_orig.png") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "pwa-192x192_orig.png") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "favicon_orig.ico") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "orig_pwa512.png") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "orig_pwa192.png") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "orig_favicon.ico") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "pwa-512x512_old.png") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $publicDir "pwa-192x192_old.png") -ErrorAction SilentlyContinue
