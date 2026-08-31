Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Bitmap]::FromFile("f:\Documentos\Desenvolvimento\BelaFarma\public\images\logo-bela-farma.jpg")
Write-Host "logo-bela-farma.jpg Width:" $img.Width "Height:" $img.Height
$img.Dispose()
