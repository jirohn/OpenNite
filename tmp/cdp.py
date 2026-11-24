import sys, json, time, base64, os

# CDP helper: python3 tmp/cdp.py <ws-file> <expr-file> [wait_sec]
def main():
    url = open(sys.argv[1], encoding='utf-8').read().strip()
    expr = open(sys.argv[2], encoding='utf-8').read()
    wait_sec = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    try:
        import websockets
    except ImportError:
        print('no websockets lib'); sys.exit(2)
    async def run():
        async with websockets.connect(url, max_size=None) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            if wait_sec: await __import__('asyncio').sleep(wait_sec)
            await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate',
                                      'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
            got = {}
            for _ in range(30):
                try:
                    msg = json.loads(await ws.recv())
                except Exception as e:
                    print('recv-err', e); break
                if msg.get('id') in (1, 2):
                    got[msg['id']] = msg
                if 2 in got and 1 in got:
                    r = got[2].get('result', {})
                    val = r.get('result', {}).get('value')
                    print('RESULT', val if val is not None else r)
                    return
            print('TIMEOUT')
    import asyncio
    asyncio.run(run())

if __name__ == '__main__':
    main()
