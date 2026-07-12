import sqlite3
spatial_conn = sqlite3.connect(':memory:')
spatial_conn.execute('''
    CREATE VIRTUAL TABLE spatial_index USING rtree(
        id,
        minX, maxX,
        minY, maxY
    )
''')
spatial_conn.execute("INSERT OR REPLACE INTO spatial_index VALUES (1, 72.0, 74.0, 10.0, 12.0)")
spatial_conn.commit()

minX, maxX, minY, maxY = 72.0, 74.0, 10.0, 12.0
cursor = spatial_conn.cursor()
cursor.execute("""
    SELECT id FROM spatial_index 
    WHERE maxX >= ? AND minX <= ? AND maxY >= ? AND minY <= ?
""", (minX, maxX, minY, maxY))
print(cursor.fetchall())
