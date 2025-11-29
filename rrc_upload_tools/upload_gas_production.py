"""
Texas RRC Gas Production Data Upload Script
Downloads EBCDIC-encoded .ebc files, decodes them, and uploads to Supabase

The .ebc files contain gas well production data in EBCDIC format with COBOL record layout.
Records include:
- Field records (type 1): Gas field information
- Well records (type 5): Individual well data with monthly production history
"""

import os
import struct
import requests
import gzip
import shutil
from sqlalchemy import create_engine, text, MetaData, Table, Column, String, Integer, BigInteger, Date, DECIMAL
from pathlib import Path
import logging
from datetime import datetime
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class COMP3Decoder:
    """
    Handles COMP-3 (Packed Decimal) decoding from COBOL mainframe files.
    COMP-3 stores two decimal digits per byte, with the sign in the last nibble.
    """
    
    @staticmethod
    def decode(data):
        """
        Decode COMP-3 packed decimal data to integer
        
        Args:
            data: bytes object containing packed decimal
            
        Returns:
            Integer value (or None if invalid)
        """
        if not data:
            return None
            
        try:
            # Each byte contains two digits (nibbles), except the last which has digit + sign
            result = 0
            
            for i, byte in enumerate(data):
                if i == len(data) - 1:
                    # Last byte: high nibble is digit, low nibble is sign
                    high_nibble = (byte >> 4) & 0x0F
                    sign_nibble = byte & 0x0F
                    
                    result = result * 10 + high_nibble
                    
                    # Sign: 0x0C = +, 0x0D = -, 0x0F = unsigned
                    if sign_nibble == 0x0D:
                        result = -result
                else:
                    # Regular bytes: both nibbles are digits
                    high_nibble = (byte >> 4) & 0x0F
                    low_nibble = byte & 0x0F
                    
                    result = result * 10 + high_nibble
                    result = result * 10 + low_nibble
            
            return result
            
        except Exception as e:
            logger.debug(f"COMP-3 decode error: {e}")
            return None
    
    @staticmethod
    def decode_with_decimals(data, decimal_places):
        """
        Decode COMP-3 with implied decimal places
        
        Args:
            data: bytes object containing packed decimal
            decimal_places: number of implied decimal places
            
        Returns:
            Float value (or None if invalid)
        """
        int_value = COMP3Decoder.decode(data)
        if int_value is None:
            return None
        
        return int_value / (10 ** decimal_places)


class GasProductionUploader:
    """
    Downloads EBCDIC .ebc files from Texas RRC and uploads gas production data to Supabase
    """
    
    # Record type constants (EBCDIC encoded)
    FIELD_RECORD_TYPE = b'\xf1'  # EBCDIC '1'
    WELL_RECORD_TYPE = b'\xf5'   # EBCDIC '5'
    
    # Record lengths (bytes)
    RECORD_LENGTH = 2120
    
    def __init__(self, supabase_connection_string, download_dir='./gas_production_data'):
        """
        Initialize the uploader
        
        Args:
            supabase_connection_string: PostgreSQL connection string
            download_dir: Directory to store downloaded files
        """
        self.connection_string = supabase_connection_string
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(exist_ok=True)
        self.engine = None
        
    def connect_to_database(self):
        """Create database engine connection"""
        try:
            self.engine = create_engine(self.connection_string)
            logger.info("Successfully connected to Supabase database")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            return False
    
    def decode_ebcdic_string(self, ebcdic_bytes):
        """
        Decode EBCDIC bytes to ASCII string
        
        Args:
            ebcdic_bytes: bytes in EBCDIC encoding
            
        Returns:
            Decoded string (stripped of whitespace)
        """
        try:
            # Decode from EBCDIC (cp500 is IBM EBCDIC)
            decoded = ebcdic_bytes.decode('cp500').strip()
            return decoded
        except Exception as e:
            logger.debug(f"EBCDIC decode error: {e}")
            return ""
    
    def decode_ebcdic_number(self, ebcdic_bytes):
        """
        Decode EBCDIC bytes representing a number
        
        Args:
            ebcdic_bytes: bytes in EBCDIC encoding
            
        Returns:
            Integer (or None if invalid)
        """
        try:
            decoded = self.decode_ebcdic_string(ebcdic_bytes)
            if decoded and decoded.strip():
                return int(decoded)
            return None
        except:
            return None
    
    def parse_well_record(self, record_data):
        """
        Parse a well record (type 5) from EBCDIC data
        
        Based on COBOL layout from manual:
        - Position 1: Record type (5)
        - Position 3-10: WELL-ID (6 digits)
        - Position 11-16: OPER-ID (6 digits)
        - Position 17-24: W-PERM-FLD-ID (8 digits)
        - Position 25: W-DIST-NO (2 digits)
        - Position 26: W-DIST-SFX (1 character)
        - Position 27-32: WELL-NO (tract + number + suffix)
        - Position 28-30: WELL-NR (3 digits, part of WELL-NO)
        - Position 317+: Monthly data (14 months worth)
        
        Each monthly record contains:
        - W-DATE (6 bytes): CCYYMM
        - GAS-PRD (COMP-3, 4 bytes): Monthly gas production
        - W-TYPE-MO (1 byte): Well type/status for month
        
        Args:
            record_data: Full 2120-byte record
            
        Returns:
            List of dictionaries with parsed monthly data
        """
        results = []
        
        try:
            # Extract WELL-ID (positions 3-8, 0-indexed = 2-7)
            well_id_bytes = record_data[2:8]
            well_id = self.decode_ebcdic_string(well_id_bytes)
            
            # Extract OPER-ID (positions 9-14, 0-indexed = 8-13)
            oper_id_bytes = record_data[8:14]
            oper_id = self.decode_ebcdic_string(oper_id_bytes)
            
            # Extract W-PERM-FLD-ID (positions 15-22, 0-indexed = 14-21)
            w_perm_fld_id_bytes = record_data[14:22]
            w_perm_fld_id = self.decode_ebcdic_string(w_perm_fld_id_bytes)
            
            # Extract W-DIST-NO (positions 23-24, 0-indexed = 22-23)
            w_dist_no_bytes = record_data[22:24]
            w_dist_no = self.decode_ebcdic_string(w_dist_no_bytes)
            
            # Extract W-DIST-SFX (position 25, 0-indexed = 24)
            w_dist_sfx_bytes = record_data[24:25]
            w_dist_sfx = self.decode_ebcdic_string(w_dist_sfx_bytes)
            
            # Extract well number (positions 26-31, 0-indexed = 25-30)
            # WELL-NO structure: TRACT-NO (1) + WELL-NR (3) + WELL-SFX (2)
            well_no_bytes = record_data[25:31]
            well_no = self.decode_ebcdic_string(well_no_bytes)
            
            # Extract WELL-NR (positions 27-29, 0-indexed = 26-28)
            well_nr_bytes = record_data[26:29]
            well_nr = self.decode_ebcdic_string(well_nr_bytes)
            
            if not well_no:
                return results
            
            # Monthly data starts at position 317 (0-indexed = 316)
            # Each monthly record is 116 bytes according to COBOL layout
            monthly_start = 316
            monthly_size = 116
            num_months = 14
            
            for month_idx in range(num_months):
                offset = monthly_start + (month_idx * monthly_size)
                
                # Extract fields from this monthly record
                # W-DATE: 6 bytes at start of monthly record
                w_date_bytes = record_data[offset:offset+6]
                w_date_str = self.decode_ebcdic_string(w_date_bytes)
                
                # Parse date (CCYYMM format)
                year_month = None
                if w_date_str and len(w_date_str) == 6:
                    try:
                        year = int(w_date_str[0:4])
                        month = int(w_date_str[4:6])
                        if 1 <= month <= 12 and 1900 <= year <= 2100:
                            year_month = f"{year}-{month:02d}-01"  # First day of month
                    except:
                        pass
                
                # W-TYPE-MO: 1 byte at offset 20 within monthly record (337 - 317 = 20)
                w_type_mo_byte = record_data[offset+20:offset+21]
                w_type_mo = self.decode_ebcdic_string(w_type_mo_byte)
                
                # GAS-PRD: COMP-3, 4 bytes at offset 36 within monthly record (353 - 317 = 36)
                gas_prd_bytes = record_data[offset+36:offset+40]
                gas_prd = COMP3Decoder.decode(gas_prd_bytes)
                
                # Only include records with valid data
                if year_month and (gas_prd is not None or w_type_mo):
                    results.append({
                        'well_id': well_id,
                        'oper_id': oper_id,
                        'field_id': w_perm_fld_id,
                        'w_dist_no': w_dist_no,
                        'w_dist_sfx': w_dist_sfx,
                        'well_no': well_no,
                        'well_nr': well_nr,
                        'year_month': year_month,
                        'gas_production': gas_prd if gas_prd is not None else 0,
                        'well_type_month': w_type_mo if w_type_mo else ''
                    })
            
        except Exception as e:
            logger.debug(f"Error parsing well record: {e}")
        
        return results
    
    def process_ebc_file(self, filepath):
        """
        Process an EBCDIC .ebc file and extract well production data
        Automatically handles .gz compressed files
        
        Args:
            filepath: Path to .ebc or .ebc.gz file
            
        Returns:
            List of parsed well production records
        """
        logger.info(f"📖 Processing file: {filepath.name}")
        
        all_records = []
        
        try:
            # Check if file is gzip compressed
            if filepath.suffix == '.gz':
                logger.info("Decompressing .gz file...")
                with gzip.open(filepath, 'rb') as f:
                    file_data = f.read()
            else:
                with open(filepath, 'rb') as f:
                    file_data = f.read()
            
            file_size = len(file_data)
            logger.info(f"File size: {file_size:,} bytes")
            
            # Skip IBM standard labels if present (first 240 bytes typically)
            # Volume label (80) + 2 header labels (160) = 240 bytes
            # We'll try to detect record type markers
            
            offset = 0
            record_count = 0
            well_record_count = 0
            field_record_count = 0
            
            # Process records
            while offset + self.RECORD_LENGTH <= file_size:
                record = file_data[offset:offset+self.RECORD_LENGTH]
                
                # Get record type from first byte
                record_type = record[0:1]
                
                if record_type == self.FIELD_RECORD_TYPE:
                    field_record_count += 1
                elif record_type == self.WELL_RECORD_TYPE:
                    well_record_count += 1
                    # Parse well record
                    parsed_data = self.parse_well_record(record)
                    all_records.extend(parsed_data)
                
                record_count += 1
                offset += self.RECORD_LENGTH
                
                # Progress update every 10000 records
                if record_count % 10000 == 0:
                    logger.info(f"  Processed {record_count:,} records...")
            
            logger.info(f"✓ Processed {record_count:,} total records")
            logger.info(f"  - Field records: {field_record_count:,}")
            logger.info(f"  - Well records: {well_record_count:,}")
            logger.info(f"  - Extracted {len(all_records):,} monthly production entries")
            
        except Exception as e:
            logger.error(f"Error processing file {filepath}: {e}")
        
        return all_records
    
    def create_production_table(self, table_name):
        """
        Create the gas production table if it doesn't exist
        Pooler-compatible version with error handling
        
        Args:
            table_name: Name of table to create
        """
        try:
            # Try using raw SQL which works better with pooler
            with self.engine.begin() as conn:
                # Check if table exists
                check_sql = text(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = '{table_name}'
                    );
                """)
                result = conn.execute(check_sql)
                exists = result.scalar()
                
                if not exists:
                    # Create table with raw SQL
                    create_sql = text(f"""
                        CREATE TABLE {table_name} (
                            id SERIAL PRIMARY KEY,
                            well_id VARCHAR(10),
                            oper_id VARCHAR(10),
                            field_id VARCHAR(10),
                            w_dist_no VARCHAR(2),
                            w_dist_sfx VARCHAR(1),
                            well_no VARCHAR(10) NOT NULL,
                            well_nr VARCHAR(5),
                            year_month DATE NOT NULL,
                            gas_production BIGINT,
                            well_type_month VARCHAR(5),
                            created_at TIMESTAMP DEFAULT NOW()
                        );
                        
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_well_id ON {table_name}(well_id);
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_oper_id ON {table_name}(oper_id);
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_field_id ON {table_name}(field_id);
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_w_dist_no ON {table_name}(w_dist_no);
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_well_no ON {table_name}(well_no);
                        CREATE INDEX IF NOT EXISTS idx_{table_name}_year_month ON {table_name}(year_month);
                    """)
                    conn.execute(create_sql)
                    logger.info(f"✓ Table '{table_name}' created")
                else:
                    logger.info(f"✓ Table '{table_name}' already exists")
            
        except Exception as e:
            logger.error(f"Error creating table: {e}")
            # Try fallback with SQLAlchemy (might work with some poolers)
            try:
                metadata = MetaData()
                table = Table(
                    table_name,
                    metadata,
                    Column('id', Integer, primary_key=True, autoincrement=True),
                    Column('well_id', String(10), index=True),
                    Column('oper_id', String(10), index=True),
                    Column('field_id', String(10), index=True),
                    Column('w_dist_no', String(2), index=True),
                    Column('w_dist_sfx', String(1)),
                    Column('well_no', String(10), nullable=False, index=True),
                    Column('well_nr', String(5)),
                    Column('year_month', Date, nullable=False, index=True),
                    Column('gas_production', BigInteger),
                    Column('well_type_month', String(5)),
                    Column('created_at', String(50), server_default=text('NOW()')),
                    schema='public'
                )
                metadata.create_all(self.engine)
                logger.info(f"✓ Table '{table_name}' ready (via SQLAlchemy)")
            except Exception as e2:
                logger.error(f"Fallback also failed: {e2}")
                raise
    
    def upload_to_database(self, records, table_name, batch_size=5000, skip_records=0):
        """
        Upload parsed records to Supabase
        
        Args:
            records: List of dictionaries with production data
            table_name: Target table name
            batch_size: Number of records per batch
            skip_records: Number of records to skip from the beginning (for resuming failed uploads)
            
        Returns:
            Number of records uploaded
        """
        if not records:
            logger.warning("No records to upload")
            return 0
        
        # Skip records if resuming
        if skip_records > 0:
            logger.info(f"⏭️  Skipping first {skip_records:,} records (resuming from previous upload)")
            records = records[skip_records:]
            if not records:
                logger.warning("No records left after skipping")
                return 0
        
        logger.info(f"📤 Uploading {len(records):,} records to '{table_name}'...")
        
        try:
            # Create table if needed
            self.create_production_table(table_name)
            
            # Upload in batches
            uploaded = 0
            
            for i in range(0, len(records), batch_size):
                batch = records[i:i+batch_size]
                
                with self.engine.begin() as conn:
                    # Insert records
                    insert_sql = text(f"""
                        INSERT INTO {table_name} 
                        (well_id, oper_id, field_id, w_dist_no, w_dist_sfx, well_no, well_nr, year_month, gas_production, well_type_month)
                        VALUES 
                        (:well_id, :oper_id, :field_id, :w_dist_no, :w_dist_sfx, :well_no, :well_nr, :year_month, :gas_production, :well_type_month)
                    """)
                    
                    conn.execute(insert_sql, batch)
                    uploaded += len(batch)
                
                logger.info(f"  Uploaded {uploaded:,}/{len(records):,} records...")
            
            logger.info(f"✓ Upload complete: {uploaded:,} records")
            return uploaded
            
        except Exception as e:
            logger.error(f"Error uploading to database: {e}")
            raise
    
    def drop_and_recreate_table(self, table_name):
        """
        Drop existing table and recreate with current schema
        Use this when schema changes (like adding new columns)
        
        Args:
            table_name: Name of table to drop and recreate
        """
        try:
            with self.engine.begin() as conn:
                # Drop table if exists
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))
                logger.info(f"✓ Dropped table '{table_name}'")
            
            # Recreate with new schema
            self.create_production_table(table_name)
            
        except Exception as e:
            logger.error(f"Error dropping/recreating table: {e}")
            raise
    
    def truncate_table(self, table_name):
        """
        Clear all data from table
        Pooler-compatible version using DELETE instead of TRUNCATE
        Creates table if it doesn't exist
        
        Args:
            table_name: Name of table to truncate
        """
        try:
            # First, ensure table exists
            self.create_production_table(table_name)
            
            # Then clear it
            with self.engine.begin() as conn:
                # Use DELETE instead of TRUNCATE for pooler compatibility
                conn.execute(text(f"DELETE FROM {table_name}"))
            logger.info(f"✓ Table '{table_name}' cleared")
        except Exception as e:
            logger.error(f"Error clearing table: {e}")
            raise
    
    def download_files_with_browser(self, base_url, file_patterns=None, max_files=None):
        """
        Download .ebc files from RRC website using browser automation
        
        Args:
            base_url: The RRC file listing page URL
            file_patterns: List of filenames to download (e.g., ['dbf001.ebc'])
                          If None, downloads all .ebc files
            max_files: Maximum number of files to download (None = all)
        
        Returns:
            List of successfully downloaded file paths
        """
        logger.info("🌐 Starting browser automation for file downloads...")
        
        # Setup Chrome to auto-download files
        chrome_options = Options()
        chrome_options.add_experimental_option('prefs', {
            "download.default_directory": str(self.download_dir.absolute()),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True
        })
        
        downloaded_files = []
        driver = None
        
        try:
            logger.info("Opening browser...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            driver.get(base_url)
            
            logger.info("Waiting for page to load...")
            time.sleep(3)
            
            # Find all .ebc file links
            file_links = driver.find_elements(By.XPATH, "//a[contains(@href, '.ebc') or contains(text(), '.ebc')]")
            
            if not file_links:
                # Try alternative patterns
                file_links = driver.find_elements(By.XPATH, "//*[contains(text(), 'gsf') or contains(text(), 'dbf')]")
            
            logger.info(f"Found {len(file_links)} potential .ebc file links")
            
            # Extract file info - prefer .gz files
            ebc_files = []
            gz_files = set()
            
            for link in file_links:
                try:
                    link_text = link.text
                    if '.ebc' in link_text.lower():
                        # Track .gz files
                        if link_text.endswith('.gz'):
                            base_name = link_text[:-3]  # Remove .gz
                            gz_files.add(base_name)
                            ebc_files.append((link, link_text, True))  # True = compressed
                        else:
                            ebc_files.append((link, link_text, False))  # False = uncompressed
                except:
                    continue
            
            # Filter out uncompressed files if we have the compressed version
            filtered_files = []
            for link, name, is_gz in ebc_files:
                if not is_gz and name in gz_files:
                    logger.debug(f"Skipping {name} (have .gz version)")
                    continue
                filtered_files.append((link, name))
            
            ebc_files = filtered_files
            logger.info(f"Found {len(ebc_files)} .ebc files (preferring .gz versions)")
            
            # Filter to specific files if requested
            if file_patterns:
                logger.info(f"Filtering to {len(file_patterns)} specific files...")
                ebc_files = [(link, name) for link, name in ebc_files 
                            if any(pattern.lower() in name.lower() for pattern in file_patterns)]
            
            # Limit number of files
            if max_files and max_files < len(ebc_files):
                logger.info(f"Limiting to first {max_files} files")
                ebc_files = ebc_files[:max_files]
            
            logger.info(f"Will download {len(ebc_files)} file(s)")
            
            for idx, (link, link_text) in enumerate(ebc_files, 1):
                try:
                    logger.info(f"📥 [{idx}/{len(ebc_files)}] Downloading: {link_text}")
                    link.click()
                    time.sleep(2)  # Wait for download
                    
                    # Determine actual filename
                    filename = link_text if '.ebc' in link_text else f"{link_text}.ebc"
                    downloaded_files.append(self.download_dir / filename)
                    
                except Exception as e:
                    logger.warning(f"Could not download {link_text}: {e}")
                    continue
            
            # Wait for downloads to complete
            if downloaded_files:
                logger.info("⏳ Waiting for downloads to complete...")
                time.sleep(5)
                
                # Verify downloads
                completed = []
                for filepath in downloaded_files:
                    if filepath.exists():
                        size_mb = filepath.stat().st_size / (1024 * 1024)
                        logger.info(f"✓ Downloaded: {filepath.name} ({size_mb:.2f} MB)")
                        completed.append(filepath)
                    else:
                        logger.warning(f"⚠️  File not found: {filepath.name}")
                
                return completed
            else:
                logger.warning("No files were downloaded")
                return []
                
        except Exception as e:
            logger.error(f"Browser automation failed: {e}")
            return []
        finally:
            if driver:
                driver.quit()
                logger.info("Browser closed")


def main():
    """Main entry point"""
    
    # Configuration - using session pooler (IPv4 compatible)
    # Same Supabase project as location data
    SUPABASE_HOST = "aws-1-us-east-1.pooler.supabase.com"
    SUPABASE_PORT = "5432"
    SUPABASE_DB = "postgres"
    SUPABASE_USER = "postgres.cybbfiogqisodsytxlnx"
    TABLE_NAME = "gas_production"
    
    RRC_DOWNLOAD_PAGE = "https://mft.rrc.texas.gov/link/c45ee840-9d50-4a74-b6b0-dba0cb4954b7"
    DOWNLOAD_DIR = "./gas_production_data"
    
    print("=" * 60)
    print("Texas RRC Gas Production Data Uploader")
    print("=" * 60)
    print("\nThis script downloads EBCDIC .ebc files and uploads to Supabase")
    print("\nSelect mode:")
    print("1. Test EBCDIC decoder with local file")
    print("2. Download files and upload to database")
    print("3. Process local files and upload to database")
    
    mode = input("\nEnter mode (1-3): ").strip()
    
    if mode == "1":
        # Test mode - decode a local file
        logger.info("Mode 1: Test EBCDIC decoder")
        
        test_file = input("\nEnter path to .ebc file to test: ").strip()
        if not test_file or not Path(test_file).exists():
            logger.error("File not found")
            return
        
        uploader = GasProductionUploader("", DOWNLOAD_DIR)
        records = uploader.process_ebc_file(Path(test_file))
        
        if records:
            logger.info(f"\n✓ Successfully decoded {len(records)} records!")
            logger.info("\nSample records (first 10):")
            for i, record in enumerate(records[:10], 1):
                logger.info(f"{i}. {record}")
        else:
            logger.warning("No records decoded - check file format")
    
    elif mode == "2":
        # Download and upload
        logger.info("Mode 2: Download and upload to database")
        
        SUPABASE_PASSWORD = input("\nEnter Supabase database password: ").strip()
        if not SUPABASE_PASSWORD:
            logger.error("Password is required")
            return
        
        connection_string = (
            f"postgresql://{SUPABASE_USER}:{SUPABASE_PASSWORD}"
            f"@{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DB}"
        )
        
        uploader = GasProductionUploader(connection_string, DOWNLOAD_DIR)
        
        if not uploader.connect_to_database():
            logger.error("Failed to connect to database")
            return
        
        # Ask which files to download
        print("\nFile selection:")
        print("1. Download all .ebc files")
        print("2. Download specific file(s)")
        
        file_choice = input("Enter choice (1-2): ").strip()
        
        files_to_download = None
        max_files = None
        
        if file_choice == "2":
            file_input = input("Enter filename(s) separated by commas: ").strip()
            files_to_download = [f.strip() for f in file_input.split(',')]
        else:
            max_input = input("Maximum files to download (or press Enter for all): ").strip()
            if max_input:
                max_files = int(max_input)
        
        # Download files
        logger.info("\n📥 Step 1: Downloading files...")
        downloaded = uploader.download_files_with_browser(
            RRC_DOWNLOAD_PAGE, 
            files_to_download, 
            max_files
        )
        
        if not downloaded:
            logger.error("No files downloaded")
            return
        
        # Confirm before clearing table
        print(f"\n⚠️  Choose what to do with the '{TABLE_NAME}' table:")
        print("1. Clear existing data (keep table structure)")
        print("2. Drop and recreate table (use if schema changed)")
        print("3. Append to existing data (no clearing)")
        
        action = input("Enter choice (1-3): ").strip()
        
        if action == '2':
            confirm = input(f"Type 'yes' to DROP and RECREATE '{TABLE_NAME}': ").strip().lower()
            if confirm != 'yes':
                logger.info("Upload cancelled")
                return
            uploader.drop_and_recreate_table(TABLE_NAME)
        elif action == '1':
            confirm = input(f"Type 'yes' to CLEAR '{TABLE_NAME}': ").strip().lower()
            if confirm != 'yes':
                logger.info("Upload cancelled")
                return
            uploader.truncate_table(TABLE_NAME)
        elif action == '3':
            logger.info("Will append to existing table data")
            # Ensure table exists
            uploader.create_production_table(TABLE_NAME)
        else:
            logger.info("Invalid choice, upload cancelled")
            return
        
        # Ask if resuming from failed upload
        skip_records = 0
        resume = input("\nResume from failed upload? (y/n): ").strip().lower()
        if resume == 'y':
            skip_input = input("How many records were already uploaded? ").strip()
            try:
                skip_records = int(skip_input)
                logger.info(f"Will skip first {skip_records:,} records")
            except ValueError:
                logger.error("Invalid number, starting from beginning")
                skip_records = 0
        
        # Process and upload each file
        logger.info("\n📤 Step 2: Processing and uploading...")
        total_records = 0
        
        for ebc_file in downloaded:
            records = uploader.process_ebc_file(ebc_file)
            if records:
                uploaded = uploader.upload_to_database(records, TABLE_NAME, skip_records=skip_records)
                total_records += uploaded
                skip_records = 0  # Only skip on first file
        
        logger.info(f"\n✓ Complete! Total records uploaded: {total_records:,}")
    
    elif mode == "3":
        # Process local files
        logger.info("Mode 3: Process local files and upload")
        
        local_file = input("\nEnter path to .ebc file: ").strip()
        if not local_file or not Path(local_file).exists():
            logger.error("File not found")
            return
        
        SUPABASE_PASSWORD = input("Enter Supabase database password: ").strip()
        if not SUPABASE_PASSWORD:
            logger.error("Password is required")
            return
        
        connection_string = (
            f"postgresql://{SUPABASE_USER}:{SUPABASE_PASSWORD}"
            f"@{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DB}"
        )
        
        uploader = GasProductionUploader(connection_string, DOWNLOAD_DIR)
        
        if not uploader.connect_to_database():
            logger.error("Failed to connect to database")
            return
        
        # Confirm before clearing table
        print(f"\n⚠️  Choose what to do with the '{TABLE_NAME}' table:")
        print("1. Clear existing data (keep table structure)")
        print("2. Drop and recreate table (use if schema changed)")
        print("3. Append to existing data (no clearing)")
        
        action = input("Enter choice (1-3): ").strip()
        
        if action == '2':
            confirm = input(f"Type 'yes' to DROP and RECREATE '{TABLE_NAME}': ").strip().lower()
            if confirm != 'yes':
                logger.info("Upload cancelled")
                return
            uploader.drop_and_recreate_table(TABLE_NAME)
        elif action == '1':
            confirm = input(f"Type 'yes' to CLEAR '{TABLE_NAME}': ").strip().lower()
            if confirm != 'yes':
                logger.info("Upload cancelled")
                return
            uploader.truncate_table(TABLE_NAME)
        elif action == '3':
            logger.info("Will append to existing table data")
            # Ensure table exists
            uploader.create_production_table(TABLE_NAME)
        else:
            logger.info("Invalid choice, upload cancelled")
            return
        
        # Ask if resuming from failed upload
        skip_records = 0
        resume = input("\nResume from failed upload? (y/n): ").strip().lower()
        if resume == 'y':
            skip_input = input("How many records were already uploaded? ").strip()
            try:
                skip_records = int(skip_input)
                logger.info(f"Will skip first {skip_records:,} records")
            except ValueError:
                logger.error("Invalid number, starting from beginning")
                skip_records = 0
        
        # Process file
        records = uploader.process_ebc_file(Path(local_file))
        if records:
            uploaded = uploader.upload_to_database(records, TABLE_NAME, skip_records=skip_records)
            logger.info(f"\n✓ Complete! Uploaded {uploaded:,} records")
        else:
            logger.warning("No records found in file")
    
    else:
        logger.error("Invalid mode")
        return
    
    logger.info("\n✓ Script complete!")


if __name__ == "__main__":
    main()
