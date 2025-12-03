'use client';

import { useState } from 'react';
import styles from './HelpModal.module.css';

export default function HelpModal() {
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState('purpose');

  return (
    <>
      <button 
        className={styles.helpButton} 
        aria-label="Help"
        onClick={() => setShowHelp(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
        </svg>
      </button>

      {/* Help Modal */}
      {showHelp && (
        <div className={styles.modalOverlay} onClick={() => setShowHelp(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Help & Information</h2>
              <button 
                className={styles.closeButton}
                onClick={() => setShowHelp(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Tab Navigation */}
            <div className={styles.helpTabNavigation}>
              <button 
                className={`${styles.helpTab} ${activeTab === 'purpose' ? styles.helpTabActive : ''}`}
                onClick={() => setActiveTab('purpose')}
              >
                Purpose & How to Use
              </button>
              <button 
                className={`${styles.helpTab} ${activeTab === 'disclaimers' ? styles.helpTabActive : ''}`}
                onClick={() => setActiveTab('disclaimers')}
              >
                Ethical Disclaimers
              </button>
            </div>

            <div className={styles.modalBody}>
              {activeTab === 'purpose' && (
                <div className={styles.helpSection}>
                  <h3 className={styles.helpSectionTitle}>Purpose</h3>
                  <p className={styles.helpText}>
                    TOIL (Texas Oil and Gas Well Dashboard) is a comprehensive data visualization tool designed to help you browse and explore all producing oil and gas wells across Texas. Our platform aggregates public data from the Texas Railroad Commission to provide detailed information on well locations, operators, production metrics, and historical data—all in one interactive map interface.
                  </p>
                  <p className={styles.helpText}>
                    Whether you're a landowner researching wells on your property, an industry professional analyzing regional trends, or an investor conducting due diligence, TOIL provides easy access to the information you need.
                  </p>

                  <h3 className={styles.helpSectionTitle}>How to Use</h3>
                  
                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Search:</h4>
                    <p className={styles.helpText}>
                      Use the search bar at the top of the filters panel to quickly find specific wells by API number, lease name, operator, field name, or county. Simply start typing and select from the autocomplete suggestions to zoom directly to that well on the map.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Filter:</h4>
                    <p className={styles.helpText}>
                      Narrow down the wells displayed on the map using the filter panel on the left:
                    </p>
                    <ul className={styles.helpList}>
                      <li><strong>Location Filters:</strong> Select specific counties or RRC districts</li>
                      <li><strong>Well Attributes:</strong> Filter by well type (oil/gas), completion date range, or well depth</li>
                    </ul>
                    <p className={styles.helpText}>
                      Click "Apply Filters" to update the map, or "Clear All" to reset.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Navigate the Map:</h4>
                    <ul className={styles.helpList}>
                      <li><strong>Clusters:</strong> Red circular markers with numbers represent clusters of multiple wells. Click on a cluster to zoom in and see individual wells.</li>
                      <li><strong>Individual Wells:</strong> Small orange dots represent individual wells. Hover over a well to see basic information in a popup.</li>
                      <li><strong>View Details:</strong> Click on any well marker or use the "View Details" button in the popup to open a comprehensive information page in a new tab.</li>
                    </ul>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Well Details Page:</h4>
                    <p className={styles.helpText}>
                      The details page shows complete information about the selected well, including operator information, location data, completion dates, regulatory status, and more. Use the tabs to switch between different categories of information.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'disclaimers' && (
                <div className={styles.helpSection}>
                  <h3 className={styles.helpSectionTitle}>Ethical Disclaimers</h3>
                  
                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Data Source:</h4>
                    <p className={styles.helpText}>
                      All data displayed on TOIL is sourced from publicly available Texas Railroad Commission (RRC) datasets. We aggregate and present this information for convenience but do not guarantee its accuracy, completeness, or timeliness. Always verify critical information directly with the Texas RRC or other official sources.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Not Financial Advice:</h4>
                    <p className={styles.helpText}>
                      TOIL provides informational data only and does not constitute financial, investment, legal, or professional advice. Before making any investment decisions related to oil and gas wells or mineral rights, consult with licensed financial advisors, attorneys, and industry professionals who can assess your specific situation.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>High-Risk Investments:</h4>
                    <p className={styles.helpText}>
                      Oil and gas investments carry significant financial risk and are typically suitable only for accredited investors who can afford potential losses. Past production data and AI predictions do not guarantee future performance. Market volatility, regulatory changes, geological factors, and other variables can dramatically impact well performance and investment returns.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>AI Predictions Disclaimer:</h4>
                    <p className={styles.helpText}>
                      Any AI-generated predictions or statistical estimates provided by TOIL are based on historical data patterns and mathematical models. These predictions are inherently uncertain and may not reflect actual future well performance. Use AI insights as one of many factors in your research, not as the sole basis for decision-making.
                    </p>
                  </div>

                  <div className={styles.helpSubsection}>
                    <h4 className={styles.helpSubsectionTitle}>Use at Your Own Risk:</h4>
                    <p className={styles.helpText}>
                      By using TOIL, you acknowledge that all decisions based on this information are made at your own risk, and the creators of TOIL bear no liability for any losses, damages, or consequences resulting from the use of this platform.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}