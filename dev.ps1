# Kratos Sustainability CRM — dev launcher (PowerShell)
# Usage:  .\dev.ps1          starts backend (:4000) + frontend (:5173) in two windows
#         .\dev.ps1 -Stop    stops anything holding those ports
param([switch]$Stop)

$root = $PSScriptRoot
$ports = @(4000, 5173)

function Stop-Port([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Host "  killed PID $($c.OwningProcess) on port $port" -ForegroundColor Yellow
        } catch {}
    }
}

Write-Host "Kratos CRM dev launcher" -ForegroundColor Green

# Free stale listeners (Windows often leaves detached node children behind).
foreach ($p in $ports) { Stop-Port $p }

if ($Stop) {
    Write-Host "Ports cleared. Servers stopped." -ForegroundColor Green
    exit 0
}

# First-run install if node_modules missing.
foreach ($dir in @('backend', 'frontend')) {
    if (-not (Test-Path (Join-Path $root "$dir\node_modules"))) {
        Write-Host "Installing $dir dependencies..." -ForegroundColor Cyan
        Push-Location (Join-Path $root $dir)
        npm install
        Pop-Location
    }
}

Write-Host "Starting backend  -> http://localhost:4000/api/v1  (docs at /docs)" -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='Kratos API :4000'; Set-Location '$root\backend'; npm run dev"

Write-Host "Starting frontend -> http://localhost:5173" -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='Kratos Web :5173'; Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Both servers launching in separate windows." -ForegroundColor Green
Write-Host "Login: admin@kratosenergy.com.au / Admin@12345"
Write-Host "Stop later with:  .\dev.ps1 -Stop"
