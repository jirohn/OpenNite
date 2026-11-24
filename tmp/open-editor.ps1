param([int]$PollSec = 40)
$d = (Get-ChildItem C:\Users\Trabajo\Documents\Monetizeti -Directory | Where-Object { $_.Name -like 'OPENCODEN*' })[0]
Set-Location -Path $d.FullName
foreach ($p in (Get-Process -Name 'electron*' -ErrorAction SilentlyContinue)) { $p.Id | Out-Null }
Stop-Process -Name 'electron*' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$p = Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' -ArgumentList '.','--remote-debugging-port=9222' -WorkingDirectory $d.FullName -PassThru -RedirectStandardOutput tmp\eo.log -RedirectStandardError tmp\ee.log
for ($i = 0; $i -lt $PollSec; $i++) {
  Start-Sleep -Seconds 1
  $r = $null
  try { $r = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json -TimeoutSec 2 | ConvertFrom-Json) } catch { $r = $null }
  if ($r -and $r.Count -gt 0) {
    $pg = $r.Where({ $_.type -eq 'page' })[0]
    if ($pg) {
      Set-Content -Path tmp\ws-url.txt -Value $pg.webSocketDebuggerUrl -NoNewline
      $u = [System.Uri]$pg.url
      $editorUrl = "$($u.Scheme)://$($u.Authority)/tools/gun-editor.html"
      Write-Output "page=$($pg.url)"
      Write-Output "editor=$editorUrl"
      exit 0
    }
  }
}
Write-Output 'TIMEOUT'
