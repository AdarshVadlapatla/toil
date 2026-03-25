import { useState, useEffect } from 'react';
import { fetchComplianceData } from '../../utils/api';
import styles from './CompliancePanel.module.css';

export default function CompliancePanel({ wellId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const result = await fetchComplianceData(wellId);
                setData(result);
            } catch (err) {
                console.error('Error loading compliance data:', err);
                setError('Failed to load compliance records');
            } finally {
                setLoading(false);
            }
        }
        if (wellId) loadData();
    }, [wellId]);

    if (loading) return <div className={styles.loading}>Loading compliance data...</div>;
    if (error) return <div className={styles.error}>{error}</div>;

    const { summary, inspections, violations } = data;

    if (!data.available && (!inspections.length && !violations.length)) {
        return (
            <div className={styles.noData}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div className={styles.statusBadgeCompliant}>✓ COMPLIANT</div>
                </div>
                <p>No recent inspections or violations on record for this well.</p>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.summaryHeader}>
                <div className={summary.complianceStatus === 'Compliant' ? styles.statusBadgeCompliant : styles.statusBadgeNonCompliant}>
                    {summary.complianceStatus === 'Compliant' ? '✓ COMPLIANT' : '⚠ NON-COMPLIANT'}
                </div>
                <div className={styles.summaryMetrics}>
                    <div className={styles.summaryMetric}>
                        <span className={styles.summaryLabel}>Last Inspected</span>
                        <span className={styles.summaryValue}>{summary.lastInspected ? new Date(summary.lastInspected).toLocaleDateString() : 'Never'}</span>
                    </div>
                    <div className={styles.summaryMetric}>
                        <span className={styles.summaryLabel}>Open Violations</span>
                        <span className={styles.summaryValue}>{summary.openViolations}</span>
                    </div>
                </div>
            </div>

            {violations.length > 0 && (
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Violations</h4>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Rule</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {violations.map((v, i) => (
                                    <tr key={i}>
                                        <td>{new Date(v.violation_date).toLocaleDateString()}</td>
                                        <td>{v.rule_violated}</td>
                                        <td>
                                            <span className={v.status === 'Open' ? styles.tagOpen : styles.tagClosed}>
                                                {v.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {inspections.length > 0 && (
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Inspections</h4>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Office</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inspections.map((ins, i) => {
                                    const isPass = ins.compliance_status === 'Yes';
                                    return (
                                        <tr key={i}>
                                            <td>{new Date(ins.inspection_date).toLocaleDateString()}</td>
                                            <td>{ins.inspection_type}</td>
                                            <td>
                                                <span className={isPass ? styles.tagPass : styles.tagFail}>
                                                    {isPass ? 'PASS' : 'FAIL'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
