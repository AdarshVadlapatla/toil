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

async function loadWellDetails() {
  console.log('Loading well details for filtering...');
  const BATCH_SIZE = 1000;
  let wellDetails = [];
  let start = 0;

  while (true) {
    const end = start + BATCH_SIZE - 1;

    const { data: batch, error } = await supabase
      .from('filtered_well_information')
      .select('api_no, county_name, county_code, district_code, oil_gas_code, completion_date, api_depth, lease_name, well_no, operator_name, field_name') // Added well_no and county_code
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
  const operators = [...new Set(wellDetails.map(w => w.operator_name).filter(Boolean))].sort();
  const fields = [...new Set(wellDetails.map(w => w.field_name).filter(Boolean))].sort();

  filterOptions = { counties, districts, operators, fields };
  console.log(`Filter options ready: ${counties.length} counties, ${districts.length} districts, ${operators.length} operators, ${fields.length} fields`);

  return wellDetails;
}

// Function to calculate production statistics using materialized view
async function loadProductionStatistics() {
  console.log('Loading production statistics from materialized view...');
  const startTime = Date.now();
  
  try {
    const BATCH_SIZE = 1000;
    let allStats = [];
    let start = 0;

    // Batch-fetch from the materialized view
    while (true) {
      const end = start + BATCH_SIZE - 1;

      const { data: batch, error } = await supabase
        .from('well_production_summary')
        .select('lease_name, well_no, county_code, total_production, avg_production, max_production')
        .range(start, end);

      if (error) {
        console.error('Error fetching production stats batch:', error);
        throw error;
      }

      if (!batch || batch.length === 0) {
        break;
      }

      allStats = allStats.concat(batch);
      console.log(`Loaded ${allStats.length} production statistics so far...`);

      start += BATCH_SIZE;
    }

    console.log(`Total production statistics loaded: ${allStats.length}`);

    // Create a map for fast lookup
    const statsMap = new Map();
    allStats.forEach(stat => {
      const key = `${stat.lease_name}|${stat.well_no}|${stat.county_code}`;
      statsMap.set(key, {
        totalProduction: parseFloat(stat.total_production) || 0,
        avgProduction: Math.round(parseFloat(stat.avg_production)) || 0,
        maxProduction: parseInt(stat.max_production) || 0
      });
    });

    // Match statistics to wells in wellsWithDetailsCache
    if (wellsWithDetailsCache) {
      let matchedCount = 0;
      let attemptedMatches = 0;
      
      wellsWithDetailsCache.forEach(well => {
        const key = `${well.lease_name}|${well.well_no}|${well.county_code}`;
        const stats = statsMap.get(key);
        
        attemptedMatches++;
        
        // DEBUG: Log first failed match
        if (!stats && attemptedMatches <= 3) {
          console.log(`Failed match for well key: "${key}"`);
          console.log(`  Looking for this key in statsMap...`);
          // Check if any similar keys exist
          const similarKeys = Array.from(statsMap.keys()).filter(k => 
            k.includes(well.lease_name?.substring(0, 5) || 'XXX')
          ).slice(0, 3);
          console.log(`  Similar keys found:`, similarKeys);
        }
        
        if (stats) {
          well.production_total = stats.totalProduction;
          well.production_avg = stats.avgProduction;
          well.production_max = stats.maxProduction;
          matchedCount++;
          
        } else {
          // No production data found (oil well or no data)
          well.production_total = 0;
          well.production_avg = 0;
          well.production_max = 0;
        }
      });

      console.log(`Production statistics matched: ${matchedCount} wells with data, ${wellsWithDetailsCache.length - matchedCount} without data`);
    }

    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Production statistics loaded in ${loadTime} seconds`);

  } catch (error) {
    console.error('Failed to load production statistics:', error);
    // Set all wells to 0 production if error
    if (wellsWithDetailsCache) {
      wellsWithDetailsCache.forEach(well => {
        well.production_total = 0;
        well.production_avg = 0;
        well.production_max = 0;
      });
    }
    console.log('Production statistics set to 0 for all wells due to error');
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
    const { zoom, minLat, maxLat, minLon, maxLon, counties, districts, operators, fields, wellType, completionDateStart, completionDateEnd, depthMin, depthMax, productionTotalMin, productionTotalMax, productionAvgMin, productionAvgMax, productionMaxMin, productionMaxMax } = req.query;

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
    const operatorFilter = operators ? operators.split(',').filter(Boolean) : [];
    const fieldFilter = fields ? fields.split(',').filter(Boolean) : [];
    const prodTotalMin = productionTotalMin ? parseFloat(productionTotalMin) : null;
    const prodTotalMax = productionTotalMax ? parseFloat(productionTotalMax) : null;
    const prodAvgMin = productionAvgMin ? parseFloat(productionAvgMin) : null;
    const prodAvgMax = productionAvgMax ? parseFloat(productionAvgMax) : null;
    const prodMaxMin = productionMaxMin ? parseFloat(productionMaxMin) : null;
    const prodMaxMax = productionMaxMax ? parseFloat(productionMaxMax) : null;

    const hasFilters = countyFilter.length > 0 || districtFilter.length > 0 || 
                   operatorFilter.length > 0 || fieldFilter.length > 0 ||
                   wellTypeFilter || dateStart || dateEnd || 
                   minDepth !== null || maxDepth !== null ||
                   prodTotalMin !== null || prodTotalMax !== null ||
                   prodAvgMin !== null || prodAvgMax !== null ||
                   prodMaxMin !== null || prodMaxMax !== null;


    let filteredWells = wellsCache;
    let indexToUse = superclusterIndex;

    // Apply filters if any are provided
    if (hasFilters) {
      console.log('Applying filters:', { 
        counties: countyFilter.length, 
        districts: districtFilter.length,
        wellType: wellTypeFilter,
        dateRange: dateStart || dateEnd ? `${dateStart} to ${dateEnd}` : 'none',
        depthRange: minDepth !== null || maxDepth !== null ? `${minDepth} to ${maxDepth}` : 'none',
        operators: operatorFilter.length, 
        fields: fieldFilter.length
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

        // Operator filter
        if (operatorFilter.length > 0) {
          matches = matches && operatorFilter.includes(details.operator_name);
        }

        // Field filter
        if (fieldFilter.length > 0) {
          matches = matches && fieldFilter.includes(details.field_name);
        }

        // Total production filter
        if (prodTotalMin !== null || prodTotalMax !== null) {
          const totalProd = details.production_total || 0;
          
          if (prodTotalMin !== null && totalProd < prodTotalMin) {
            matches = false;
          }
          if (prodTotalMax !== null && totalProd > prodTotalMax) {
            matches = false;
          }
        }

        // Average production filter
        if (prodAvgMin !== null || prodAvgMax !== null) {
          const avgProd = details.production_avg || 0;
          
          if (prodAvgMin !== null && avgProd < prodAvgMin) {
            matches = false;
          }
          if (prodAvgMax !== null && avgProd > prodAvgMax) {
            matches = false;
          }
        }

        // Max production filter
        if (prodMaxMin !== null || prodMaxMax !== null) {
          const maxProd = details.production_max || 0;
          
          if (prodMaxMin !== null && maxProd < prodMaxMin) {
            matches = false;
          }
          if (prodMaxMax !== null && maxProd > prodMaxMax) {
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
        message: 'Forecasting is only available for gas wells at this time.'
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
    await loadProductionStatistics(); 
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
    await loadProductionStatistics(); 
    await initializeSupercluster();
    console.log('Server is ready to handle requests!');
  } catch (error) {
    console.error('Failed to load data on startup:', error);
    console.error('Server will respond with 503 until data is loaded');
  }
});