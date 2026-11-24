param([int]$PollSec = 50)
$d = (Get-ChildItem C:\Users\Trabajo\Documents\Monetizeti -Directory | Where-Object { $_.Name -like 'OPENCODEN*' })[0]
Set-Location -Path $d.FullName
foreach ($p in (Get-Process -Name 'electron*' -ErrorAction SilentlyContinue)) { $p.Id | Out-Null }
Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$ok = $false
for ($i = 0; $i -lt $PollSec; $i++) {
  $r = $null
  try { $r = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json -TimeoutSec 2 | ConvertFrom-Json) } catch { $r = $null }
  if ($r -and $r.Count -gt 0) {
    $pg = $r.Where({ $_.type -eq 'page' })[0]
    if ($pg) {
      Set-Content -Path tmp\ws-url.txt -Value $pg.webSocketDebuggerUrl -NoNewline
      Write-Output "GOT:$($pg.id) after-try:$i"
      $ok = $true
      break
    }
  }
  Start-Sleep -Seconds 1
}
if (-not $ok) { Write-Output 'NO-PAGE'; exit 1 }

Write-Output '--- HTTP fetch statuses (CDP) ---'
node tmp\cdp-nav.mjs '' 0 tmp\expr-fetch.js

Write-Output '--- navigate /tools/gun-editor.html ---'
node tmp\cdp-nav.mjs /tools/gun-editor.html 0 tmp\expr-editor-debug.js

Write-Output '--- game state ---'
node tmp\cdp-nav.mjs '' 0 tmp\expr-state.js
Start-Sleep -Seconds 2

Write-Output '--- gun orientation (preview) ---'
node tmp\cdp-eval.mjs $(Get-Content tmp\ws-url.txt -Raw) tmp\expr-gun2.js 0

Write-Output 'VALIDATE-DONE'
