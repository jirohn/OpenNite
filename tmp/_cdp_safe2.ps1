$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]'ws://127.0.0.1:9222/devtools/page/4A0923E971FEC9E5FB8737BE1E84F3EE',$ct).Wait()
function Send-CDP($id,$method,$params=@{}){ $msg=@{id=$id;method=$method;params=$params}|ConvertTo-Json -Compress -Depth 10; $b=[Text.Encoding]::UTF8.GetBytes($msg); $seg=New-Object ArraySegment[byte](,$b); $ws.SendAsync($seg,[Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() }
function Recv-Msg($timeoutMs=8000){ $buf=New-Object byte[] 1048576; $mem=New-Object IO.MemoryStream; $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs); while([DateTime]::UtcNow -lt $deadline){ $seg=New-Object ArraySegment[byte](,$buf); $task=$ws.ReceiveAsync($seg,$ct); $rem=[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds; if($rem -lt 50){break}; if(-not $task.Wait([Math]::Min(1000,$rem))){ continue }; $r=$task.Result; if($r.Count -gt 0){ $mem.Write($buf,0,$r.Count) }; if($r.EndOfMessage){ return [Text.Encoding]::UTF8.GetString($mem.ToArray()) } }; return $null }
function Recv-Id($id,$timeoutMs=10000){ $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs); while([DateTime]::UtcNow -lt $deadline){ $rem=[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds; $m=Recv-Msg([Math]::Min(2000,[Math]::Max(200,$rem))); if($m){ try{ $o=$m|ConvertFrom-Json; if($o.id -eq $id){ return $m } }catch{} } }; return $null }
Send-CDP 1 'Runtime.enable' @{}
[void](Recv-Id 1 5000)
Start-Sleep -Seconds 2
Send-CDP 2 'Runtime.evaluate' @{expression="(async()=>{ try{ const r=await fetch('/config/character-skins.json',{cache:'no-store'}); const d=await r.json(); return JSON.stringify({skins:(d.skins||[]).map(s=>({id:s.id,name:s.name,default:s.default}))}); }catch(e){ return JSON.stringify({err:String(e)}); } })()"; awaitPromise=$true; returnByValue=$true}
$r=Recv-Id 2 10000; Write-Output $r
$ws.Dispose()
