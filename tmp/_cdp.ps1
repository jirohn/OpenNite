$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]'ws://127.0.0.1:9222/devtools/page/4AEDD88A8C143538A43758A931B4884D', $ct).Wait()
function Send-CDP($obj){ $json=[System.Text.Encoding]::UTF8.GetBytes(($obj|ConvertTo-Json -Compress -Depth 10)); $seg=New-Object System.ArraySegment[byte](,$json); $ws.SendAsync($seg,[System.Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() }
function Recv-CDP($timeoutMs=10000){ $buf=New-Object byte[] 65536; $seg=New-Object System.ArraySegment[byte](,$buf); $mem=New-Object System.IO.MemoryStream; $sw=[Diagnostics.Stopwatch]::StartNew(); do{ $t=$ws.ReceiveAsync($seg,$ct); if(-not $t.Wait($timeoutMs)){return $null}; $res=$t.Result; $mem.Write($buf,0,$res.Count); if($sw.ElapsedMilliseconds -gt $timeoutMs){break} } while(-not $res.EndOfMessage); [System.Text.Encoding]::UTF8.GetString($mem.ToArray()) }
Send-CDP @{id=1; method='Runtime.enable'}
$null=Recv-CDP 5000
Start-Sleep -Seconds 3
Send-CDP @{id=2; method='Runtime.evaluate'; params=@{expression="JSON.stringify({status:document.getElementById('statusBar')?.textContent?.slice(0,150),extras:[...document.getElementById('animSelect').options].map(o=>o.value).filter(v=>/Extra/.test(v)),count:document.getElementById('animSelect').options.length})"; returnByValue=$true}}
$r=Recv-CDP 8000; Write-Output $r
$ws.Dispose()
