# GIS-Based Map Viewport Filtering Implementation

## Overview

This document describes the Zillow-style map-based filtering and pagination system implemented using GIS shapefiles. The system loads only listings visible in the current map viewport, reducing load and improving performance as data grows.

## Architecture

### Components

1. **Backend API Endpoint** (`GET /api/people/within-bounds`)
   - Accepts map bounds (minLng, minLat, maxLng, maxLat)
   - Returns only listings within the viewport
   - Supports GIS-based regional filtering (province, county, city)
   - Supports pagination and other filters (search, role, relationship)

2. **Person Model** (`models/Person.js`)
   - Added `administrativeRegion` field with province, county, bakhsh, city
   - Indexes added for efficient regional filtering

3. **Boundary Model** (`models/Boundary.js`)
   - Stores administrative boundaries as GeoJSON
   - Supports spatial queries to determine region membership
   - Hierarchical structure (province → county → bakhsh)

4. **GIS Utilities** (`tools/`)
   - Shapefile to GeoJSON converter
   - Boundary importer for MongoDB
   - Person region updater utility

5. **Frontend** (`map-listings.js`)
   - Viewport-based loading with map bounds tracking
   - Event listeners for map move/zoom
   - Debounced API calls to prevent excessive requests

## API Endpoint

### GET /api/people/within-bounds

**Required Parameters:**
- `minLng` - Minimum longitude (map bounds)
- `minLat` - Minimum latitude (map bounds)
- `maxLng` - Maximum longitude (map bounds)
- `maxLat` - Maximum latitude (map bounds)

**Optional Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 200)
- `search` - Search term (searches name, address, phone)
- `province` - Filter by province name
- `county` - Filter by county/shahrestan name
- `city` - Filter by city name
- `role` - Filter by role tag
- `relationship` - Filter by family relationship
- `isActive` - Filter by active status (default: true)

**Example:**
```
GET /api/people/within-bounds?minLng=51.0&minLat=35.0&maxLng=52.0&maxLat=36.0&province=Tehran&page=1&limit=50
```

**Response:**
```json
{
  "success": true,
  "message": "People within bounds found successfully",
  "data": {
    "people": [...],
    "bounds": {
      "minLng": 51.0,
      "minLat": 35.0,
      "maxLng": 52.0,
      "maxLat": 36.0
    },
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "filters": {
      "search": "",
      "province": "Tehran",
      "county": "",
      "city": "",
      "role": "",
      "relationship": "",
      "isActive": true
    }
  }
}
```

## Setup Instructions

### 1. Install Shapefile Conversion Library

```bash
npm install @mapbox/shapefile
# OR
npm install shapefile
```

### 2. Convert Shapefiles to GeoJSON

```bash
# Convert provinces
node tools/shapefile-to-geojson.js "tools/شیپ فایل تقسیمات مرز سیاسی استانهای  ایران/Export_Output_2.shp" province tools/geojson/provinces.json

# Convert counties
node tools/shapefile-to-geojson.js "tools/shahrestan layer/shrestan.shp" county tools/geojson/counties.json

# Convert bakhsh (districts)
node tools/shapefile-to-geojson.js "tools/bakhsh/BAKHSH.shp" bakhsh tools/geojson/bakhsh.json
```

### 3. Import Boundaries to MongoDB

```bash
node tools/import-boundaries.js tools/geojson/provinces.json
node tools/import-boundaries.js tools/geojson/counties.json
node tools/import-boundaries.js tools/geojson/bakhsh.json
```

### 4. Update Existing Person Documents

```bash
# Dry run first
node tools/update-person-regions.js --dry-run

# Actually update
node tools/update-person-regions.js
```

## Frontend Implementation

### Viewport Tracking

The frontend automatically tracks map viewport changes:

- Listens to `moveend` and `zoomend` events
- Debounces API calls (300ms delay)
- Resets to page 1 when viewport changes
- Loads 50 listings per page

### Usage

```javascript
// The viewport-based loading is automatic
// When map moves or zooms, listings are reloaded for the new viewport

// To manually reload for current viewport:
loadListingsForViewport();

// To load next page:
loadMoreListings();
```

## Benefits

1. **Performance**: Only loads visible data, dramatically reducing load times
2. **Scalability**: Works efficiently with large datasets (100K+ listings)
3. **User Experience**: Faster, smoother map interactions
4. **Regional Filtering**: Use GIS boundaries for accurate province/county/city filtering
5. **Zillow-like Behavior**: Map-driven navigation and filtering

## Database Indexes

The following indexes are created for optimal performance:

**Person Model:**
- `location: '2dsphere'` - Geospatial queries
- `administrativeRegion.province` - Province filtering
- `administrativeRegion.county` - County filtering
- `administrativeRegion.city` - City filtering

**Boundary Model:**
- `geometry: '2dsphere'` - Spatial queries
- `level` - Administrative level lookups
- `name` - Region name lookups
- `parentLevel + parent` - Hierarchical queries

## Future Enhancements

1. **Auto-populate regions on Person creation**: Use Boundary model to automatically determine and save administrative regions when creating new Person documents

2. **Regional filter dropdowns**: Add UI dropdowns for province/county/city filtering in the frontend

3. **Clustering**: Implement marker clustering for better performance with many markers

4. **Caching**: Cache viewport query results for frequently viewed areas

5. **Boundary visualization**: Optionally display administrative boundaries on the map

## Troubleshooting

### Shapefile conversion fails
- Ensure shapefile library is installed: `npm install @mapbox/shapefile`
- Check that shapefile path is correct
- Verify shapefile is in WGS84 (EPSG:4326) coordinate system

### No boundaries found for locations
- Run `update-person-regions.js` to populate administrative regions
- Verify boundaries are imported correctly
- Check that Person locations have valid coordinates

### API returns no results
- Verify map bounds are correct (minLng < maxLng, minLat < maxLat)
- Check that there are Person documents within the bounds
- Ensure `location` field has 2dsphere index (run `ensureGeospatialIndexes.js`)

## Notes

- Map viewport queries use MongoDB's `$geoWithin` with `$box` operator for efficient bounding box queries
- Administrative regions are determined using `$geoIntersects` queries on Boundary geometries
- The system maintains backward compatibility - the old `/api/people` endpoint still works

