'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchWellDetails } from '../../utils/api';
import styles from './page.module.css';

export default function WellDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [well, setWell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    const loadWellDetails = async () => {
      try {
        setLoading(true);
        const data = await fetchWellDetails(params.id);
        setWell(data);
      } catch (err) {
        console.error('Error loading well details:', err);
        setError('Failed to load well information');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      loadWellDetails();
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading well information...</div>
      </div>
    );
  }

  if (error || !well) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          {error || 'Well not found'}
          <button onClick={() => router.push('/')} className={styles.backButton}>
            Return to Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <img className={styles.logoIcon} src="/ToilLogo.png" alt="TOIL Logo"></img>
          <h1 className={styles.logoText}>TOIL</h1>
        </div>

        <button onClick={() => router.push('/')} className={styles.backButton}>
          ← Back to Map
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.titleSection}>
          <h1 className={styles.apiTitle}>API #{well.api_no || well.api || 'N/A'}</h1>
          <h2 className={styles.leaseName}>{well.lease_name || 'Unknown Lease'}</h2>
        </div>

        <div className={styles.keyMetrics}>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Operator</div>
            <div className={styles.metricValue}>
              <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z"/>
              </svg>
              {well.operator_name || 'Unknown'}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>County</div>
            <div className={styles.metricValue}>
              <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              {well.county_name || 'Unknown'}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>District</div>
            <div className={styles.metricValue}>
              <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              District {well.district_code || 'N/A'}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Oil or Gas Code</div>
            <div className={styles.metricValue}>
              <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2 C8 7 6 10 6 14 C6 18.418 8.686 21 12 21 C15.314 21 18 18.418 18 14 C18 10 16 7 12 2 Z"/>
              </svg>
              {well.oil_gas_code || 'N/A'}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Well Type</div>
            <div className={styles.metricValue}>
              <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 109 9 9.01 9.01 0 00-9-9zm4.3 4.3l-4.6 6.4a1 1 0 01-1.3.3L8 13a1 1 0 01.3-1.7l6.4-4.6a1 1 0 011.6 1.6z"/>
              </svg>
              {well.well_type_name || 'Unknown'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNavigation}>
          <button 
            className={`${styles.tab} ${activeTab === 'details' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Well Details
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'production' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('production')}
          >
            Production Data & Predictions
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <div className={styles.sections}>
            {/* Well Details */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Well Details</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>API Number</span>
                  <span className={styles.infoValue}>{well.api_no || well.api || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Well Number</span>
                  <span className={styles.infoValue}>{well.well_no_display || well.wellid || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Field Name</span>
                  <span className={styles.infoValue}>{well.field_name || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Field Number</span>
                  <span className={styles.infoValue}>{well.field_number || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Lease Number</span>
                  <span className={styles.infoValue}>{well.lease_number || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Total Depth</span>
                  <span className={styles.infoValue}>{well.api_depth ? `${well.api_depth} ft` : 'N/A'}</span>
                </div>
              </div>
            </section>

            {/* Location Information */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Location Information</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Latitude</span>
                  <span className={styles.infoValue}>{well.lat83 || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Longitude</span>
                  <span className={styles.infoValue}>{well.long83 || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>County</span>
                  <span className={styles.infoValue}>{well.county_name || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>County Code</span>
                  <span className={styles.infoValue}>{well.county_code || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>District</span>
                  <span className={styles.infoValue}>{well.district_code || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Water/Land Code</span>
                  <span className={styles.infoValue}>{well.wb_water_land_code || 'N/A'}</span>
                </div>
              </div>
            </section>

            {/* Operator Information */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Operator Information</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Operator Name</span>
                  <span className={styles.infoValue}>{well.operator_name || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Operator Number</span>
                  <span className={styles.infoValue}>{well.operator_number || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Recent Permit</span>
                  <span className={styles.infoValue}>{well.recent_permit || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Recent Permit Lease</span>
                  <span className={styles.infoValue}>{well.recent_permit_lease_name || 'N/A'}</span>
                </div>
              </div>
            </section>

            {/* Dates & Status */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Dates & Status</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Completion Date</span>
                  <span className={styles.infoValue}>{well.completion_date || well.orig_completion_dt || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>W2 G1 Filed Date</span>
                  <span className={styles.infoValue}>{well.w2_g1_filed_date || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>W2 G1 Date</span>
                  <span className={styles.infoValue}>{well.w2_g1_date || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>W3 File Date</span>
                  <span className={styles.infoValue}>{well.w3_file_date || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Shut In Date</span>
                  <span className={styles.infoValue}>{well.wb_shut_in_date || well.wl_shut_in_date || 'N/A'}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Plug Date</span>
                  <span className={styles.infoValue}>{well.plug_date || 'N/A'}</span>
                </div>
              </div>
            </section>

            {/* Regulatory Status */}
            {well.detailsAvailable && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Regulatory Status</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>14B2 Flag</span>
                    <span className={styles.infoValue}>{well.wb_14b2_flag || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>H15 Status</span>
                    <span className={styles.infoValue}>{well.h15_status_code || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Multi Comp Flag</span>
                    <span className={styles.infoValue}>{well.multi_comp_flag || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>On Schedule</span>
                    <span className={styles.infoValue}>{well.on_schedule || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>P5 Org Status</span>
                    <span className={styles.infoValue}>{well.p5_org_status || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Surface Equipment Violation</span>
                    <span className={styles.infoValue}>{well.surf_eqp_viol || 'N/A'}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Additional Information */}
            {well.detailsAvailable && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Additional Information</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Oil Unit Number</span>
                    <span className={styles.infoValue}>{well.oil_unit_number || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Wellbore EWA ID</span>
                    <span className={styles.infoValue}>{well.og_wellbore_ewa_id || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Current Inactive Years</span>
                    <span className={styles.infoValue}>{well.curr_inact_yrs || 'N/A'}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Current Inactive Months</span>
                    <span className={styles.infoValue}>{well.curr_inact_mos || 'N/A'}</span>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'production' && (
          <div className={styles.sections}>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Production Data</h3>
              <div className={styles.placeholderContent}>
                <p>Production data visualization will be displayed here.</p>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}