# TOIL Backend API

Backend API for the TOIL (Texas Oil Investment & Logistics) platform with Supabase/PostGIS integration.

## Setup

1. Install dependencies:
```bash
npm install
```

2. The API URL and Supabase credentials are already configured in `server.js`

3. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will run on port 3001.

## API Endpoints

### GET /api/wells
Fetch wells with zoom-based sampling and filtering.

**Query Parameters:**
- `zoom` (required) - Map zoom level (6-19)
- `minLat, maxLat, minLon, maxLon` (required) - Bounding box coordinates
- `api` (optional) - Filter by API number (partial match)
- `wellid` (optional) - Filter by well ID (partial match)

**Response:**
GeoJSON FeatureCollection with well points

### GET /api/wells/:id
Get detailed information for a specific well by ID.

### GET /api/wells/stats
Get summary statistics (total well count).

## Database Schema

The `well_data` table has the following columns:
- `gid` - Unique ID
- `api` - API number
- `wellid` - Well ID
- `lat83, long83` - WGS84 coordinates
- `geom` - PostGIS geometry column

## How It Works

The API uses zoom-based sampling to limit the number of wells returned:
- Zoom < 7: 500 wells max
- Zoom < 9: 1,000 wells max
- Zoom < 11: 5,000 wells max
- Zoom < 13: 10,000 wells max
- Zoom >= 13: 50,000 wells max

This ensures the map doesn't load too many points when zoomed out, and progressively loads more detail as you zoom in.

