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
import { API_URL, fetchProductionData, fetchForecastData } from './utils/api';
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
  const [forecastData, setForecastData] = useState(null);
  const [showForecast, setShowForecast] = useState(true);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadProductionData = async () => {
      try {
        setLoading(true);
        const data = await fetchProductionData(wellId);

        if (!data.available) {
          setError(data.message || 'Production data is not available for this well at this time.');
          setProductionData(null);
        } else {
          setProductionData(data);
          setError(null);
          
          // Fetch forecast data if production data is available
          if (data.available && data.production && data.production.length >= 3) {
            loadForecastData();
          }
        }
      } catch (err) {
        console.error('Error fetching production data:', err);
        setError('Failed to load production data. Please try again later.');
        setProductionData(null);
      } finally {
        setLoading(false);
      }
    };

    const loadForecastData = async () => {
      try {
        setForecastLoading(true);
        const data = await fetchForecastData(wellId, 12);

        if (data.available) {
          setForecastData(data);
        }
      } catch (err) {
        console.error('Error fetching forecast data:', err);
        // Don't set error, just don't show forecast
      } finally {
        setForecastLoading(false);
      }
    };

    if (wellId) {
      loadProductionData();
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
  const historicalLabels = productionData.production.map(item => {
    const date = new Date(item.year_month);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  });

  const historicalValues = productionData.production.map(item => item.gas_production || 0);

  // Prepare forecast data if available
  let forecastLabels = [];
  let forecastValues = [];
  let forecastUpper = [];
  let forecastLower = [];
  
  if (showForecast && forecastData && forecastData.forecast) {
    forecastLabels = forecastData.forecast.map(item => {
      // Handle date parsing - the backend sends dates like "2024-12-01"
      let date;
      if (item.year_month) {
        // Try parsing YYYY-MM-DD format first (most common)
        if (typeof item.year_month === 'string' && item.year_month.includes('-')) {
          const parts = item.year_month.split('-');
          if (parts.length >= 2) {
            // Create date from parts: year, month (0-indexed), day
            date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2] || 1));
          } else {
            date = new Date(item.year_month);
          }
        } else {
          // Try standard date parsing
          date = new Date(item.year_month);
        }
        
        // Validate the date
        if (isNaN(date.getTime())) {
          // Fallback to current date if parsing fails
          date = new Date();
        }
      } else {
        date = new Date();
      }
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    });
    forecastValues = forecastData.forecast.map(item => item.forecast);
    forecastUpper = forecastData.forecast.map(item => item.upper_bound);
    forecastLower = forecastData.forecast.map(item => item.lower_bound);
  }

  // Combine labels (historical + forecast)
  const allLabels = [...historicalLabels, ...forecastLabels];
  
  // Create datasets array
  const datasets = [
    {
      label: 'Gas Production (MCF)',
      data: [...historicalValues, ...new Array(forecastLabels.length).fill(null)],
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
  ];

  // Add forecast datasets if available
  if (showForecast && forecastData && forecastData.forecast && forecastLabels.length > 0) {
    // Add a connecting point from last historical to first forecast
    const lastHistoricalValue = historicalValues[historicalValues.length - 1];
    const firstForecastValue = forecastValues[0];
    
    // Upper bound for confidence interval
    datasets.push({
      label: 'Forecast Upper Bound (95% CI)',
      data: [
        ...new Array(historicalValues.length - 1).fill(null),
        lastHistoricalValue, // Connect to last historical point
        ...forecastUpper
      ],
      borderColor: 'rgba(34, 197, 94, 0.4)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      borderWidth: 1,
      borderDash: [3, 3],
      fill: '+1',
      pointRadius: 0,
      tension: 0.4,
    });

    // Forecast line
    datasets.push({
      label: 'AI Forecast',
      data: [
        ...new Array(historicalValues.length - 1).fill(null),
        lastHistoricalValue, // Connect to last historical point
        ...forecastValues
      ],
      borderColor: '#3b82f6',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [8, 4],
      tension: 0.4,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#3b82f6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    });

    // Lower bound for confidence interval
    datasets.push({
      label: 'Forecast Lower Bound (95% CI)',
      data: [
        ...new Array(historicalValues.length - 1).fill(null),
        lastHistoricalValue, // Connect to last historical point
        ...forecastLower
      ],
      borderColor: 'rgba(239, 68, 68, 0.4)',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderWidth: 1,
      borderDash: [3, 3],
      fill: '-1',
      pointRadius: 0,
      tension: 0.4,
    });
  }

  const chartData = {
    labels: allLabels,
    datasets: datasets
  };

  // Calculate statistics
  const totalProduction = historicalValues.reduce((sum, val) => sum + val, 0);
  const avgProduction = historicalValues.length > 0 ? totalProduction / historicalValues.length : 0;
  const maxProduction = Math.max(...historicalValues);
  
  // Calculate forecast statistics if available
  let forecastAvg = null;
  let forecastTotal = null;
  if (forecastData && forecastData.forecast) {
    forecastTotal = forecastValues.reduce((sum, val) => sum + val, 0);
    forecastAvg = forecastValues.length > 0 ? forecastTotal / forecastValues.length : 0;
  }

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
            const label = context.dataset.label || '';
            if (label.includes('Forecast')) {
              return `${label}: ${context.parsed.y ? context.parsed.y.toLocaleString() : 'N/A'} MCF`;
            }
            return `Production: ${context.parsed.y ? context.parsed.y.toLocaleString() : 'N/A'} MCF`;
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
        <h2 className={styles.title}>Production History & AI Forecast</h2>
        <div className={styles.wellInfo}>
          <span className={styles.infoLabel}>Lease:</span>
          <span className={styles.infoValue}>{productionData.wellInfo.leaseName}</span>
          <span className={styles.infoSeparator}>•</span>
          <span className={styles.infoLabel}>Well #:</span>
          <span className={styles.infoValue}>{productionData.wellInfo.wellNo}</span>
        </div>
        {forecastData && forecastData.forecast && (
          <div className={styles.forecastToggle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e5e7eb', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={showForecast}
                onChange={(e) => setShowForecast(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Show AI Forecast</span>
            </label>
            {forecastData.model_info && (
              <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '16px' }}>
                Trend: {forecastData.model_info.trend}
              </span>
            )}
          </div>
        )}
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
          <div className={styles.statValue}>{historicalValues.length} months</div>
        </div>
        {showForecast && forecastData && forecastAvg !== null && (
          <>
            <div className={styles.statCard} style={{ borderColor: '#3b82f6' }}>
              <div className={styles.statLabel}>Forecast Avg (12mo)</div>
              <div className={styles.statValue} style={{ color: '#3b82f6' }}>
                {Math.round(forecastAvg).toLocaleString()} MCF
              </div>
            </div>
            <div className={styles.statCard} style={{ borderColor: '#3b82f6' }}>
              <div className={styles.statLabel}>Forecast Total (12mo)</div>
              <div className={styles.statValue} style={{ color: '#3b82f6' }}>
                {Math.round(forecastTotal).toLocaleString()} MCF
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.chartContainer}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}