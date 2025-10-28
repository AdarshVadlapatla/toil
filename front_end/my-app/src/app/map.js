'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';
import 'leaflet/dist/leaflet.css';
import { fetchWells } from './utils/api';

export default function Map() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [isLoading, setIsLoading] = useState(false);

  // Function to clear all markers
  const clearMarkers = () => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  };

  // Function to load and display wells
  const loadWells = async () => {
    if (!mapInstanceRef.current) return;

    setIsLoading(true);
    clearMarkers();

    try {
      const bounds = mapInstanceRef.current.getBounds();
      const zoom = mapInstanceRef.current.getZoom();

      const data = await fetchWells(bounds, zoom);
      
      if (!data.features) return;

      // Import Leaflet for marker creation
      const L = await import('leaflet');

      // Create marker for each well
      data.features.forEach(well => {
        const [lon, lat] = well.geometry.coordinates;
        
        // Custom marker icon
        const wellIcon = L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjQiIGZpbGw9IiNmNTlkNTAiIHN0cm9rZT0iI2RjMjYyNiIgc3Ryb2tlLXdpZHRoPSIxLjUiLz48L3N2Zz4=',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([lat, lon], { icon: wellIcon })
          .bindPopup(`Well: ${well.properties.wellid || 'N/A'}<br>API: ${well.properties.api || 'N/A'}`)
          .addTo(mapInstanceRef.current);
        
        markersRef.current.push(marker);
      });

    } catch (error) {
      console.error('Error loading wells:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && mapRef.current && !mapInstanceRef.current) {
      // Import Leaflet dynamically
      import('leaflet').then((L) => {
        // Initialize map centered on Texas
        mapInstanceRef.current = L.map(mapRef.current).setView([31.0, -100.0], 6);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);

        // Load accurate Texas boundary from GeoJSON
        fetch('https://raw.githubusercontent.com/glynnbird/usstatesgeojson/master/texas.geojson')
          .then(response => response.json())
          .then(texasGeoJSON => {
            // Add Texas border overlay
            const texasBorder = L.geoJSON(texasGeoJSON, {
              style: {
                color: '#dc2626', // Red border
                weight: 3,
                fillColor: '#fef2f2', // Light red fill
                fillOpacity: 0.15,
                dashArray: '10, 5', // Dashed border
                opacity: 0.8,
              }
            }).addTo(mapInstanceRef.current);

            // Set map bounds to Texas and restrict panning
            const bounds = texasBorder.getBounds();
            mapInstanceRef.current.setMaxBounds(bounds.pad(0.1)); // Add small padding
            //mapInstanceRef.current.setMaxBoundsViscosity(1.0); // Prevent panning outside

            // Load initial wells
            loadWells();

            // Add event listeners for zoom and move
            mapInstanceRef.current.on('zoomend', loadWells);
            mapInstanceRef.current.on('moveend', loadWells);
          })
          .catch(error => {
            console.error('Error loading Texas boundary:', error);
          });
      });
    }

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('zoomend', loadWells);
        mapInstanceRef.current.off('moveend', loadWells);
        clearMarkers();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className={styles.mapContainer}></div>;
}