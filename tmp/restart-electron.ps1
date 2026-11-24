param([int]$PollSec = 45)
$d = (Get-ChildItem C:\Users\Trabajo\Documents\Monetizeti -Directory | Where-Object { $_.Name -like 'OPENCODEN*' })[0]
Set-Location -Path $d.FullName
foreach ($p in (Get-Process -Name 'electron*' -ErrorAction SilentlyContinue)) { $p.Id | Out-Null }
Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
for ($i = 0; $i -lt $PollSec; $i++) {
  $p = Start-Process -FilePath '.\node_modules\.bin\electron.cmd' -ArgumentList '.','--remote-debugging-port=9222' -WorkingDirectory $d.FullName -PassThru
  Start-Sleep -Seconds 1
  $alive = (Get-Process -Id $p.Id -ErrorAction SilentlyContinue).Count
  $r = $null
  try { $r = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json -TimeoutSec 2 | ConvertFrom-Json) } catch { $r = $null }
  if ($r -and $r.Count -gt 0) {
    $pg = $r.Where({ $_.type -eq 'page' })[0]
    if ($pg) {
      Set-Content -Path tmp\ws-url.txt -Value $pg.webSocketDebuggerUrl -NoNewline
      Write-Output "GOT-FIRST:$($pg.id) alive:$alive"
      exit 0
    }
  }
  # electron cerrada -> detener y reintentar
  if (-not $alive) {
    Write-Output "DIED retry $i"
    Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    continue
  }
}
Write-Output 'TIMEOUT'
