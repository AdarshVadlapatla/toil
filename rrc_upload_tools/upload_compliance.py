"""
Texas RRC Compliance Data (Inspections & Violations) Upload Tool
"""

import pandas as pd
from sqlalchemy import create_engine, text
import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RRCComplianceUploader:
    def __init__(self, connection_string):
        self.engine = create_engine(connection_string)
        
    def create_tables(self):
        """Create the necessary tables in Supabase if they don't exist"""
        logger.info("Ensuring compliance tables exist...")
        with self.engine.connect() as conn:
            # Inspections table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS well_inspections (
                    id SERIAL PRIMARY KEY,
                    api_no VARCHAR(20),
                    inspection_date DATE,
                    inspection_type VARCHAR(255),
                    compliance_status VARCHAR(50),
                    inspector_name VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_well_inspections_api ON well_inspections(api_no);
            """))
            
            # Violations table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS well_violations (
                    id SERIAL PRIMARY KEY,
                    api_no VARCHAR(20),
                    violation_date DATE,
                    rule_violated VARCHAR(255),
                    violation_description TEXT,
                    status VARCHAR(255),
                    resolution_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_well_violations_api ON well_violations(api_no);
                
                -- Ensure status column is large enough
                ALTER TABLE well_violations ALTER COLUMN status TYPE VARCHAR(255);
            """))
            conn.commit()
        logger.info("✓ Tables ready.")

    def upload_inspections(self, file_path):
        """Parse and upload inspections from RRC text file"""
        logger.info(f"Uploading inspections from {file_path}...")
        try:
            # RRC uses '}' as the delimiter
            df = pd.read_csv(file_path, sep='}', engine='python', on_bad_lines='skip', dtype=str)
            
            # Map columns to Supabase schema
            column_mapping = {
                'API_NO': 'api_no',
                'INSPECTION_DATE': 'inspection_date',
                'COMPLIANCE': 'compliance_status',
                'DISTRICT_OFFICE_INSPECTING': 'inspection_type'
            }
            df = df.rename(columns=column_mapping)
            
            # Filter rows to only those that have an API number
            df = df[df['api_no'].notna() & (df['api_no'].str.strip() != '')]
            
            # Keep only the matching columns
            cols_to_keep = ['api_no', 'inspection_date', 'compliance_status', 'inspection_type']
            df = df[[c for c in cols_to_keep if c in df.columns]].copy()
            
            # Standardize dates
            df['inspection_date'] = pd.to_datetime(df['inspection_date'], format='%Y%m%d', errors='coerce')
            
            # Formatting the API No: RRC uses 8-digit APIs occasionally without the '42' Texas state code
            df['api_no'] = df['api_no'].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
            df['api_no'] = df['api_no'].apply(lambda x: '42' + x if len(x) == 8 else x)
            
            df.to_sql('well_inspections', self.engine, if_exists='append', index=False)
            logger.info(f"✓ Uploaded {len(df)} inspection records.")
        except Exception as e:
            logger.error(f"Failed to upload inspections: {e}")

    def upload_violations(self, file_path):
        """Parse and upload violations from RRC text file"""
        logger.info(f"Uploading violations from {file_path}...")
        try:
            df = pd.read_csv(file_path, sep='}', engine='python', on_bad_lines='skip', dtype=str)
            
            # Map columns
            column_mapping = {
                'API_NO': 'api_no',
                'VIOLATION_DISC_DATE': 'violation_date',
                'VIOLATED_RULE': 'rule_violated',
                'VIOLATED_RULE_DESC': 'violation_description',
                'LAST_ENF_ACTION': 'status',
                'LAST_ENF_ACTION_DATE': 'resolution_date'
            }
            df = df.rename(columns=column_mapping)
            
            # Filter rows
            df = df[df['api_no'].notna() & (df['api_no'].str.strip() != '')]
            
            cols_to_keep = ['api_no', 'violation_date', 'rule_violated', 'violation_description', 'status', 'resolution_date']
            df = df[[c for c in cols_to_keep if c in df.columns]].copy()
            
            # Format dates
            df['violation_date'] = pd.to_datetime(df['violation_date'], format='%Y%m%d', errors='coerce')
            df['resolution_date'] = pd.to_datetime(df['resolution_date'], format='%Y%m%d', errors='coerce')
            
            # Format API numbers
            df['api_no'] = df['api_no'].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
            df['api_no'] = df['api_no'].apply(lambda x: '42' + x if len(x) == 8 else x)

            df.to_sql('well_violations', self.engine, if_exists='append', index=False)
            logger.info(f"✓ Uploaded {len(df)} violation records.")
        except Exception as e:
            logger.error(f"Failed to upload violations: {e}")

def main():
    # Load environment variables from a .env file if present
    load_dotenv()
    
    # Credentials from your existing tools
    DB_USER = "postgres.cybbfiogqisodsytxlnx"
    
    # Try to load password from environment, fallback to a placeholder if it fails
    DB_PASS = os.getenv("SUPABASE_PASSWORD")
    if not DB_PASS:
        logger.error("SUPABASE_PASSWORD environment variable not found. Please set it in a .env file or export it.")
        print("\nTo run this script, you must provide your database password.")
        print("Create a file named .env in this directory with the line:")
        print("SUPABASE_PASSWORD=your_actual_password_here")
        return

    DB_HOST = "aws-1-us-east-1.pooler.supabase.com"
    DB_NAME = "postgres"
    CONNECTION_STRING = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:5432/{DB_NAME}"

    uploader = RRCComplianceUploader(CONNECTION_STRING)
    uploader.create_tables()
    
    # Example usage (Uncomment the lines below to run parsing on the downloaded data):
    
    inspections_path = Path(__file__).parent / 'compliance_data' / 'INSPECTIONS.txt'
    violations_path = Path(__file__).parent / 'compliance_data' / 'VIOLATIONS.txt'
    
    if inspections_path.exists():
        uploader.upload_inspections(str(inspections_path))
    else:
        logger.warning(f"Could not find {inspections_path}")
        
    if violations_path.exists():
        uploader.upload_violations(str(violations_path))
    else:
        logger.warning(f"Could not find {violations_path}")

if __name__ == "__main__":
    main()
