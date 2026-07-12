polygon = [[72.0, 10.0], [72.0, 12.0], [74.0, 12.0], [74.0, 10.0]]
lon = 73.0
lat = 11.0
inside = False
n = len(polygon)
p1lon, p1lat = polygon[0]
for i in range(n + 1):
    p2lon, p2lat = polygon[i % n]
    if min(p1lon, p2lon) < lon <= max(p1lon, p2lon):
        if lat <= max(p1lat, p2lat):
            if p1lon != p2lon:
                xints = (lon - p1lon) * (p2lat - p1lat) / (p2lon - p1lon) + p1lat
            if p1lon == p2lon or lat <= xints:
                inside = not inside
    p1lon, p1lat = p2lon, p2lat
print("Inside:", inside)
