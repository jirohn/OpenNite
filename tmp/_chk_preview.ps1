$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]'ws://127.0.0.1:9222/devtools/page/BBC8C7A009F741ECDF0733AFE6E28347',$ct).Wait()
function Send-CDP($id,$method,$params=@{}){ $msg=@{id=$id;method=$method;params=$params}|ConvertTo-Json -Compress -Depth 10; $b=[Text.Encoding]::UTF8.GetBytes($msg); $seg=New-Object ArraySegment[byte](,$b); $ws.SendAsync($seg,[Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() }
function Recv-Id($want,$timeoutMs=12000){ $buf=New-Object byte[] 1048576; $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs); while([DateTime]::UtcNow -lt $deadline){ $seg=New-Object ArraySegment[byte](,$buf); $task=$ws.ReceiveAsync($seg,$ct); $rem=[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds; if($rem -lt 50){break}; if(-not $task.Wait([Math]::Min(1000,[Math]::Max(200,$rem)))){ continue }; $r=$task.Result; $mem=New-Object IO.MemoryStream; $mem.Write($buf,0,$r.Count); while(-not $r.EndOfMessage){ $seg2=New-Object ArraySegment[byte](,$buf); $t2=$ws.ReceiveAsync($seg2,$ct); if(-not $t2.Wait(2000)){break}; $r=$t2.Result; $mem.Write($buf,0,$r.Count) }; $m=[Text.Encoding]::UTF8.GetString($mem.ToArray()); try{ $o=$m|ConvertFrom-Json; if($o.id -eq $want){ return $m } }catch{} }; return $null }
Send-CDP 1 'Runtime.enable' @{}; [void](Recv-Id 1 5000)
Start-Sleep -Seconds 4
$expr = @"
(() => { try {
  const g = window.__openniteGame || window.game || null;
  // try to find game
  const app = window.__openniteApp || window.app;
  const game = app?.game || g;
  if(!game) return JSON.stringify({noGame:true, keys:Object.keys(window).filter(k=>/game|opennite/i.test(k)).slice(0,20)});
  return JSON.stringify({
    mode: game.mode, skinPreviewMode: game.skinPreviewMode,
    previewVisible: game.preview?.visible,
    previewCharVisible: game.previewCharacter?.group?.visible,
    previewSkins: (game.previewSkins||[]).map(s=>({v:s.group.visible, x:s.group.position.x, scale:s.group.scale.x, id:s.group.userData.skinId}))
  });
} catch(e){ return JSON.stringify({err:String(e)}); } })()
"@
Send-CDP 2 'Runtime.evaluate' @{expression=$expr; returnByValue=$true}
$r=Recv-Id 2 10000; Write-Output $r
$ws.Dispose()
