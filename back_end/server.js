import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import Supercluster from 'supercluster';
import { linearRegression, standardDeviation, mean } from 'simple-statistics';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Validate required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('ERROR: Missing required environment variables!');
  console.error('Please ensure SUPABASE_URL and SUPABASE_KEY are set in your .env file');
  process.exit(1);
}

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN === '*'
    ? '*'
    : process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()) || '*',
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory cache for wells (minimal data for clustering)
let wellsCache = null;
let superclusterIndex = null;
let superclusterIndexActive = null;
let superclusterIndexInactive = null;
let cacheLoadTime = null;
let filterOptions = null;
let activeWellIds = new Set();
let tceqDataCache = null; // New cache for official contamination cases
let activeWellsCount = 0;
let inactiveWellsCount = 0;
let wellsWithDetailsCache = null;   // Enhanced Search: Memory-optimized metadata cache
let globalApiToDetails = null;      // Enhanced Search: Fast lookup map (API -> Details)
let productionStatsCache = null;    // Future Analytics cache

// Utility for fast keyset pagination
async function fetchKeysetPaginated(tableName, selectStr, orderColumn, batchSize = 1000) {
  let allData = [];
  let lastVal = null;
  console.log(`Starting keyset fetch from ${tableName} ordering by ${orderColumn}...`);

  while (true) {
    let query = supabase
      .from(tableName)
      .select(selectStr)
      .order(orderColumn, { ascending: true })
      .limit(batchSize);

    if (lastVal !== null) {
      query = query.gt(orderColumn, lastVal);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error(`Error keyset fetching from ${tableName}:`, error);
      throw error;
    }
    
    if (!data || data.length === 0) break;
    
    allData = allData.concat(data);
    lastVal = data[data.length - 1][orderColumn];

    if (allData.length % 50000 === 0) {
      console.log(`Loaded ${allData.length} records from ${tableName} so far...`);
    }

    if (data.length < batchSize) break;
  }
  
  return allData;
}

// Utility for concurrent fetching
async function fetchConcurrentBatches(tableName, selectStr, concurrency = 5, batchSize = 1000) {
  let allData = [];
  let start = 0;
  
  while (true) {
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      const batchStart = start + (i * batchSize);
      const batchEnd = batchStart + batchSize - 1;
      promises.push(
        supabase
          .from(tableName)
          .select(selectStr)
          .range(batchStart, batchEnd)
      );
    }
    
    const results = await Promise.all(promises);
    let hasMore = true;
    
    for (const { data, error } of results) {
      if (error) {
        console.error(`Error fetching from ${tableName}:`, error);
        throw error;
      }
      if (!data || data.length === 0) {
        hasMore = false;
        continue;
      }
      allData = allData.concat(data);
      if (data.length < batchSize) {
        hasMore = false;
      }
    }
    
    console.log(`Loaded ${allData.length} records from ${tableName} so far...`);
    
    if (!hasMore) break;
    start += batchSize * concurrency;
  }
  
  return allData;
}

// Function to load all wells into memory
async function loadAllWells() {
  console.log('Starting to load all wells into memory...');
  const startTime = Date.now();

  let wells = await fetchKeysetPaginated('well_locations', 'surface_id, api, wellid, lat83, long83', 'surface_id');

  const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`All wells loaded! Total: ${wells.length} wells in ${loadTime} seconds`);

  wells.forEach(well => {
    well.isActive = activeWellIds.has(well.surface_id);
  });
  
  wellsCache = wells;
  cacheLoadTime = new Date();

  return wells;
}

async function loadWellDetails() {
  console.log('Loading well details for filtering (Memory Optimized)...');
  // Only fetch the 10 absolute essential columns for search and filtering
  let wellDetails = await fetchKeysetPaginated(
    'well_information', 
    'api_no, county_name, district_code, oil_gas_code, completion_date, api_depth, lease_name, operator_name, field_name, plug_date',
    'api_no'
  );

  console.log(`Well details loaded! Total: ${wellDetails.length}`);
  wellsWithDetailsCache = wellDetails;

  // Build the global fast-lookup map ONCE at startup
  const apiMap = {};
  wellDetails.forEach(detail => {
    if (detail.api_no) apiMap[String(detail.api_no)] = detail;
  });
  globalApiToDetails = apiMap;
  console.log(`Built global API lookup map with ${Object.keys(globalApiToDetails).length} entries`);

  // Extract unique filter options from the loaded data (no extra DB calls needed)
  const counties = [...new Set(wellDetails.map(w => w.county_name).filter(Boolean))].sort();
  const districts = [...new Set(wellDetails.map(w => w.district_code).filter(Boolean))].sort();
  const operators = [...new Set(wellDetails.map(w => w.operator_name).filter(Boolean))].sort();
  const fields = [...new Set(wellDetails.map(w => w.field_name).filter(Boolean))].sort();

  filterOptions = { counties, districts, operators, fields };
  console.log(`Filter options ready: ${counties.length} counties, ${districts.length} districts, ${operators.length} operators, ${fields.length} fields`);

  return wellDetails;
}

// Load official TCEQ contamination data from their public ArcGIS API
async function loadTCEQData() {
  console.log('Fetching official TCEQ Groundwater Contamination cases...');
  try {
    const url = 'https://gisweb.tceq.texas.gov/arcgis/rest/services/GW/GW_Contam_Viewer_PRD/MapServer/23/query?where=1%3D1&outFields=COUNTY,FILE_NAME,CONTAMINANTS,LATITUDE,LONGITUDE&f=geojson';
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    
    if (data && data.features) {
      tceqDataCache = data.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        county: f.properties.COUNTY,
        fileName: f.properties.FILE_NAME,
        contaminants: f.properties.CONTAMINANTS,
        intensity: 1 // Single point per case for clean density view
      }));
      console.log(`Successfully loaded ${tceqDataCache.length} official TCEQ contamination cases.`);
    }
  } catch (error) {
    console.error('Error loading official TCEQ data:', error.message);
    tceqDataCache = []; // Fallback to empty
  }
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

async function initializeSupercluster() {
  if (wellsCache) {
    superclusterIndex = createSuperclusterIndex(wellsCache);
    
    const activeWells = wellsCache.filter(w => w.isActive);
    activeWellsCount = activeWells.length;
    superclusterIndexActive = createSuperclusterIndex(activeWells);
    
    const inactiveWells = wellsCache.filter(w => !w.isActive);
    inactiveWellsCount = inactiveWells.length;
    superclusterIndexInactive = createSuperclusterIndex(inactiveWells);
  }
}

async function loadActiveWellIds() {
  console.log('Loading active well IDs...');
  activeWellIds = new Set();
  const activeLocations = await fetchKeysetPaginated('filtered_well_locations', 'surface_id', 'surface_id');
  activeLocations.forEach(row => activeWellIds.add(row.surface_id));
  console.log(`Loaded ${activeWellIds.size} active well IDs`);
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
    const { zoom, minLat, maxLat, minLon, maxLon, counties, districts, operators, fields, wellType, completionDateStart, completionDateEnd, depthMin, depthMax, productionTotalMin, productionTotalMax, productionAvgMin, productionAvgMax, productionMaxMin, productionMaxMax, status } = req.query;

    if (!zoom || !minLat || !maxLat || !minLon || !maxLon) {
      return res
        .status(400)
        .json({ error: 'zoom, minLat, maxLat, minLon, maxLon are required' });
    }

    // Check if cache is loaded (only wellsCache is now required for basic map)
    if (!wellsCache) {
      return res.status(503).json({
        error: 'Wells database cache is still loading. Please try again in a moment.',
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
    const operatorFilter = operators ? operators.split(',').filter(Boolean) : [];
    const fieldFilter = fields ? fields.split(',').filter(Boolean) : [];
    const prodTotalMin = productionTotalMin ? parseFloat(productionTotalMin) : null;
    const prodTotalMax = productionTotalMax ? parseFloat(productionTotalMax) : null;
    const prodAvgMin = productionAvgMin ? parseFloat(productionAvgMin) : null;
    const prodAvgMax = productionAvgMax ? parseFloat(productionAvgMax) : null;
    const prodMaxMin = productionMaxMin ? parseFloat(productionMaxMin) : null;
    const prodMaxMax = productionMaxMax ? parseFloat(productionMaxMax) : null;

    const statusFilter = status || 'active'; // Default to active

    const hasOtherFilters = countyFilter.length > 0 || districtFilter.length > 0 ||
      operatorFilter.length > 0 || fieldFilter.length > 0 ||
      wellTypeFilter || dateStart || dateEnd ||
      minDepth !== null || maxDepth !== null ||
      prodTotalMin !== null || prodTotalMax !== null ||
      prodAvgMin !== null || prodAvgMax !== null ||
      prodMaxMin !== null || prodMaxMax !== null;


    let filteredWells = null;
    let indexToUse = statusFilter === 'active' ? superclusterIndexActive : statusFilter === 'all' ? superclusterIndex : superclusterIndexInactive;

    // Apply filters if any are provided (Database-backed)
    if (hasOtherFilters) {
      console.log(`Applying DB-backed filters. Status: ${statusFilter}`);
      
      try {
        // 1. Build a Supabase query to get ONLY the API numbers that match filters
        // This is much faster and uses 0 Node.js memory
        let query = supabase.from('well_information').select('api_no');

        if (countyFilter.length > 0) query = query.in('county_name', countyFilter);
        if (districtFilter.length > 0) query = query.in('district_code', districtFilter);
        if (operatorFilter.length > 0) query = query.in('operator_name', operatorFilter);
        if (fieldFilter.length > 0) query = query.in('field_name', fieldFilter);
        if (wellTypeFilter) query = query.eq('oil_gas_code', wellTypeFilter);
        if (dateStart) query = query.gte('completion_date', dateStart);
        if (dateEnd) query = query.lte('completion_date', dateEnd);

        const { data: matchedApis, error } = await query.limit(10000);

        if (error) {
          console.error('Error fetching filtered APIs:', error);
        } else if (matchedApis) {
          const apiSet = new Set(matchedApis.map(a => String(a.api_no).padStart(8, '0')));
          
          // 2. Filter the in-memory coordinate cache by these APIs
          filteredWells = wellsCache.filter(well => {
            let matches = apiSet.has(well.api);
            if (statusFilter === 'active' && !well.isActive) matches = matches && false; // Wait, logic below
            if (statusFilter === 'inactive' && well.isActive) matches = matches && false;
            return matches;
          });
          
          // Refine status filtering on memory cache
          if (statusFilter === 'active') filteredWells = filteredWells.filter(w => w.isActive);
          else if (statusFilter === 'inactive') filteredWells = filteredWells.filter(w => !w.isActive);

          console.log(`Filtered down to ${filteredWells.length} wells via DB join.`);
          // 3. Create a temporary supercluster index for these filtered results
          indexToUse = createSuperclusterIndex(filteredWells);
        }
      } catch (e) {
        console.error('Unexpected error in DB filtering:', e);
      }
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
        totalFiltered: filteredWells ? filteredWells.length : (statusFilter === 'active' ? activeWellsCount : statusFilter === 'inactive' ? inactiveWellsCount : wellsCache.length),
        totalAll: wellsCache.length,
        zoom: zoomLevel,
        clustered: true,
        filtered: hasOtherFilters,
        cacheLoaded: cacheLoadTime ? cacheLoadTime.toISOString() : null
      }
    });

  } catch (err) {
    console.error('Error in /api/wells:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      meta: { total: 0, totalFiltered: 0, totalAll: wellsCache ? wellsCache.length : 0 }
    });
  }
});

// Forecasting function using exponential smoothing and linear regression
function forecastProduction(productionData, monthsAhead = 12) {
  if (!productionData || productionData.length < 3) {
    return null;
  }

  // Sort by date to ensure chronological order
  const sorted = [...productionData].sort((a, b) =>
    new Date(a.year_month) - new Date(b.year_month)
  );

  // Extract values and time indices
  const values = sorted.map(d => parseFloat(d.gas_production) || 0);
  const n = values.length;

  // Calculate trend using linear regression
  const timeIndices = values.map((_, i) => i);
  const regression = linearRegression(
    timeIndices.map((x, i) => [x, values[i]])
  );

  // Exponential smoothing parameters
  const alpha = 0.3; // Smoothing factor for level
  const beta = 0.2;   // Smoothing factor for trend

  // Initialize with first values
  let level = values[0];
  let trend = n > 1 ? (values[1] - values[0]) : 0;

  // Apply exponential smoothing (Holt's method)
  const smoothed = [values[0]];
  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    smoothed.push(level);
  }

  // Calculate residuals and standard deviation for confidence intervals
  const residuals = values.map((val, i) => val - smoothed[i]);
  const stdDev = residuals.length > 1 ? standardDeviation(residuals) : Math.sqrt(mean(values.map(v => v * v)));
  const meanVal = mean(values);

  // Generate forecasts
  const forecasts = [];
  // Parse the last date properly - handle different date formats
  let lastDateStr = sorted[sorted.length - 1].year_month;
  let lastDate;

  // Try to parse the date string
  if (typeof lastDateStr === 'string') {
    // Handle YYYY-MM-DD format
    if (lastDateStr.includes('-')) {
      const parts = lastDateStr.split('-');
      lastDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2] || 1));
    } else {
      lastDate = new Date(lastDateStr);
    }
  } else {
    lastDate = new Date(lastDateStr);
  }

  // Validate the date
  if (isNaN(lastDate.getTime())) {
    // Fallback to current date if parsing fails
    lastDate = new Date();
  }

  for (let i = 1; i <= monthsAhead; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setMonth(forecastDate.getMonth() + i);

    // Format as YYYY-MM-DD
    const year = forecastDate.getFullYear();
    const month = String(forecastDate.getMonth() + 1).padStart(2, '0');
    const day = '01';
    const formattedDate = `${year}-${month}-${day}`;

    // Use exponential smoothing forecast
    const expForecast = level + (trend * i);

    // Use linear regression forecast
    const linForecast = regression.m * (n + i - 1) + regression.b;

    // Combine both methods (weighted average)
    const combinedForecast = 0.6 * expForecast + 0.4 * linForecast;

    // Ensure forecast doesn't go negative
    const forecast = Math.max(0, combinedForecast);

    // Calculate confidence intervals (95% confidence)
    // Use a simpler formula if stdDev is very small or zero
    const baseInterval = stdDev > 0 ? stdDev : Math.abs(forecast * 0.1);
    const confidenceInterval = 1.96 * baseInterval * Math.sqrt(1 + (1 / n) + (Math.pow(i, 2) / Math.max(1, n * (n + 1) / 2)));
    const upperBound = forecast + confidenceInterval;
    const lowerBound = Math.max(0, forecast - confidenceInterval);

    forecasts.push({
      year_month: formattedDate,
      forecast: Math.round(forecast),
      upper_bound: Math.round(upperBound),
      lower_bound: Math.round(lowerBound),
      confidence: 0.95
    });
  }

  return {
    forecasts,
    model_info: {
      method: 'exponential_smoothing_linear_regression',
      data_points: n,
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      avg_production: Math.round(meanVal),
      std_deviation: Math.round(stdDev),
      last_known_date: sorted[sorted.length - 1].year_month
    }
  };
}

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
      .from('well_information')
      .select('lease_name, well_no, county_code, district_code, oil_gas_code')
      .eq('api_no', locationData.api)
      .maybeSingle();

    if (wellError || !wellData) {
      return res.json({
        available: false,
        reason: 'no_details',
        message: 'No production data available for this well.'
      });
    }

    // Check if this is a gas well
    if (wellData.oil_gas_code === 'O') {
      return res.json({
        available: false,
        reason: 'oil_well',
        message: 'Production data is only available for gas wells at this time.'
      });
    } else if (wellData.oil_gas_code !== 'G') {
      return res.json({
        available: false,
        reason: 'no_details',
        message: 'No production data available for this well.'
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

// GET /api/wells/:id/forecast - Get AI forecast for production data
app.get('/api/wells/:id/forecast', async (req, res) => {
  try {
    const { id } = req.params;
    const monthsAhead = parseInt(req.query.months) || 12;

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
      .from('well_information')
      .select('lease_name, well_no, county_code, district_code, oil_gas_code')
      .eq('api_no', locationData.api)
      .maybeSingle();

    if (wellError || !wellData) {
      return res.json({
        available: false,
        reason: 'no_details',
        message: 'No forecasting data available for this well.'
      });
    }

    // Check if this is a gas well
    if (wellData.oil_gas_code === 'O') {
      return res.json({
        available: false,
        reason: 'oil_well',
        message: 'Forecasting is only available for gas wells at this time.'
      });
    } else if (wellData.oil_gas_code !== 'G') {
      return res.json({
        available: false,
        reason: 'no_details',
        message: 'No forecasting data available for this well.'
      });
    }

    // Query gas production data
    let query = supabase
      .from('gas_production')
      .select('year_month, gas_production, well_type_month')
      .order('year_month', { ascending: true });

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

    if (!productionData || productionData.length < 3) {
      return res.json({
        available: false,
        reason: 'insufficient_data',
        message: 'At least 3 months of production data are required for forecasting.'
      });
    }

    // Generate forecast
    const forecast = forecastProduction(productionData, monthsAhead);

    if (!forecast) {
      return res.json({
        available: false,
        reason: 'forecast_failed',
        message: 'Unable to generate forecast with available data.'
      });
    }

    res.json({
      available: true,
      forecast: forecast.forecasts,
      model_info: forecast.model_info,
      historical_data_points: productionData.length,
      wellInfo: {
        leaseName: wellData.lease_name,
        wellNo: wellData.well_no,
        county: wellData.county_code,
        district: wellData.district_code,
        wellType: wellData.oil_gas_code
      }
    });

  } catch (error) {
    console.error('Error generating forecast:', error);
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

    if (!detailData) {
      console.log(`No detailed info found for API: ${locationData.api}`);
      return res.json({
        ...locationData,
        isActive: activeWellIds.has(parseInt(id)),
        detailsAvailable: false
      });
    }

    const wellTypeName = detailData.oil_gas_code === 'O' ? 'Oil' : 
                         detailData.oil_gas_code === 'G' ? 'Gas' : 'Unknown';

    res.json({
      ...locationData,
      isActive: activeWellIds.has(parseInt(id)),
      ...detailData,
      well_type_name: wellTypeName,
      detailsAvailable: true
    });

  } catch (error) {
    console.error('Error fetching well:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wells/:id/compliance - Get compliance data (inspections and violations)
app.get('/api/wells/:id/compliance', async (req, res) => {
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

    // Prepare API search variants (handle 8-digit vs 10-digit with 42 prefix)
    const apiVariants = [locationData.api];
    if (locationData.api.length === 8 && !locationData.api.startsWith('42')) {
      apiVariants.push('42' + locationData.api);
    } else if (locationData.api.length === 10 && locationData.api.startsWith('42')) {
      apiVariants.push(locationData.api.substring(2));
    }

    // Try to fetch inspections
    const { data: inspections, error: inspectionsError } = await supabase
      .from('well_inspections')
      .select('*')
      .in('api_no', apiVariants)
      .order('inspection_date', { ascending: false });

    if (inspectionsError) {
      console.error('Inspections query error:', inspectionsError);
      // We'll continue but inspections will be empty
    }

    // Try to fetch violations
    const { data: violations, error: violationsError } = await supabase
      .from('well_violations')
      .select('*')
      .in('api_no', apiVariants)
      .order('violation_date', { ascending: false });

    if (violationsError) {
      console.error('Violations query error:', violationsError);
      // We'll continue but violations will be empty
    }

    const safeInspections = inspections || [];
    const safeViolations = violations || [];

    // Return the data, even if empty (meaning no violations/inspections on record)
    res.json({
      available: safeInspections.length > 0 || safeViolations.length > 0,
      inspections: safeInspections,
      violations: safeViolations,
      summary: {
        lastInspected: safeInspections.length > 0 ? safeInspections[0].inspection_date : null,
        openViolations: safeViolations.filter(v => 
          v.status?.toLowerCase().includes('open') || 
          v.status?.toLowerCase().includes('active') ||
          v.status?.toLowerCase().includes('referred') ||
          v.status?.toLowerCase().includes('order')
        ).length,
        complianceStatus: (safeInspections.length === 0 && safeViolations.length === 0) ? 'Unassessed' : 
                          (safeViolations.some(v => 
          v.status?.toLowerCase().includes('open') || 
          v.status?.toLowerCase().includes('active') ||
          v.status?.toLowerCase().includes('referred') ||
          v.status?.toLowerCase().includes('order')
        )) ? 'Non-Compliant' : 'Compliant'
      }
    });

  } catch (error) {
    console.error('Error fetching compliance data:', error);
    res.status(500).json({
      error: 'Internal server error',
      available: false
    });
  }
});

// GET /api/search - Search wells with autocomplete (using Supabase index)
app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json({ results: [] });
    }

    if (!wellsCache || !globalApiToDetails) {
      return res.status(503).json({
        error: 'Wells data is still loading. Please try again in a moment.',
        loading: true
      });
    }

    const searchTerm = query.toLowerCase().trim();
    const matches = [];
    const maxResults = 10;
    const seenApis = new Set();

    // First: search normal wells that have location data
    for (const well of wellsCache) {
      if (matches.length >= maxResults) break;

      const details = globalApiToDetails[String(well.api)];
      if (!details) continue;

      const apiMatch = String(well.api || '').toLowerCase().includes(searchTerm);
      const wellIdMatch = String(well.wellid || '').toLowerCase().includes(searchTerm);
      const leaseMatch = (details.lease_name || '').toLowerCase().includes(searchTerm);
      const operatorMatch = (details.operator_name || '').toLowerCase().includes(searchTerm);
      const fieldMatch = (details.field_name || '').toLowerCase().includes(searchTerm);
      const countyMatch = (details.county_name || '').toLowerCase().includes(searchTerm);

      if (apiMatch || wellIdMatch || leaseMatch || operatorMatch || fieldMatch || countyMatch) {
        matches.push({
          id: well.surface_id,
          api: well.api,
          wellid: well.wellid,
          leaseName: details.lease_name || 'Unknown Lease',
          operatorName: details.operator_name || 'Unknown Operator',
          fieldName: details.field_name || 'Unknown Field',
          countyName: details.county_name || 'Unknown County',
          plugDate: details.plug_date || null,
          lat: well.lat83,
          lon: well.long83,
          detailsAvailable: true,
          hasLocation: true,
          matchType: apiMatch ? 'API' :
            wellIdMatch ? 'Well ID' :
            leaseMatch ? 'Lease' :
            operatorMatch ? 'Operator' :
            fieldMatch ? 'Field' : 'County'
        });

        seenApis.add(String(well.api));
      }
    }

    // Second: search detail-only wells with no matching location row
    if (matches.length < maxResults) {
      for (const [apiNo, details] of Object.entries(globalApiToDetails)) {
        if (matches.length >= maxResults) break;
        if (seenApis.has(apiNo)) continue;

        const apiMatch = apiNo.toLowerCase().includes(searchTerm);
        const leaseMatch = (details.lease_name || '').toLowerCase().includes(searchTerm);
        const operatorMatch = (details.operator_name || '').toLowerCase().includes(searchTerm);
        const fieldMatch = (details.field_name || '').toLowerCase().includes(searchTerm);
        const countyMatch = (details.county_name || '').toLowerCase().includes(searchTerm);

        if (apiMatch || leaseMatch || operatorMatch || fieldMatch || countyMatch) {
          matches.push({
            id: null,
            api: apiNo,
            wellid: null,
            leaseName: details.lease_name || 'Unknown Lease',
            operatorName: details.operator_name || 'Unknown Operator',
            fieldName: details.field_name || 'Unknown Field',
            countyName: details.county_name || 'Unknown County',
            plugDate: details.plug_date || null,
            lat: null,
            lon: null,
            detailsAvailable: true,
            hasLocation: false,
            incomplete: true,
            matchType: apiMatch ? 'API' :
              leaseMatch ? 'Lease' :
              operatorMatch ? 'Operator' :
              fieldMatch ? 'Field' : 'County'
          });
        }
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
    await loadActiveWellIds();
    await loadAllWells();
    await loadWellDetails();
    await loadTCEQData();
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

// GET /api/contamination-data - Get coordinates for water contamination heatmap
app.get('/api/contamination-data', async (req, res) => {
  try {
    if (!tceqDataCache) {
      console.log('TCEQ cache not ready, fetching on demand...');
      await loadTCEQData();
    }
    
    res.json(tceqDataCache || []);
  } catch (error) {
    console.error('Error in /api/contamination-data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server and load wells
app.listen(PORT, async () => {
  console.log(`TOIL Backend server running on port ${PORT}`);
  console.log(`Supabase URL: ${supabaseUrl}`);

  try {
    await loadActiveWellIds();
    await loadAllWells();
    await loadWellDetails();
    await loadTCEQData();
    await initializeSupercluster();
    console.log('Server is ready to handle requests!');
  } catch (error) {
    console.error('Failed to load data on startup:', error);
    console.error('Server will respond with 503 until data is loaded');
  }
});