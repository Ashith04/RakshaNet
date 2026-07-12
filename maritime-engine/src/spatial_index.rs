use geo::{Contains, BoundingRect, Point, Polygon, Coord, LineString};
use rstar::{RTree, RTreeObject, AABB};

use crate::config::ZoneConfig;

/// A geofence zone stored in the R-Tree
#[derive(Debug, Clone)]
pub struct GeofenceZone {
    pub name: String,
    pub polygon: Polygon<f64>,
    envelope: AABB<[f64; 2]>,
    pub centroid_lat: f64,
    pub centroid_lon: f64,
}

impl GeofenceZone {
    pub fn from_config(config: &ZoneConfig) -> Option<Self> {
        if config.polygon.len() < 3 {
            return None;
        }

        let mut coords: Vec<Coord<f64>> = config
            .polygon
            .iter()
            .map(|p| Coord { x: p[0], y: p[1] }) // [lon, lat] → x=lon, y=lat
            .collect();

        // Ensure the polygon is explicitly closed, which the `geo` crate requires for `contains()`!
        if let (Some(first), Some(last)) = (coords.first().copied(), coords.last().copied()) {
            if first != last {
                coords.push(first);
            }
        }

        let polygon = Polygon::new(LineString::new(coords.clone()), vec![]);

        let bbox = polygon.bounding_rect()?;
        let envelope = AABB::from_corners(
            [bbox.min().x, bbox.min().y],
            [bbox.max().x, bbox.max().y],
        );

        // Compute centroid as simple average
        let n = config.polygon.len() as f64;
        let centroid_lon = config.polygon.iter().map(|p| p[0]).sum::<f64>() / n;
        let centroid_lat = config.polygon.iter().map(|p| p[1]).sum::<f64>() / n;

        Some(Self {
            name: config.name.clone(),
            polygon,
            envelope,
            centroid_lat,
            centroid_lon,
        })
    }
}

impl RTreeObject for GeofenceZone {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

/// Spatial index holding geofence zones in an R-Tree
#[derive(Debug)]
pub struct SpatialIndex {
    tree: RTree<GeofenceZone>,
    zones: Vec<GeofenceZone>, // kept for centroid lookups during AIS gap checks
}

impl SpatialIndex {
    /// Build spatial index from zone configs
    pub fn build(zone_configs: &[ZoneConfig]) -> Self {
        let zones: Vec<GeofenceZone> = zone_configs
            .iter()
            .filter_map(|zc| GeofenceZone::from_config(zc))
            .collect();

        let tree = RTree::bulk_load(zones.clone());

        tracing::info!("Built spatial index with {} geofence zones", zones.len());

        Self { tree, zones }
    }

    /// Check if a point is inside any geofence zone. Returns matching zone names.
    /// Uses R-Tree envelope check → O(log n), then exact point-in-polygon for candidates.
    pub fn check_geofences(&self, lon: f64, lat: f64) -> Vec<&str> {
        let query_point = AABB::from_point([lon, lat]);
        let point = Point::new(lon, lat);

        self.tree
            .locate_in_envelope_intersecting(&query_point)
            .filter(|zone| zone.polygon.contains(&point))
            .map(|zone| zone.name.as_str())
            .collect()
    }

    /// Find distance to nearest geofence zone centroid (for AIS gap severity boosting)
    pub fn distance_to_nearest_zone_nm(&self, lon: f64, lat: f64) -> f64 {
        self.zones
            .iter()
            .map(|zone| haversine_nm(lat, lon, zone.centroid_lat, zone.centroid_lon))
            .fold(f64::MAX, f64::min)
    }

    /// Get all zone names and polygons (for dashboard API)
    pub fn get_zones(&self) -> Vec<ZoneInfo> {
        self.zones
            .iter()
            .map(|z| {
                let coords: Vec<[f64; 2]> = z
                    .polygon
                    .exterior()
                    .coords()
                    .map(|c| [c.x, c.y])
                    .collect();
                ZoneInfo {
                    name: z.name.clone(),
                    polygon: coords,
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ZoneInfo {
    pub name: String,
    pub polygon: Vec<[f64; 2]>,
}

/// Haversine distance in nautical miles
pub fn haversine_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 3440.065; // Earth radius in nautical miles
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let lat1_r = lat1.to_radians();
    let lat2_r = lat2.to_radians();

    let a = (d_lat / 2.0).sin().powi(2) + lat1_r.cos() * lat2_r.cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    r * c
}
