# Clonar proyecto WMS a wms-system-desarrollo (entorno de desarrollo)
$Origen = $PSScriptRoot
$Destino = Join-Path (Split-Path $Origen -Parent) "wms-system-desarrollo"

Write-Host ""
Write-Host "Clonando proyecto WMS para entorno de desarrollo"
Write-Host "  Origen:  $Origen"
Write-Host "  Destino: $Destino"
Write-Host ""

if (Test-Path $Destino) {
    Write-Host "[AVISO] La carpeta destino ya existe." -ForegroundColor Yellow
    $r = Read-Host "Sobrescribir? (S/N)"
    if ($r -ne "S" -and $r -ne "s") {
        Write-Host "Cancelado."
        exit 0
    }
    Remove-Item -Path $Destino -Recurse -Force
}

Write-Host "Copiando... (se excluyen node_modules)"
& robocopy $Origen $Destino /E /XD node_modules /NFL /NDL /NJH /NJS /NC /NS /NP
if ($LASTEXITCODE -ge 8) {
    Write-Host "Error al copiar. Codigo: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Clonado creado en: $Destino" -ForegroundColor Green
Write-Host ""
Write-Host "Siguiente: abre wms-system-desarrollo en Cursor y ejecuta npm install donde haga falta."
Write-Host ""
