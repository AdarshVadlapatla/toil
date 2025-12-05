'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import styles from './ProductionChart.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ProductionChart({ wellId }) {
  const [productionData, setProductionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProductionData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:3001/api/wells/${wellId}/production`);
        const data = await response.json();

        if (!data.available) {
          setError(data.message || 'Production data is not available for this well at this time.');
          setProductionData(null);
        } else {
          setProductionData(data);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching production data:', err);
        setError('Failed to load production data. Please try again later.');
        setProductionData(null);
      } finally {
        setLoading(false);
      }
    };

    if (wellId) {
      fetchProductionData();
    }
  }, [wellId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Production History</h2>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading production data...</p>
        </div>
      </div>
    );
  }

  if (error || !productionData) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Production History</h2>
        </div>
        <div className={styles.errorContainer}>
          <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2"/>
            <path d="M12 8v4m0 4h.01" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const labels = productionData.production.map(item => {
    const date = new Date(item.year_month);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  });

  const dataValues = productionData.production.map(item => item.gas_production || 0);

  // Calculate statistics
  const totalProduction = dataValues.reduce((sum, val) => sum + val, 0);
  const avgProduction = dataValues.length > 0 ? totalProduction / dataValues.length : 0;
  const maxProduction = Math.max(...dataValues);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Gas Production (MCF)',
        data: dataValues,
        borderColor: '#992626',
        backgroundColor: 'rgba(153, 38, 38, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#992626',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#e5e7eb',
          font: {
            size: 12,
            weight: '600'
          },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: '#2d3748',
        titleColor: '#e5e7eb',
        bodyColor: '#d1d5db',
        borderColor: '#4a5568',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `Production: ${context.parsed.y.toLocaleString()} MCF`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#e5e7eb',
          font: {
            size: 14
          },
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: '#374151',
          drawBorder: false
        }
      },
      y: {
        ticks: {
          color: '#e5e7eb',
          font: {
            size: 14
          },
          callback: function(value) {
            return value.toLocaleString();
          }
        },
        grid: {
          color: '#374151',
          drawBorder: false
        },
        beginAtZero: true
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Production History</h2>
        <div className={styles.wellInfo}>
          <span className={styles.infoLabel}>Lease:</span>
          <span className={styles.infoValue}>{productionData.wellInfo.leaseName}</span>
          <span className={styles.infoSeparator}>•</span>
          <span className={styles.infoLabel}>Well #:</span>
          <span className={styles.infoValue}>{productionData.wellInfo.wellNo}</span>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Production</div>
          <div className={styles.statValue}>{totalProduction.toLocaleString()} MCF</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Average Monthly</div>
          <div className={styles.statValue}>{Math.round(avgProduction).toLocaleString()} MCF</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Peak Production</div>
          <div className={styles.statValue}>{maxProduction.toLocaleString()} MCF</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Data Points</div>
          <div className={styles.statValue}>{dataValues.length} months</div>
        </div>
      </div>

      <div className={styles.chartContainer}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}