const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Export API_URL for use in other components
export { API_URL };

export async function fetchWells(bounds, zoom, filters = {}) {
  const params = new URLSearchParams({
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLon: bounds.getWest(),
    maxLon: bounds.getEast(),
    zoom: zoom.toString(),
    ...filters
  });

  const response = await fetch(`${API_URL}/api/wells?${params}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchWellDetails(id) {
  const response = await fetch(`${API_URL}/api/wells/${id}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchStats() {
  const response = await fetch(`${API_URL}/api/wells/stats`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchFilterOptions() {
  const response = await fetch(`${API_URL}/api/filter-options`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function searchWells(query) {
  const response = await fetch(`${API_URL}/api/search?query=${encodeURIComponent(query)}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchProductionData(wellId) {
  const response = await fetch(`${API_URL}/api/wells/${wellId}/production`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchForecastData(wellId, months = 12) {
  const response = await fetch(`${API_URL}/api/wells/${wellId}/forecast?months=${months}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

