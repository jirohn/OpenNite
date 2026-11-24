param([int]$Tries = 6)
$d = (Get-ChildItem C:\Users\Trabajo\Documents\Monetizeti -Directory | Where-Object { $_.Name -like 'OPENCODEN*' })[0]
Set-Location -Path $d.FullName

for ($t = 0; $t -lt $Tries; $t++) {
  foreach ($p in (Get-Process -Name 'electron*' -ErrorAction SilentlyContinue)) { $p.Id | Out-Null }
  Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $proc = Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' -ArgumentList '.','--remote-debugging-port=9222','--disable-gpu' -WorkingDirectory $d.FullName -PassThru -RedirectStandardOutput tmp\eo.log -RedirectStandardError tmp\ee.log
  $got = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $r = $null
    try { $r = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json -TimeoutSec 2 | ConvertFrom-Json) } catch { $r = $null }
    if ($r -and $r.Count -gt 0) {
      $pg = $r.Where({ $_.type -eq 'page' })[0]
      if ($pg) {
        Set-Content -Path tmp\ws-url.txt -Value $pg.webSocketDebuggerUrl -NoNewline
        Write-Output "TRY $t GOT:$($pg.id) url:$($pg.url)"
        $got = $true
        break
      }
    }
    if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) { Write-Output "TRY $t DIED at ${i}s"; break }
  }
  if ($got) {
    Start-Sleep -Seconds 6
    Write-Output '--- check ---'
    node tmp\cdp-eval.mjs $pg.webSocketDebuggerUrl tmp\expr-check.js 0
    Write-Output '--- gun2 ---'
    node tmp\cdp-eval.mjs $pg.webSocketDebuggerUrl tmp\expr-gun2.js 0
    Write-Output 'VALIDATE-GUN-DONE'
    exit 0
  }
}
Write-Output 'ALL-TRIES-FAILED'
