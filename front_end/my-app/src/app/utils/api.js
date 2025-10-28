const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

