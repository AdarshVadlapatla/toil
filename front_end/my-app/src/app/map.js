'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from './utils/api';
import styles from './page.module.css';
import 'leaflet/dist/leaflet.css';

const Map = forwardRef(({ filters }, ref) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const highlightMarkerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading wells...');
  const [wellCount, setWellCount] = useState({ filtered: 0, total: 0 });
  const router = useRouter();
  const loadWellsTimeoutRef = useRef(null);
  const filtersRef = useRef(filters);

  // Keep filters ref updated
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Expose zoomToWell method to parent component
  useImperativeHandle(ref, () => ({
    zoomToWell: async (well) => {
      if (!mapInstanceRef.current) return;

      const L = (await import('leaflet')).default;

      // Remove previous highlight if exists
      if (highlightMarkerRef.current) {
        mapInstanceRef.current.removeLayer(highlightMarkerRef.current);
        highlightMarkerRef.current = null;
      }

      // Create highlight icon (larger, different color)
      const highlightIcon = L.icon({
        iconUrl:
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiNmNTlkNTAiIHN0cm9rZT0iIzYwYTVmYSIgc3Ryb2tlLXdpZHRoPSIzIi8+PC9zdmc+',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      // Create highlight marker
      const popupContent = `
        <div class="${styles.popupContent}">
          <strong class="${styles.popupTitle}">Well: ${well.wellid || 'N/A'}</strong>
          <div class="${styles.popupApi}">API: ${well.api || 'N/A'}</div>
          <div class="${styles.popupApi}">Lease: ${well.leaseName || 'N/A'}</div>
          <button class="${styles.popupButton} view-details-btn" data-id="${well.id}">
            View Details
          </button>
        </div>
      `;

      highlightMarkerRef.current = L.marker([well.lat, well.lon], { 
        icon: highlightIcon,
        zIndexOffset: 1000 // Make sure it appears on top
      })
        .bindPopup(popupContent)
        .addTo(mapInstanceRef.current);

      // Zoom to the well
      mapInstanceRef.current.setView([well.lat, well.lon], 14, {
        animate: true,
        duration: 1
      });

      // Open the popup
      setTimeout(() => {
        highlightMarkerRef.current.openPopup();
        
        // Add click handler to the button after popup is opened
        const button = document.querySelector('.view-details-btn');
        if (button) {
          button.addEventListener('click', () => {
            window.open(`/wells/${well.id}`, '_blank');
          });
        }
      }, 500);

      // Remove highlight after 10 seconds (optional)
      setTimeout(() => {
        if (highlightMarkerRef.current) {
          mapInstanceRef.current.removeLayer(highlightMarkerRef.current);
          highlightMarkerRef.current = null;
        }
      }, 10000);
    }
  }));

  // Function to clear all markers
  const clearMarkers = () => {
    if (markersLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }
  };
  
  // Function to load and display wells with clustering
  const loadWells = async () => {
    if (!mapInstanceRef.current) return;

    if (loadWellsTimeoutRef.current) {
      clearTimeout(loadWellsTimeoutRef.current);
    }

    loadWellsTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      setLoadingMessage('Loading wells...');
      clearMarkers();

      try {
        const bounds = mapInstanceRef.current.getBounds();
        const zoom = mapInstanceRef.current.getZoom();
        
        // Build query params
        const params = new URLSearchParams({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLon: bounds.getWest(),
          maxLon: bounds.getEast(),
          zoom: zoom
        });

        // Add filters using the ref to get current values
        const currentFilters = filtersRef.current;
        
        if (currentFilters.counties && currentFilters.counties.length > 0) {
          params.append('counties', currentFilters.counties.join(','));
        }
        if (currentFilters.districts && currentFilters.districts.length > 0) {
          params.append('districts', currentFilters.districts.join(','));
        }
        if (currentFilters.wellType && currentFilters.wellType !== 'all') {
          params.append('wellType', currentFilters.wellType);
        }
        if (currentFilters.completionDateStart) {
          params.append('completionDateStart', currentFilters.completionDateStart);
        }
        if (currentFilters.completionDateEnd) {
          params.append('completionDateEnd', currentFilters.completionDateEnd);
        }
        if (currentFilters.depthMin) {
          params.append('depthMin', currentFilters.depthMin);
        }
        if (currentFilters.depthMax) {
          params.append('depthMax', currentFilters.depthMax);
        }
        if (currentFilters.operators && currentFilters.operators.length > 0) {
          params.append('operators', currentFilters.operators.join(','));
        }
        if (currentFilters.fields && currentFilters.fields.length > 0) {
          params.append('fields', currentFilters.fields.join(','));
        }

        if (currentFilters.productionTotalMin) {
          params.append('productionTotalMin', currentFilters.productionTotalMin);
        }
        if (currentFilters.productionTotalMax) {
          params.append('productionTotalMax', currentFilters.productionTotalMax);
        }
        if (currentFilters.productionAvgMin) {
          params.append('productionAvgMin', currentFilters.productionAvgMin);
        }
        if (currentFilters.productionAvgMax) {
          params.append('productionAvgMax', currentFilters.productionAvgMax);
        }
        if (currentFilters.productionMaxMin) {
          params.append('productionMaxMin', currentFilters.productionMaxMin);
        }
        if (currentFilters.productionMaxMax) {
          params.append('productionMaxMax', currentFilters.productionMaxMax);
        }

        const response = await fetch(`${API_URL}/api/wells?${params}`);
        const data = await response.json();

        if (data.loading) {
          setLoadingMessage('Server is loading well data...');
          setTimeout(loadWells, 2000);
          return;
        }

        // Update well count
        setWellCount({
          filtered: data.meta.totalFiltered || data.meta.totalAll || 0,
          total: data.meta.totalAll || 0
        });

        if (!data.features || data.features.length === 0) {
          setIsLoading(false);
          return;
        }

        const L = (await import('leaflet')).default;

        markersLayerRef.current = L.featureGroup();

        const wellIcon = L.icon({
          iconUrl:
            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjQiIGZpbGw9IiNmNTlkNTAiIHN0cm9rZT0iI2RjMjYyNiIgc3Ryb2tlLXdpZHRoPSIxLjUiLz48L3N2Zz4=',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const clusterIcon = (count) => {
          const size = count < 100 ? 40 : count < 1000 ? 50 : 60;
          const color = count < 100 ? '#dc2626' : count < 1000 ? '#991b1b' : '#7f1d1d';
          
          return L.divIcon({
            html: `<div style="
              background-color: ${color};
              color: white;
              border-radius: 50%;
              width: ${size}px;
              height: ${size}px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: ${size > 50 ? '14px' : '12px'};
              border: 3px solid rgba(255, 255, 255, 0.5);
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            ">${count}</div>`,
            className: 'custom-cluster-icon',
            iconSize: L.point(size, size),
            iconAnchor: [size / 2, size / 2]
          });
        };

        data.features.forEach(feature => {
          const [lon, lat] = feature.geometry.coordinates;

          if (feature.properties.cluster) {
            const count = feature.properties.point_count;
            const marker = L.marker([lat, lon], { 
              icon: clusterIcon(count) 
            });

            const popupContent = `
              <div class="${styles.popupContent}">
                <strong class="${styles.popupTitle}">Cluster</strong>
                <div class="${styles.popupApi}">${count} wells</div>
                <div class="${styles.popupApi}" style="font-size: 12px; margin-top: 4px;">
                  Zoom in to see individual wells
                </div>
              </div>
            `;

            marker.bindPopup(popupContent);

            marker.on('click', function () {
              mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom() + 2);
            });

            markersLayerRef.current.addLayer(marker);

          } else {
            const well = feature.properties;

            const popupContent = `
              <div class="${styles.popupContent}">
                <strong class="${styles.popupTitle}">Well: ${well.wellid || 'N/A'}</strong>
                <div class="${styles.popupApi}">API: ${well.api || 'N/A'}</div>
                <button class="${styles.popupButton} view-details-btn" data-id="${well.id}">
                  View Details
                </button>
              </div>
            `;

            const marker = L.marker([lat, lon], { icon: wellIcon })
              .bindPopup(popupContent);

            marker.on('mouseover', function () {
              this.openPopup();
            });

            marker.on('mouseout', function () {
              this.closePopup();
            });

            // Add click handler to marker that opens details page
            marker.on('click', function () {
              window.open(`/wells/${well.id}`, '_blank');
            });

            // Add event listener when popup opens to handle button click
            marker.on('popupopen', function () {
              const button = document.querySelector('.view-details-btn');
              if (button) {
                button.addEventListener('click', (e) => {
                  e.stopPropagation(); // Prevent marker click event
                  window.open(`/wells/${well.id}`, '_blank');
                });
              }
            });

            markersLayerRef.current.addLayer(marker);
          }
        });

        mapInstanceRef.current.addLayer(markersLayerRef.current);

        console.log(`Displayed ${data.features.length} items (clusters + wells)`);

      } catch (error) {
        console.error('Error loading wells:', error);
        if (error.message && error.message.includes('loading')) {
          setLoadingMessage('Server is preparing data...');
          setTimeout(loadWells, 2000);
          return;
        }
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  // Load wells when filters change
  useEffect(() => {
    if (mapInstanceRef.current) {
      loadWells();
    }
  }, [filters]);

  useEffect(() => {
    if (typeof window !== 'undefined' && mapRef.current && !mapInstanceRef.current) {
      import('leaflet').then((L) => {
        mapInstanceRef.current = L.map(mapRef.current).setView([31.0, -100.0], 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);

        fetch('https://raw.githubusercontent.com/glynnbird/usstatesgeojson/master/texas.geojson')
          .then(response => response.json())
          .then(texasGeoJSON => {
            const texasBorder = L.geoJSON(texasGeoJSON, {
              style: {
                color: '#992626',
                weight: 3,
                fillColor: '#fef2f2',
                fillOpacity: 0.15,
                dashArray: '10, 5',
                opacity: 0.8,
              }
            }).addTo(mapInstanceRef.current);

            const bounds = texasBorder.getBounds();
            mapInstanceRef.current.setMaxBounds(bounds.pad(0.1));

            loadWells();
            
            // Attach event listeners
            mapInstanceRef.current.on('zoomend', loadWells);
            mapInstanceRef.current.on('moveend', loadWells);
          })
          .catch(error => {
            console.error('Error loading Texas boundary:', error);
          });
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('zoomend', loadWells);
        mapInstanceRef.current.off('moveend', loadWells);
        clearMarkers();
        if (highlightMarkerRef.current) {
          mapInstanceRef.current.removeLayer(highlightMarkerRef.current);
        }
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const hasFilters = filters.counties?.length > 0 || filters.districts?.length > 0 || 
                   filters.operators?.length > 0 || filters.fields?.length > 0 ||
                   (filters.wellType && filters.wellType !== 'all') ||
                   filters.completionDateStart || filters.completionDateEnd ||
                   filters.depthMin || filters.depthMax ||
                   filters.productionTotalMin || filters.productionTotalMax ||
                   filters.productionAvgMin || filters.productionAvgMax ||
                   filters.productionMaxMin || filters.productionMaxMax;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} className={styles.mapContainer}></div>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: '#992626',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 1000,
          fontSize: '14px'
        }}>
          {loadingMessage}
        </div>
      )}
      {!isLoading && hasFilters && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: '#1f2937',
          color: '#e5e7eb',
          padding: '8px 12px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 1000,
          fontSize: '14px',
          border: '1px solid #374151'
        }}>
          Showing {wellCount.filtered.toLocaleString()} of {wellCount.total.toLocaleString()} wells
        </div>
      )}
    </div>
  );
});

Map.displayName = 'Map';

export default Map;