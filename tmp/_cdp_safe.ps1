$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]'ws://127.0.0.1:9222/devtools/page/4A0923E971FEC9E5FB8737BE1E84F3EE',$ct).Wait()
function Send-CDP($id,$method,$params=@{}){ $msg=@{id=$id;method=$method;params=$params}|ConvertTo-Json -Compress -Depth 10; $b=[Text.Encoding]::UTF8.GetBytes($msg); $seg=New-Object ArraySegment[byte](,$b); $ws.SendAsync($seg,[Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() }
function Recv-CDP($timeoutMs=10000){ $buf=New-Object byte[] 1048576; $mem=New-Object IO.MemoryStream; $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs); while([DateTime]::UtcNow -lt $deadline){ $seg=New-Object ArraySegment[byte](,$buf); $task=$ws.ReceiveAsync($seg,$ct); if(-not $task.Wait([Math]::Max(200,[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds))){ break }; $r=$task.Result; if($r.Count -gt 0){ $mem.Write($buf,0,$r.Count) }; if($r.EndOfMessage){ break } }; [Text.Encoding]::UTF8.GetString($mem.ToArray()) }
Send-CDP 1 'Runtime.enable' @{}
[void](Recv-CDP 5000)
Start-Sleep -Seconds 3
Send-CDP 2 'Runtime.evaluate' @{expression="JSON.stringify({skins: window.__openniteSkins||null, status: document.querySelector('#status')?.textContent?.slice(0,100)})"; returnByValue=$true}
$r2=Recv-CDP 8000; Write-Output $r2
$ws.Dispose()
