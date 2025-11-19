'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import 'leaflet/dist/leaflet.css';
import { fetchWells } from './utils/api';

export default function Map() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading wells...');
  const router = useRouter();
  const loadWellsTimeoutRef = useRef(null);

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

    // Clear any pending load
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
        const data = await fetchWells(bounds, zoom);

        // Check if server is still loading cache
        if (data.loading) {
          setLoadingMessage('Server is loading well data...');
          // Try again in 2 seconds
          setTimeout(loadWells, 2000);
          return;
        }

        if (!data.features || data.features.length === 0) {
          setIsLoading(false);
          return;
        }

        const L = (await import('leaflet')).default;

        // Create a feature group to hold all markers
        markersLayerRef.current = L.featureGroup();

        // Icons
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

        // Add markers or clusters
        data.features.forEach(feature => {
          const [lon, lat] = feature.geometry.coordinates;

          if (feature.properties.cluster) {
            // It's a cluster
            const count = feature.properties.point_count;
            const clusterId = feature.properties.cluster_id;

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
              // Zoom in to cluster
              mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom() + 2);
            });

            markersLayerRef.current.addLayer(marker);

          } else {
            // It's an individual well
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

            marker.on('click', function () {
              window.open(`/wells/${well.id}`, '_blank');
            });

            markersLayerRef.current.addLayer(marker);
          }
        });

        // Add all markers to map
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
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

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
    </div>
  );
}