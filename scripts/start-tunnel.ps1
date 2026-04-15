# Túnel público temporal (Cloudflare Quick Tunnel) hacia tu app local.
# Uso:
#   npm run tunnel
#   npm run tunnel:backend
#   powershell -File scripts/start-tunnel.ps1 -Port 5175
#
# Deja esta ventana abierta. Ctrl+C cierra el túnel.
param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$binDir = Join-Path $PSScriptRoot ".cloudflared"
$exe = Join-Path $binDir "cloudflared.exe"

# Windows 32 bits -> 386; resto -> amd64 (incluye ARM64 con emulación x64 en Win11)
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "x86") {
  $asset = "cloudflared-windows-386.exe"
} else {
  $asset = "cloudflared-windows-amd64.exe"
}
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/$asset"

function Test-ValidPeExe {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $false }
  $item = Get-Item $Path
  if ($item.Length -lt 3MB) { return $false }
  $fs = [System.IO.File]::OpenRead($Path)
  try {
    $b = New-Object byte[] 2
    [void]$fs.Read($b, 0, 2)
    return ($b[0] -eq 0x4D -and $b[1] -eq 0x5A)
  } finally {
    $fs.Dispose()
  }
}

function Download-Cloudflared {
  Write-Host "Descargando cloudflared ($asset)..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  if (Test-Path $exe) { Remove-Item -Force $exe }

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & curl.exe -fsSL -L -o $exe $url
  } else {
    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing -MaximumRedirection 5
  }

  if (-not (Test-ValidPeExe -Path $exe)) {
    Remove-Item -Force $exe -ErrorAction SilentlyContinue
    throw "La descarga de cloudflared no es un .exe valido (archivo corrupto o pagina HTML). Prueba de nuevo o instala cloudflared desde: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  }
}

if (-not (Test-ValidPeExe -Path $exe)) {
  Download-Cloudflared
}

function Test-CloudflaredRuns {
  param([string]$Path)
  try {
    $p = Start-Process -FilePath $Path -ArgumentList "--version" -Wait -PassThru -NoNewWindow
    return ($null -ne $p -and $p.ExitCode -eq 0)
  } catch {
    return $false
  }
}

if (-not (Test-CloudflaredRuns -Path $exe)) {
  Write-Host "cloudflared no ejecuta (archivo viejo o corrupto); re-descargando..." -ForegroundColor Yellow
  Download-Cloudflared
  if (-not (Test-CloudflaredRuns -Path $exe)) {
    throw @"
cloudflared sigue sin ejecutarse en esta PC (p. ej. Windows ARM sin emulacion x64).
1) Borra la carpeta: $binDir
2) Vuelve a ejecutar este script
3) O instala ngrok y ejecuta: ngrok http $Port
"@
  }
}

Write-Host "Tunel -> http://127.0.0.1:$Port (comparte la URL https que aparezca abajo)" -ForegroundColor Green
Write-Host ""
try {
  & $exe tunnel --url "http://127.0.0.1:$Port"
} catch {
  Write-Host ""
  Write-Host "Si tu PC es Windows ARM sin emulacion x64, cloudflared para Windows puede fallar." -ForegroundColor Yellow
  Write-Host "Opcion: instala ngrok (https://ngrok.com) y ejecuta: ngrok http $Port" -ForegroundColor Yellow
  throw
}
