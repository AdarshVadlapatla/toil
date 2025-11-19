'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { fetchWells } from './utils/api';

export default function Map() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerClusterGroupRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Function to clear all markers
  const clearMarkers = () => {
    if (markerClusterGroupRef.current) {
      markerClusterGroupRef.current.clearLayers();
    }
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

      const L = (await import('leaflet')).default;
      await import('leaflet.markercluster');

      // Create cluster group if it doesn't exist
      if (!markerClusterGroupRef.current) {
        markerClusterGroupRef.current = L.markerClusterGroup({
          // Customize cluster appearance
          iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let size = 'small';
            let c = ' marker-cluster-';
            
            if (count < 10) {
              size = 'small';
            } else if (count < 100) {
              size = 'medium';
            } else {
              size = 'large';
            }
            
            return L.divIcon({
              html: '<div><span>' + count + '</span></div>',
              className: 'marker-cluster' + c + size,
              iconSize: L.point(40, 40)
            });
          },
          // Performance options
          chunkedLoading: true,
          chunkInterval: 200,
          chunkDelay: 50,
          maxClusterRadius: 80,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true
        });

        mapInstanceRef.current.addLayer(markerClusterGroupRef.current);
      }

      const wellIcon = L.icon({
        iconUrl:
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjQiIGZpbGw9IiNmNTlkNTAiIHN0cm9rZT0iI2RjMjYyNiIgc3Ryb2tlLXdpZHRoPSIxLjUiLz48L3N2Zz4=',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      // Create markers and add to cluster group
      const markers = data.features.map(well => {
        const [lon, lat] = well.geometry.coordinates;

        const popupContent = `
          <div class="${styles.popupContent}">
            <strong class="${styles.popupTitle}">Well: ${well.properties.wellid || 'N/A'}</strong>
            <div class="${styles.popupApi}">API: ${well.properties.api || 'N/A'}</div>
            <button 
              class="${styles.popupButton} view-details-btn"
              data-id="${well.properties.id}"
            >
              View Details
            </button>
          </div>
        `;

        const marker = L.marker([lat, lon], { icon: wellIcon })
          .bindPopup(popupContent);

        // Show popup on hover
        marker.on('mouseover', function () {
          this.openPopup();
        });
        marker.on('mouseout', function () {
          this.closePopup();
        });

        // Click on marker opens well details in new tab
        marker.on('click', function () {
          window.open(`/wells/${well.properties.id}`, '_blank');
        });

        // Handle "View Details" button click in popup
        marker.on('popupopen', () => {
          const popupEl = document.querySelector('.view-details-btn');
          if (popupEl) {
            popupEl.addEventListener('click', () => {
              const id = popupEl.getAttribute('data-id');
              window.open(`/wells/${id}`, '_blank');
            });
          }
        });

        return marker;
      });

      // Add all markers to cluster group at once (more efficient)
      markerClusterGroupRef.current.addLayers(markers);

    } catch (error) {
      console.error('Error loading wells:', error);
    } finally {
      setIsLoading(false);
    }
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

  return <div ref={mapRef} className={styles.mapContainer}></div>;
}