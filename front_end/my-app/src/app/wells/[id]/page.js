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
        <button onClick={() => router.push('/')} className={styles.backButton}>
          ← Back to Map
        </button>
        <div className={styles.logo}>
          <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2L12 22M8 6L12 2L16 6M8 18L12 22L16 18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className={styles.logoText}>TOIL</h1>
        </div>
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
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
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
            <div className={styles.metricLabel}>Well Type</div>
            <div className={styles.metricValue}>
              {well.well_type_name || well.oil_gas_code || 'Unknown'}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>District</div>
            <div className={styles.metricValue}>
              District {well.district_code || 'N/A'}
            </div>
          </div>
        </div>

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
      </main>
    </div>
  );
}