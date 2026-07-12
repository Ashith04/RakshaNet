import asyncio
import websockets
import json

async def main():
    try:
        print("Connecting...")
        async with websockets.connect('wss://stream.aisstream.io/v0/stream') as ws:
            print("Connected.")
            msg = {
                "APIKey": "44a3fd2856db0b3c50708a068f81ef7f550bd959",
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
                "FilterMessageTypes": ["PositionReport"]
            }
            await ws.send(json.dumps(msg))
            print("Subscribed. Waiting for message...")
            data = await ws.recv()
            print("Received:", data[:200])
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
