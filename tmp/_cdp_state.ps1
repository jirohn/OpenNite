$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]'ws://127.0.0.1:9222/devtools/page/4A0923E971FEC9E5FB8737BE1E84F3EE',$ct).Wait()
function Send-CDP($id,$method,$params=@{}){ $msg=@{id=$id;method=$method;params=$params}|ConvertTo-Json -Compress -Depth 10; $b=[Text.Encoding]::UTF8.GetBytes($msg); $seg=New-Object ArraySegment[byte](,$b); $ws.SendAsync($seg,[Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() }
function Recv-Id($id,$timeoutMs=10000){ $buf=New-Object byte[] 1048576; $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs); while([DateTime]::UtcNow -lt $deadline){ $seg=New-Object ArraySegment[byte](,$buf); $task=$ws.ReceiveAsync($seg,$ct); $rem=[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds; if($rem -lt 50){break}; if(-not $task.Wait([Math]::Min(1000,[Math]::Max(200,$rem)))){ continue }; $r=$task.Result; $mem=New-Object IO.MemoryStream; $mem.Write($buf,0,$r.Count); while(-not $r.EndOfMessage){ $seg2=New-Object ArraySegment[byte](,$buf); $t2=$ws.ReceiveAsync($seg2,$ct); if(-not $t2.Wait(2000)){break}; $r=$t2.Result; $mem.Write($buf,0,$r.Count) }; $m=[Text.Encoding]::UTF8.GetString($mem.ToArray()); try{ $o=$m|ConvertFrom-Json; if($o.id -eq $id){ return $m } }catch{} }; return $null }
Send-CDP 1 'Runtime.enable' @{}; [void](Recv-Id 1 5000)
Send-CDP 2 'Runtime.evaluate' @{expression="JSON.stringify({title:document.title, status:document.getElementById('statusBar')?.textContent?.slice(0,120), anims:[...document.querySelectorAll('#animSelect option')].map(o=>o.value).slice(0,15), animCount:document.querySelectorAll('#animSelect option').length})"; returnByValue=$true}
$r=Recv-Id 2 8000; Write-Output $r
$ws.Dispose()
