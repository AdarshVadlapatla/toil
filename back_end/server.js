import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import Supercluster from 'supercluster';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabaseUrl = 'https://cybbfiogqisodsytxlnx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5YmJmaW9ncWlzb2RzeXR4bG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODU5MTksImV4cCI6MjA3NzE2MTkxOX0.qVeVI8geTuaO7ovJNV7EVY_ySHkHR7yvL8Oeyv6P4E0';

const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory cache for wells
let wellsCache = null;
let superclusterIndex = null;
let cacheLoadTime = null;

// Function to load all wells into memory
async function loadAllWells() {
  console.log('Starting to load all wells into memory...');
  const startTime = Date.now();
  
  const BATCH_SIZE = 1000;
  let wells = [];
  let start = 0;

  while (true) {
    const end = start + BATCH_SIZE - 1;

    const { data: batch, error } = await supabase
      .from('filtered_well_locations')
      .select('surface_id, api, wellid, lat83, long83')
      .range(start, end);

    if (error) {
      console.error('Error fetching wells batch:', error);
      throw error;
    }

    if (!batch || batch.length === 0) {
      break;
    }

    wells = wells.concat(batch);
    console.log(`Loaded ${wells.length} wells so far...`);

    start += BATCH_SIZE;
  }

  const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`All wells loaded! Total: ${wells.length} wells in ${loadTime} seconds`);

  // Convert to GeoJSON features for Supercluster
  const features = wells.map(well => ({
    type: 'Feature',
    properties: {
      id: well.surface_id,
      api: well.api,
      wellid: well.wellid,
      cluster: false
    },
    geometry: {
      type: 'Point',
      coordinates: [well.long83, well.lat83]
    }
  }));

  // Initialize Supercluster
  console.log('Initializing Supercluster index...');
  const index = new Supercluster({
    radius: 60,
    maxZoom: 16,
    minZoom: 0,
    minPoints: 20
  });

  index.load(features);
  console.log('Supercluster index ready!');

  wellsCache = wells;
  superclusterIndex = index;
  cacheLoadTime = new Date();

  return { wells, index };
}

// GET /api/wells - Get wells with clustering
app.get('/api/wells', async (req, res) => {
  try {
    const { zoom, minLat, maxLat, minLon, maxLon } = req.query;

    if (!zoom || !minLat || !maxLat || !minLon || !maxLon) {
      return res
        .status(400)
        .json({ error: 'zoom, minLat, maxLat, minLon, maxLon are required' });
    }

    // Check if cache is loaded
    if (!superclusterIndex) {
      return res.status(503).json({ 
        error: 'Wells data is still loading. Please try again in a moment.',
        loading: true 
      });
    }

    const bbox = [
      parseFloat(minLon),
      parseFloat(minLat),
      parseFloat(maxLon),
      parseFloat(maxLat)
    ];

    const zoomLevel = Math.floor(parseFloat(zoom));

    // Get clusters for this viewport and zoom
    const clusters = superclusterIndex.getClusters(bbox, zoomLevel);

    console.log(`Zoom: ${zoomLevel}, Clusters/Points returned: ${clusters.length}`);

    // Convert clusters back to our expected format
    const features = clusters.map(cluster => {
      if (cluster.properties.cluster) {
        // It's a cluster
        return {
          type: 'Feature',
          properties: {
            cluster: true,
            cluster_id: cluster.id,
            point_count: cluster.properties.point_count,
            point_count_abbreviated: cluster.properties.point_count_abbreviated
          },
          geometry: cluster.geometry
        };
      } else {
        // It's an individual point
        return {
          type: 'Feature',
          properties: {
            id: cluster.properties.id,
            api: cluster.properties.api,
            wellid: cluster.properties.wellid,
            cluster: false
          },
          geometry: cluster.geometry
        };
      }
    });

    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        zoom: zoomLevel,
        clustered: true,
        cacheLoaded: cacheLoadTime ? cacheLoadTime.toISOString() : null
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells/cluster/:id - Expand a cluster to see its children
app.get('/api/wells/cluster/:id', async (req, res) => {
  try {
    const clusterId = parseInt(req.params.id);
    const { zoom } = req.query;

    if (!superclusterIndex) {
      return res.status(503).json({ 
        error: 'Wells data is still loading.',
        loading: true 
      });
    }

    const zoomLevel = zoom ? Math.floor(parseFloat(zoom)) : 10;
    const children = superclusterIndex.getChildren(clusterId);

    res.json({
      type: 'FeatureCollection',
      features: children,
      meta: {
        clusterId,
        zoom: zoomLevel
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells/:id - Get single well details
app.get('/api/wells/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get basic location data
    const { data: locationData, error: locationError } = await supabase
      .from('well_locations')
      .select('*')
      .eq('surface_id', id)
      .single();

    if (locationError) {
      console.error('Location query error:', locationError);
      return res.status(404).json({ error: 'Well not found' });
    }

    // Get detailed well information using API number
    let detailData = null;
    let detailError = null;

    if (locationData.api) {
      console.log(`Querying well_information for API: ${locationData.api}`);
      
      const result = await supabase
        .from('well_information')
        .select('*')
        .eq('api_no', locationData.api)
        .maybeSingle();

      detailData = result.data;
      detailError = result.error;
      
      if (detailError) {
        console.error('Detail query error:', detailError);
      }
      
      if (!detailData) {
        console.log(`No match found in well_information for API: ${locationData.api}`);
      }
    }

    if (detailError) {
      console.error('Detail query error:', detailError);
    }

    // If no detailed data found, still return location data
    if (!detailData) {
      console.log(`No detailed info found for API: ${locationData.api}`);
      return res.json({
        ...locationData,
        detailsAvailable: false
      });
    }

    // Combine both datasets
    res.json({
      ...locationData,
      ...detailData,
      detailsAvailable: true
    });

  } catch (error) {
    console.error('Error fetching well:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells/stats - Get summary statistics
app.get('/api/stats', async (req, res) => {
  try {
    const total = wellsCache ? wellsCache.length : 0;
    
    res.json({ 
      total,
      cacheLoaded: cacheLoadTime ? cacheLoadTime.toISOString() : null,
      ready: superclusterIndex !== null
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cache/reload - Reload the cache (admin endpoint)
app.post('/api/cache/reload', async (req, res) => {
  try {
    console.log('Manual cache reload requested...');
    await loadAllWells();
    res.json({ 
      success: true, 
      message: 'Cache reloaded successfully',
      total: wellsCache.length,
      loadTime: cacheLoadTime
    });
  } catch (error) {
    console.error('Error reloading cache:', error);
    res.status(500).json({ error: 'Failed to reload cache' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'TOIL Backend API is running with in-memory clustering',
    status: 'healthy',
    cacheReady: superclusterIndex !== null,
    wellsCount: wellsCache ? wellsCache.length : 0,
    cacheLoadTime: cacheLoadTime ? cacheLoadTime.toISOString() : 'loading...'
  });
});

// Start server and load wells
app.listen(PORT, async () => {
  console.log(`TOIL Backend server running on port ${PORT}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  
  // Load wells on startup
  try {
    await loadAllWells();
    console.log('Server is ready to handle requests!');
  } catch (error) {
    console.error('Failed to load wells on startup:', error);
    console.error('Server will respond with 503 until cache is loaded');
  }
});