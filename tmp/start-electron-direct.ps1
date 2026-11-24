param([int]$PollSec = 45)
$d = (Get-ChildItem C:\Users\Trabajo\Documents\Monetizeti -Directory | Where-Object { $_.Name -like 'OPENCODEN*' })[0]
Set-Location -Path $d.FullName
foreach ($p in (Get-Process -Name 'electron*' -ErrorAction SilentlyContinue)) { $p.Id | Out-Null }
Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
# Electron directo (sin shim .cmd) + logs a archivo
$p = Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' -ArgumentList '.','--remote-debugging-port=9222' -WorkingDirectory $d.FullName -PassThru -RedirectStandardOutput tmp\eo.log -RedirectStandardError tmp\ee.log
Write-Output "STARTED:$($p.Id)"
$ok = $false
for ($i = 0; $i -lt $PollSec; $i++) {
  Start-Sleep -Seconds 1
  $alive = (Get-Process -Id $p.Id -ErrorAction SilentlyContinue).Count
  $r = $null
  try { $r = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json -TimeoutSec 2 | ConvertFrom-Json) } catch { $r = $null }
  $n = if ($r) { $r.Count } else { -1 }
  if ($n -gt 0) {
    $pg = $r.Where({ $_.type -eq 'page' })[0]
    if ($pg) {
      Set-Content -Path tmp\ws-url.txt -Value $pg.webSocketDebuggerUrl -NoNewline
      Write-Output "GOT:$($pg.id) at t+$(($i+1))s alive:$alive url:$($pg.url)"
      $ok = $true
      break
    }
  }
  if ($alive -eq 0) { Write-Output "DIED at t+$(($i+1))s"; break }
}
if (-not $ok) { Write-Output 'TIMEOUT-NO-PAGE' }
