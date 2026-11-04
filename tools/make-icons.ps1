Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src = Join-Path $root 'image-pack\icon-1024.png'
$img = [System.Drawing.Image]::FromFile($src)

function Save-Square([System.Drawing.Image]$image, [int]$size, [string]$path, [bool]$round) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($round) {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, $size, $size)
    $g.SetClip($clip)
  }
  $g.DrawImage($image, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$densities = @{
  'mipmap-mdpi'    = 48
  'mipmap-hdpi'    = 72
  'mipmap-xhdpi'   = 96
  'mipmap-xxhdpi'  = 144
  'mipmap-xxxhdpi' = 192
}

foreach ($key in $densities.Keys) {
  $size = $densities[$key]
  $base = Join-Path $root "image-pack\android-icons\$key"
  Save-Square $img $size (Join-Path $base 'ic_launcher.png') $false
  Save-Square $img $size (Join-Path $base 'ic_launcher_round.png') $true
}

$web = Join-Path $root 'image-pack'
Save-Square $img 512 (Join-Path $web 'icon-512.png') $false
Save-Square $img 192 (Join-Path $web 'icon-192.png') $false

$img.Dispose()
Get-ChildItem -Recurse (Join-Path $root 'image-pack\android-icons') | Select-Object FullName, Length | Format-Table -AutoSize
