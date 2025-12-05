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
let wellsWithDetailsCache = null;
let superclusterIndex = null;
let cacheLoadTime = null;
let filterOptions = null;

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

  wellsCache = wells;
  cacheLoadTime = new Date();

  return wells;
}

// Function to load well details for filtering
async function loadWellDetails() {
  console.log('Loading well details for filtering...');
  const BATCH_SIZE = 1000;
  let wellDetails = [];
  let start = 0;

  while (true) {
    const end = start + BATCH_SIZE - 1;

    const { data: batch, error } = await supabase
      .from('filtered_well_information')
      .select('api_no, county_name, district_code, oil_gas_code, completion_date, api_depth, lease_name, operator_name, field_name')
      .range(start, end);

    if (error) {
      console.error('Error fetching well details batch:', error);
      throw error;
    }

    if (!batch || batch.length === 0) {
      break;
    }

    wellDetails = wellDetails.concat(batch);
    console.log(`Loaded ${wellDetails.length} well details so far...`);

    start += BATCH_SIZE;
  }

  console.log(`Well details loaded! Total: ${wellDetails.length}`);
  wellsWithDetailsCache = wellDetails;

  // Extract unique filter options
  const counties = [...new Set(wellDetails.map(w => w.county_name).filter(Boolean))].sort();
  const districts = [...new Set(wellDetails.map(w => w.district_code).filter(Boolean))].sort();

  filterOptions = { counties, districts };
  console.log(`Filter options ready: ${counties.length} counties, ${districts.length} districts`);

  return wellDetails;
}

// Function to create supercluster index from filtered wells
function createSuperclusterIndex(wells) {
  console.log(`Creating Supercluster index for ${wells.length} wells...`);
  
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

  const index = new Supercluster({
    radius: 60,
    maxZoom: 16,
    minZoom: 0,
    minPoints: 20
  });

  index.load(features);
  console.log('Supercluster index ready!');
  
  return index;
}

// Initialize supercluster with all wells
async function initializeSupercluster() {
  if (wellsCache) {
    superclusterIndex = createSuperclusterIndex(wellsCache);
  }
}

// GET /api/filter-options - Get available filter options
app.get('/api/filter-options', async (req, res) => {
  try {
    if (!filterOptions) {
      return res.status(503).json({ 
        error: 'Filter options are still loading.',
        loading: true 
      });
    }

    res.json(filterOptions);
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells - Get wells with clustering and optional filtering
app.get('/api/wells', async (req, res) => {
  try {
    const { zoom, minLat, maxLat, minLon, maxLon, counties, districts, wellType, completionDateStart, completionDateEnd, depthMin, depthMax } = req.query;

    if (!zoom || !minLat || !maxLat || !minLon || !maxLon) {
      return res
        .status(400)
        .json({ error: 'zoom, minLat, maxLat, minLon, maxLon are required' });
    }

    // Check if cache is loaded
    if (!wellsCache || !wellsWithDetailsCache) {
      return res.status(503).json({ 
        error: 'Wells data is still loading. Please try again in a moment.',
        loading: true 
      });
    }

    // Parse filters
    const countyFilter = counties ? counties.split(',').filter(Boolean) : [];
    const districtFilter = districts ? districts.split(',').filter(Boolean) : [];
    const wellTypeFilter = wellType && wellType !== 'all' ? wellType : null;
    const dateStart = completionDateStart || null;
    const dateEnd = completionDateEnd || null;
    const minDepth = depthMin ? parseFloat(depthMin) : null;
    const maxDepth = depthMax ? parseFloat(depthMax) : null;

    const hasFilters = countyFilter.length > 0 || districtFilter.length > 0 || wellTypeFilter || dateStart || dateEnd || minDepth !== null || maxDepth !== null;

    let filteredWells = wellsCache;
    let indexToUse = superclusterIndex;

    // Apply filters if any are provided
    if (hasFilters) {
      console.log('Applying filters:', { 
        counties: countyFilter.length, 
        districts: districtFilter.length,
        wellType: wellTypeFilter,
        dateRange: dateStart || dateEnd ? `${dateStart} to ${dateEnd}` : 'none',
        depthRange: minDepth !== null || maxDepth !== null ? `${minDepth} to ${maxDepth}` : 'none'
      });
      
      // Create a map of API to well details for fast lookup
      const apiToDetails = {};
      wellsWithDetailsCache.forEach(detail => {
        if (detail.api_no) {
          apiToDetails[detail.api_no] = detail;
        }
      });

      // Filter wells based on criteria
      filteredWells = wellsCache.filter(well => {
        const details = apiToDetails[well.api];
        if (!details) return false;

        let matches = true;

        // County filter
        if (countyFilter.length > 0) {
          matches = matches && countyFilter.includes(details.county_name);
        }

        // District filter
        if (districtFilter.length > 0) {
          matches = matches && districtFilter.includes(details.district_code);
        }

        // Well type filter
        if (wellTypeFilter) {
          matches = matches && details.oil_gas_code === wellTypeFilter;
        }

        // Completion date range filter
        if (dateStart || dateEnd) {
          const completionDate = details.completion_date;
          if (!completionDate) return false;
          
          if (dateStart && completionDate < dateStart) {
            matches = false;
          }
          if (dateEnd && completionDate > dateEnd) {
            matches = false;
          }
        }

        // Depth range filter
        if (minDepth !== null || maxDepth !== null) {
          const depth = parseFloat(details.api_depth);
          if (isNaN(depth)) return false;
          
          if (minDepth !== null && depth < minDepth) {
            matches = false;
          }
          if (maxDepth !== null && depth > maxDepth) {
            matches = false;
          }
        }

        return matches;
      });

      console.log(`Filtered down to ${filteredWells.length} wells`);
      
      // Create a new supercluster index for filtered results
      indexToUse = createSuperclusterIndex(filteredWells);
    }

    const bbox = [
      parseFloat(minLon),
      parseFloat(minLat),
      parseFloat(maxLon),
      parseFloat(maxLat)
    ];

    const zoomLevel = Math.floor(parseFloat(zoom));

    // Get clusters for this viewport and zoom
    const clusters = indexToUse.getClusters(bbox, zoomLevel);

    console.log(`Zoom: ${zoomLevel}, Clusters/Points returned: ${clusters.length}`);

    // Convert clusters back to our expected format
    const features = clusters.map(cluster => {
      if (cluster.properties.cluster) {
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
        totalFiltered: filteredWells.length,
        totalAll: wellsCache.length,
        zoom: zoomLevel,
        clustered: true,
        filtered: hasFilters,
        cacheLoaded: cacheLoadTime ? cacheLoadTime.toISOString() : null
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells/:id/production - Get production data for a well
app.get('/api/wells/:id/production', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First get the well location to find the API
    const { data: locationData, error: locationError } = await supabase
      .from('well_locations')
      .select('api')
      .eq('surface_id', id)
      .single();
    
    if (locationError || !locationData || !locationData.api) {
      return res.status(404).json({ 
        error: 'Well not found',
        available: false 
      });
    }
    
    // Get well details for matching
    const { data: wellData, error: wellError } = await supabase
      .from('filtered_well_information')
      .select('lease_name, well_no, county_code, district_code, oil_gas_code')
      .eq('api_no', locationData.api)
      .maybeSingle();
    
    if (wellError || !wellData) {
      return res.status(404).json({ 
        error: 'Well details not found',
        available: false 
      });
    }

    // Check if this is a gas well
    if (wellData.oil_gas_code !== 'G') {
      return res.json({
        available: false,
        reason: 'oil_well',
        message: 'Production data is only available for gas wells at this time.'
      });
    }
    
    // Query gas production data using multiple matching fields
    let query = supabase
      .from('gas_production')
      .select('year_month, gas_production, well_type_month')
      .order('year_month', { ascending: true });

    // Match on lease_name, well_no, and county_code only
    if (wellData.lease_name) query = query.eq('lease_name', wellData.lease_name);
    if (wellData.well_no) query = query.eq('well_no', wellData.well_no);
    if (wellData.county_code) query = query.eq('county_code', wellData.county_code);
    
    const { data: productionData, error: prodError } = await query;
    
    if (prodError) {
      console.error('Production query error:', prodError);
      return res.status(500).json({ 
        error: 'Failed to fetch production data',
        available: false 
      });
    }

    // If no production data found
    if (!productionData || productionData.length === 0) {
      return res.json({
        available: false,
        reason: 'no_data',
        message: 'Production data is not available for this well at this time.'
      });
    }
    
    res.json({
      available: true,
      production: productionData,
      wellInfo: {
        leaseName: wellData.lease_name,
        wellNo: wellData.well_no,
        county: wellData.county_code,
        district: wellData.district_code,
        wellType: wellData.oil_gas_code
      }
    });
    
  } catch (error) {
    console.error('Error fetching production data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      available: false 
    });
  }
});

// GET /api/wells/:id - Get single well details
app.get('/api/wells/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: locationData, error: locationError } = await supabase
      .from('well_locations')
      .select('*')
      .eq('surface_id', id)
      .single();

    if (locationError) {
      console.error('Location query error:', locationError);
      return res.status(404).json({ error: 'Well not found' });
    }

    let detailData = null;
    let detailError = null;

    if (locationData.api) {
      console.log(`Querying filtered_well_information for API: ${locationData.api}`);
      
      const result = await supabase
        .from('filtered_well_information')
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

    if (!detailData) {
      console.log(`No detailed info found for API: ${locationData.api}`);
      return res.json({
        ...locationData,
        detailsAvailable: false
      });
    }

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

// GET /api/search - Search wells with autocomplete
app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json({ results: [] });
    }

    // Check if cache is loaded
    if (!wellsCache || !wellsWithDetailsCache) {
      return res.status(503).json({ 
        error: 'Wells data is still loading. Please try again in a moment.',
        loading: true 
      });
    }

    const searchTerm = query.toLowerCase().trim();
    
    // Create a map of API to well details for fast lookup
    const apiToDetails = {};
    wellsWithDetailsCache.forEach(detail => {
      if (detail.api_no) {
        apiToDetails[detail.api_no] = detail;
      }
    });

    // Search through wells and collect matches
    const matches = [];
    const maxResults = 10;

    for (const well of wellsCache) {
      if (matches.length >= maxResults) break;

      const details = apiToDetails[well.api];
      if (!details) continue;

      // Search across multiple fields
      const apiMatch = well.api?.toLowerCase().includes(searchTerm);
      const wellIdMatch = well.wellid?.toLowerCase().includes(searchTerm);
      const leaseMatch = details.lease_name?.toLowerCase().includes(searchTerm);
      const operatorMatch = details.operator_name?.toLowerCase().includes(searchTerm);
      const fieldMatch = details.field_name?.toLowerCase().includes(searchTerm);
      const countyMatch = details.county_name?.toLowerCase().includes(searchTerm);

      if (apiMatch || wellIdMatch || leaseMatch || operatorMatch || fieldMatch || countyMatch) {
        matches.push({
          id: well.surface_id,
          api: well.api,
          wellid: well.wellid,
          leaseName: details.lease_name || 'Unknown Lease',
          operatorName: details.operator_name || 'Unknown Operator',
          fieldName: details.field_name || 'Unknown Field',
          countyName: details.county_name || 'Unknown County',
          lat: well.lat83,
          lon: well.long83,
          matchType: apiMatch ? 'API' : 
                     wellIdMatch ? 'Well ID' : 
                     leaseMatch ? 'Lease' : 
                     operatorMatch ? 'Operator' :
                     fieldMatch ? 'Field' : 'County'
        });
      }
    }

    res.json({ results: matches });

  } catch (error) {
    console.error('Error searching wells:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats - Get summary statistics
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

// POST /api/cache/reload - Reload the cache
app.post('/api/cache/reload', async (req, res) => {
  try {
    console.log('Manual cache reload requested...');
    await loadAllWells();
    await loadWellDetails();
    await initializeSupercluster();
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
    message: 'TOIL Backend API is running with in-memory clustering and filtering',
    status: 'healthy',
    cacheReady: superclusterIndex !== null,
    wellsCount: wellsCache ? wellsCache.length : 0,
    filterOptionsReady: filterOptions !== null,
    cacheLoadTime: cacheLoadTime ? cacheLoadTime.toISOString() : 'loading...'
  });
});

// Start server and load wells
app.listen(PORT, async () => {
  console.log(`TOIL Backend server running on port ${PORT}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  
  try {
    await loadAllWells();
    await loadWellDetails();
    await initializeSupercluster();
    console.log('Server is ready to handle requests!');
  } catch (error) {
    console.error('Failed to load data on startup:', error);
    console.error('Server will respond with 503 until data is loaded');
  }
});