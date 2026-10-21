$ErrorActionPreference = 'SilentlyContinue'

# NOTE: only ever stop the process that owns port 3999. Never use
# `Stop-Process -Name node`, which would also kill unrelated node programs
# (including the editor/agent running this command).
$root = "c:\Users\USER\Documents\DHL Website"

# Ask the server to shut down cleanly so pending writes are flushed and the
# Firestore client is closed. Force-killing it can leave a request hanging.
$tokenFile = Join-Path $root "data\shutdown.token"
if (Test-Path $tokenFile) {
    $token = (Get-Content $tokenFile -Raw).Trim()
    try {
        $headers = @{ 'X-Shutdown-Token' = $token }
        Invoke-RestMethod -Uri "http://localhost:3999/__shutdown" -Method Post -Headers $headers -TimeoutSec 10 | Out-Null
        Write-Host "Requested graceful shutdown..."
    } catch {
        Write-Host "Graceful shutdown request failed: $($_.Exception.Message)"
    }
}

# Wait up to 10 seconds for the port to be released.
$released = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-NetTCPConnection -LocalPort 3999 -State Listen)) {
        $released = $true
        break
    }
}

if (-not $released) {
    Write-Host "Server did not stop cleanly; forcing it to exit."
    $conns = Get-NetTCPConnection -LocalPort 3999 -State Listen
    foreach ($c in $conns) {
        Write-Host "Stopping old server (PID $($c.OwningProcess))..."
        Stop-Process -Id $c.OwningProcess -Force
    }
    Start-Sleep -Seconds 2
}

# Start the server fresh, logging to boot.log / boot-err.log
Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "boot.log") `
    -RedirectStandardError (Join-Path $root "boot-err.log") -WindowStyle Hidden

Start-Sleep -Seconds 2
$listening = $null
for ($i = 0; $i -lt 60; $i++) {
    $listening = Get-NetTCPConnection -LocalPort 3999 -State Listen -ErrorAction SilentlyContinue
    if ($listening) { break }
    Start-Sleep -Seconds 1
}
if ($listening) {
    Write-Host "Server LISTENING on 3999 (PID $($listening[0].OwningProcess))"
} else {
    Write-Host "Server did NOT start. boot.log:"
    Get-Content (Join-Path $root "boot.log")
    Write-Host "boot-err.log:"
    Get-Content (Join-Path $root "boot-err.log")
}
