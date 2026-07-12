import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)

async def main():
    try:
        logging.info("Connecting to aisstream...")
        async with websockets.connect('wss://stream.aisstream.io/v0/stream') as ws:
            logging.info("Connected!")
            msg = {
                "APIKey": "44a3fd2856db0b3c50708a068f81ef7f550bd959",
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
            }
            await ws.send(json.dumps(msg))
            logging.info("Sent subscription.")
            
            for _ in range(5):
                data = await asyncio.wait_for(ws.recv(), timeout=10.0)
                logging.info(f"Received: {data[:200]}")
    except Exception as e:
        logging.error(f"Error: {e}")

asyncio.run(main())
