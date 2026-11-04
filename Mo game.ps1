$ErrorActionPreference = 'Stop'
$gameFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostAddress = '127.0.0.1'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Không tìm thấy Node.js. Cài Node.js rồi mở lại game.' -ForegroundColor Red
  Read-Host 'Nhấn Enter để đóng'
  exit 1
}

function Test-GameServer([int]$candidate) {
  try {
    $request = [System.Net.HttpWebRequest]::Create(('http://{0}:{1}/_game-health' -f $hostAddress, $candidate))
    $request.Method = 'GET'
    $request.Timeout = 250
    $request.ReadWriteTimeout = 250
    $response = $request.GetResponse()
    try {
      $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
      try { return $response.StatusCode -eq 200 -and $reader.ReadToEnd() -eq 'plus1-speed-local-launcher-v2' }
      finally { $reader.Dispose() }
    } finally { $response.Dispose() }
  } catch { return $false }
}

# Tìm server đang chạy, hoặc dừng ở port trống đầu tiên.
$port = $null
$running = $false
for ($candidate = 8000; $candidate -le 8100; $candidate++) {
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
  try {
    $probe.Start()
    $probe.Stop()
    $port = $candidate
    break
  } catch {
    try { $probe.Stop() } catch {}
    if (Test-GameServer $candidate) {
      $port = $candidate
      $running = $true
      break
    }
  }
}

if ($null -eq $port) {
  Write-Host 'Không còn port trống (8000-8100). Đóng bớt ứng dụng rồi thử lại.' -ForegroundColor Red
  Read-Host 'Nhấn Enter để đóng'
  exit 1
}

if (-not $running) {
  $serverFile = Join-Path $gameFolder 'serve-game.js'
  Start-Process -FilePath $node.Source -ArgumentList @("`"$serverFile`"", "$port") -WorkingDirectory $gameFolder -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-GameServer $port) { $ready = $true; break }
    Start-Sleep -Milliseconds 100
  }

  if (-not $ready) {
    Write-Host 'Không khởi động được server game. Kiểm tra Node.js rồi thử lại.' -ForegroundColor Red
    Read-Host 'Nhấn Enter để đóng'
    exit 1
  }
}

$localUrl = ('http://{0}:{1}/' -f $hostAddress, $port)

# Mở game trước cho nhanh, tunnel chạy song song phía sau.
$url = $localUrl
$chromeCandidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
)
$chromePath = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($chromePath) {
  Start-Process -FilePath $chromePath -ArgumentList @('--new-window', $url)
} else {
  Start-Process -FilePath $url
}

$outLog = Join-Path $env:TEMP 'plus1-speed-tunnel-out.log'
$errLog = Join-Path $env:TEMP 'plus1-speed-tunnel-err.log'
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

function Get-TunnelLog {
  $text = ''
  foreach ($file in @($errLog, $outLog)) {
    if (Test-Path $file) {
      try { $text += Get-Content -Raw $file } catch {}
    }
  }
  return $text
}

$tunnel = $null
$publicUrl = $null

# Cách 1: SSH có sẵn của Windows + localhost.run, không cần tải gì.
$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if ($ssh) {
  Write-Host 'Đang mở tunnel qua localhost.run...' -ForegroundColor Cyan
  try {
    $tunnel = Start-Process -FilePath $ssh.Source -ArgumentList @(
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-R', "80:127.0.0.1:$port",
      'nokey@localhost.run'
    ) -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
  } catch {
    $tunnel = $null
  }

  if ($tunnel) {
    for ($i = 0; $i -lt 60; $i++) {
      if ($tunnel.HasExited) { break }
      $match = [regex]::Match((Get-TunnelLog), 'https://[a-z0-9]+\.lhr\.life')
      if ($match.Success) { $publicUrl = $match.Value; break }
      Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) {
      if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
      $tunnel = $null
      Write-Host 'localhost.run không phản hồi, thử Cloudflare...' -ForegroundColor Yellow
    }
  }
}

# Cách 2: Cloudflare quick tunnel (tải cloudflared một lần nếu chưa có).
if (-not $publicUrl) {
  $toolsDir = Join-Path $gameFolder 'tools'
  $cloudflared = Join-Path $toolsDir 'cloudflared.exe'
  if (-not (Test-Path $cloudflared)) {
    Write-Host 'Đang tải cloudflared (~50 MB, chỉ lần đầu)...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    try {
      $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
      if (Test-Path $curl) {
        & $curl -L --fail --progress-bar -o $cloudflared $downloadUrl
        if ($LASTEXITCODE -ne 0) { throw 'curl tải thất bại' }
      } else {
        Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $cloudflared
      }
    } catch {
      Write-Host ('Không tải được cloudflared: ' + $_.Exception.Message) -ForegroundColor Red
    }
  }

  if (Test-Path $cloudflared) {
    Write-Host 'Đang mở tunnel qua Cloudflare...' -ForegroundColor Cyan
    Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', $localUrl) -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden

    for ($i = 0; $i -lt 120; $i++) {
      if ($tunnel.HasExited) { break }
      $match = [regex]::Match((Get-TunnelLog), 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
      if ($match.Success) { $publicUrl = $match.Value; break }
      Start-Sleep -Milliseconds 500
    }
  }
}

if (-not $publicUrl) {
  Write-Host ''
  Write-Host 'Không mở được link online. Game vẫn chơi được trên máy này.' -ForegroundColor Yellow
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  Read-Host 'Nhấn Enter để đóng cửa sổ'
  exit 1
}

try { Set-Clipboard -Value $publicUrl } catch {}

Write-Host ''
Write-Host '====================================================' -ForegroundColor Green
Write-Host '  LINK GỬI BẠN BÈ (mạng nào cũng vào được):' -ForegroundColor Green
Write-Host ('  ' + $publicUrl + '/') -ForegroundColor Yellow
Write-Host '  Link đã được copy vào clipboard.' -ForegroundColor DarkGray
Write-Host '====================================================' -ForegroundColor Green
Write-Host ('  Máy bro chơi tại: ' + $localUrl) -ForegroundColor DarkGray
Write-Host '  Người bạn mở link, nhập tên, là vào chung thế giới.' -ForegroundColor DarkGray
Write-Host '  Giữ cửa sổ này mở nhé. Ctrl+C để tắt tunnel.' -ForegroundColor DarkGray
Write-Host ''

try {
  while (-not $tunnel.HasExited) { Start-Sleep -Seconds 2 }
} finally {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  Write-Host 'Đã tắt tunnel.' -ForegroundColor Cyan
}
