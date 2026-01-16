# GIS Tools and Utilities

This directory contains tools for working with GIS shapefiles and implementing map-based filtering.

## Shapefile Conversion

### Converting Shapefiles to GeoJSON

To convert shapefiles to GeoJSON format for MongoDB storage:

1. **Install shapefile conversion library** (choose one):
   ```bash
   npm install @mapbox/shapefile
   # OR
   npm install shapefile
   ```

2. **Convert shapefile to GeoJSON**:
   ```bash
   node tools/shapefile-to-geojson.js <shapefile-path> <level> [output-path]
   ```

   Examples:
   ```bash
   # Convert provinces shapefile
   node tools/shapefile-to-geojson.js "tools/شیپ فایل تقسیمات مرز سیاسی استانهای  ایران/Export_Output_2.shp" province tools/geojson/provinces.json
   
   # Convert counties shapefile
   node tools/shapefile-to-geojson.js "tools/shahrestan layer/shrestan.shp" county tools/geojson/counties.json
   
   # Convert bakhsh (districts) shapefile
   node tools/shapefile-to-geojson.js "tools/bakhsh/BAKHSH.shp" bakhsh tools/geojson/bakhsh.json
   ```

3. **Import boundaries to MongoDB**:
   ```bash
   node tools/import-boundaries.js tools/geojson/provinces.json
   node tools/import-boundaries.js tools/geojson/counties.json
   node tools/import-boundaries.js tools/geojson/bakhsh.json
   ```

### Alternative: Using GDAL (ogr2ogr)

If you prefer using GDAL instead of Node.js libraries:

1. **Install GDAL**: https://gdal.org/

2. **Convert shapefile to GeoJSON**:
   ```bash
   ogr2ogr -f GeoJSON output.json input.shp
   ```

3. **Manually transform to our format** and import using `import-boundaries.js`

## Updating Person Administrative Regions

After importing boundaries, update existing Person documents with their administrative regions:

```bash
# Dry run (see what would be updated without making changes)
node tools/update-person-regions.js --dry-run

# Actually update the regions
node tools/update-person-regions.js
```

This script:
- Finds all Person documents with location coordinates
- Determines which administrative regions (province, county, bakhsh) each location belongs to
- Updates the `administrativeRegion` field in the Person model

## Directory Structure

- `shapefile-to-geojson.js` - Converts shapefiles to GeoJSON format
- `import-boundaries.js` - Imports GeoJSON boundaries to MongoDB
- `update-person-regions.js` - Updates Person documents with administrative regions
- `1390/` - Contains shapefiles for year 1390
- `bakhsh/` - Contains bakhsh (district) boundaries
- `shahrestan layer/` - Contains county/shahrestan boundaries
- `شیپ فایل  تقسیمات مرز سیاسی استانهای  ایران/` - Contains province boundaries

## Workflow

1. **Convert shapefiles** (one-time setup):
   ```bash
   node tools/shapefile-to-geojson.js "tools/شیپ فایل تقسیمات مرز سیاسی استانهای  ایران/Export_Output_2.shp" province tools/geojson/provinces.json
   node tools/shapefile-to-geojson.js "tools/shahrestan layer/shrestan.shp" county tools/geojson/counties.json
   node tools/shapefile-to-geojson.js "tools/bakhsh/BAKHSH.shp" bakhsh tools/geojson/bakhsh.json
   ```

2. **Import to MongoDB** (one-time setup):
   ```bash
   node tools/import-boundaries.js tools/geojson/provinces.json
   node tools/import-boundaries.js tools/geojson/counties.json
   node tools/import-boundaries.js tools/geojson/bakhsh.json
   ```

3. **Update existing Person documents**:
   ```bash
   node tools/update-person-regions.js
   ```

4. **For new Person documents**: The administrative region can be automatically determined during creation using the Boundary model's `findAllContainingRegions()` method.

## API Usage

The viewport-based API endpoint (`GET /api/people/within-bounds`) now supports GIS-based filtering:

- `province` - Filter by province name
- `county` - Filter by county/shahrestan name  
- `city` - Filter by city name

Example:
```
GET /api/people/within-bounds?minLng=51.0&minLat=35.0&maxLng=52.0&maxLat=36.0&province=Tehran
```

## Notes

- Shapefiles must be in WGS84 (EPSG:4326) coordinate system
- The conversion scripts try to automatically extract region names from common field names
- Administrative regions are stored hierarchically (county has province as parent, etc.)
- Spatial queries use MongoDB's 2dsphere index for fast geospatial operations

