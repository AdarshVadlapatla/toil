'use client';

import { useEffect, useRef } from 'react';
import styles from './page.module.css';
import 'leaflet/dist/leaflet.css';

export default function Map() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

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
      });
    }

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className={styles.mapContainer}></div>;
}