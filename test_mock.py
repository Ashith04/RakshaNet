import asyncio
import time
import mock_engine

async def test():
    # Insert a vessel
    mock_engine.vessels[12345] = {
        "mmsi": 12345,
        "lat": 11.0,
        "lon": 73.0,
        "sog": 10.0,
        "cog": 90.0,
        "ship_name": "Test Ship",
        "status": "normal",
        "timestamp": time.time(),
        "source": "SIMULATED",
        "current_grid": "H07",
        "previous_grid": None,
        "threat_data": None
    }
    
    # Run threat_detection_loop once
    loop_task = asyncio.create_task(mock_engine.threat_detection_loop())
    await asyncio.sleep(2.0)
    print("Vessel Status:", mock_engine.vessels[12345]["status"])
    loop_task.cancel()

asyncio.run(test())
