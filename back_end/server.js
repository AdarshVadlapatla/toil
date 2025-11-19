import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());


// Supabase client
const supabaseUrl = 'https://cybbfiogqisodsytxlnx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5YmJmaW9ncWlzb2RzeXR4bG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODU5MTksImV4cCI6MjA3NzE2MTkxOX0.qVeVI8geTuaO7ovJNV7EVY_ySHkHR7yvL8Oeyv6P4E0';

const supabase = createClient(supabaseUrl, supabaseKey);

// GET /api/wells - Get ALL wells filtered ONLY by bounding box + API + wellid
app.get('/api/wells', async (req, res) => {
  try {
    const { zoom, minLat, maxLat, minLon, maxLon, api, wellid } = req.query;

    if (!zoom || !minLat || !maxLat || !minLon || !maxLon) {
      return res
        .status(400)
        .json({ error: 'zoom, minLat, maxLat, minLon, maxLon are required' });
    }

    const zoomLevel = parseFloat(zoom);

    // Query all wells in bounding box - NO sampling
    let { data: wells, error } = await supabase
      .from('well_locations')
      .select('surface_id, api, wellid, lat83, long83')
      .gte('lat83', parseFloat(minLat))
      .lte('lat83', parseFloat(maxLat))
      .gte('long83', parseFloat(minLon))
      .lte('long83', parseFloat(maxLon));

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    // FILTER: API substring match (case-insensitive)
    if (api) {
      wells = wells.filter(
        w => w.api && w.api.toLowerCase().includes(api.toLowerCase())
      );
    }

    // FILTER: wellid substring match
    if (wellid) {
      wells = wells.filter(
        w => w.wellid && w.wellid.toLowerCase().includes(wellid.toLowerCase())
      );
    }

    // --- Validate wells exist in well_information ---
    const apis = wells.map(w => w.api).filter(Boolean);

    if (apis.length > 0) {
      const chunkSize = 1000;
      const validApiSet = new Set();

      for (let i = 0; i < apis.length; i += chunkSize) {
        const chunk = apis.slice(i, i + chunkSize);

        const { data: validApis, error: apiError } = await supabase
          .from('well_information')
          .select('api_no')
          .in('api_no', chunk);

        if (apiError) console.error('Error checking well_information:', apiError);
        else validApis.forEach(a => validApiSet.add(a.api_no));
      }

      wells = wells.filter(w => validApiSet.has(w.api));
    } else {
      wells = [];
    }

    // Convert to GeoJSON
    const features = wells.map(well => ({
      type: 'Feature',
      properties: {
        id: well.surface_id,
        api: well.api,
        wellid: well.wellid,
      },
      geometry: {
        type: 'Point',
        coordinates: [well.long83, well.lat83],
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        total: features.length,
        zoom: zoomLevel,
        sampling: false,
      },
    });
  } catch (error) {
    console.error('Error fetching wells:', error);
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

    // Get detailed well information using API number (both are text fields)
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
app.get('/api/wells/stats', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('well_locations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    res.json({ total: count });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'TOIL Backend API is running!',
    status: 'healthy'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`TOIL Backend server running on port ${PORT}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
});
