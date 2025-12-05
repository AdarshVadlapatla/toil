"""
Texas RRC Well Data Upload Script
Automates downloading, converting, and uploading shapefile data to Supabase
"""

import os
import zipfile
import requests
import geopandas as gpd
from sqlalchemy import create_engine, text
from pathlib import Path
import logging
from bs4 import BeautifulSoup
import re
import time
import shutil
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RRCDataUploader:
    def __init__(self, supabase_connection_string, download_dir='./rrc_data'):
        """
        Initialize the uploader with Supabase connection details
        
        Args:
            supabase_connection_string: PostgreSQL connection string
                Format: postgresql://user:password@host:port/database
            download_dir: Directory to store downloaded files
        """
        self.connection_string = supabase_connection_string
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(exist_ok=True)
        self.engine = None
    
    def clear_download_directory(self):
        """
        Clear all contents of the download directory for a fresh start
        """
        if self.download_dir.exists():
            logger.info(f"🗑️  Clearing download directory: {self.download_dir}")
            try:
                # Remove all contents but keep the directory
                for item in self.download_dir.iterdir():
                    if item.is_dir():
                        shutil.rmtree(item)
                        logger.info(f"  Removed directory: {item.name}")
                    else:
                        item.unlink()
                        logger.info(f"  Removed file: {item.name}")
                logger.info(f"✓ Download directory cleared")
            except Exception as e:
                logger.error(f"Failed to clear download directory: {e}")
        else:
            logger.info(f"Download directory doesn't exist yet, will be created")
        
    def connect_to_database(self):
        """Create database engine connection"""
        try:
            self.engine = create_engine(self.connection_string)
            logger.info("Successfully connected to Supabase database")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            return False
    
    def download_files_with_browser(self, base_url, file_patterns=None, max_files=None):
        """
        Download files from RRC website using browser automation (Selenium)
        This bypasses the session-based download system
        
        Args:
            base_url: The RRC file listing page URL
            file_patterns: List of filenames to download (e.g., ['well001.zip', 'well003.zip'])
                          If None, downloads all well*.zip files
            max_files: Maximum number of files to download (None = all)
        
        Returns:
            List of successfully downloaded file paths
        """
        logger.info("🌐 Starting browser automation for file downloads...")
        
        # Setup Chrome to auto-download files to our directory
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
            time.sleep(3)  # Wait for page to fully load
            
            # Find all file links on the page
            # The files appear to be in a table or list - we'll look for links containing .zip
            file_links = driver.find_elements(By.XPATH, "//a[contains(@href, '.zip') or contains(text(), 'well')]")
            
            if not file_links:
                # Alternative: look for any clickable elements with well*.zip pattern
                file_links = driver.find_elements(By.XPATH, "//*[contains(text(), 'well') and contains(text(), '.zip')]")
            
            logger.info(f"Found {len(file_links)} potential file links on page")
            
            # Filter to well*.zip files
            well_files = []
            for link in file_links:
                try:
                    link_text = link.text
                    if link_text.startswith('well') and link_text.endswith('.zip'):
                        well_files.append((link, link_text))
                except:
                    continue
            
            logger.info(f"Found {len(well_files)} well*.zip files")
            
            # Filter to files we want
            if file_patterns:
                logger.info(f"Filtering to {len(file_patterns)} specific files...")
                well_files = [(link, name) for link, name in well_files if name in file_patterns]
            
            # Limit number of files if specified
            if max_files and max_files < len(well_files):
                logger.info(f"Limiting to first {max_files} files")
                well_files = well_files[:max_files]
            
            logger.info(f"Will download {len(well_files)} file(s)")
            
            for idx, (link, link_text) in enumerate(well_files, 1):
                try:
                    logger.info(f"📥 [{idx}/{len(well_files)}] Clicking to download: {link_text}")
                    
                    # Click the link to trigger download
                    link.click()
                    time.sleep(1)  # Wait for download to start
                    
                    downloaded_files.append(self.download_dir / link_text)
                    
                except Exception as e:
                    logger.warning(f"Could not click link {link_text}: {e}")
                    continue
            
            # Wait for downloads to complete
            if downloaded_files:
                logger.info("⏳ Waiting for downloads to complete...")
                time.sleep(5)  # Give time for downloads to finish
                
                # Check which files actually completed
                completed = []
                for filepath in downloaded_files:
                    if filepath.exists():
                        file_size_mb = filepath.stat().st_size / (1024 * 1024)
                        logger.info(f"✓ Downloaded: {filepath.name} ({file_size_mb:.2f} MB)")
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
    
    def download_file(self, url, filename):
        """
        Download a file from URL
        
        Args:
            url: URL to download from
            filename: Local filename to save as
        """
        filepath = self.download_dir / filename
        
        if filepath.exists():
            file_size_mb = filepath.stat().st_size / (1024 * 1024)
            logger.info(f"✓ File {filename} already exists ({file_size_mb:.2f} MB), skipping download")
            return filepath
        
        try:
            logger.info(f"📥 Downloading {filename} from {url}")
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            # Get file size if available
            total_size = int(response.headers.get('content-length', 0))
            total_size_mb = total_size / (1024 * 1024)
            
            if total_size > 0:
                logger.info(f"   File size: {total_size_mb:.2f} MB")
            
            downloaded = 0
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    # Log progress for large files
                    if total_size > 0 and downloaded % (1024 * 1024) == 0:  # Every MB
                        progress = (downloaded / total_size) * 100
                        logger.info(f"   Progress: {progress:.1f}%")
            
            file_size_mb = filepath.stat().st_size / (1024 * 1024)
            logger.info(f"✓ Successfully downloaded {filename} ({file_size_mb:.2f} MB)")
            return filepath
        except requests.exceptions.Timeout:
            logger.error(f"✗ Timeout downloading {filename} - server took too long to respond")
            return None
        except requests.exceptions.HTTPError as e:
            logger.error(f"✗ HTTP error downloading {filename}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"✗ Failed to download {filename}: {e}")
            return None
    
    def scrape_download_links(self, base_url):
        """
        Scrape shapefile download links from the RRC website
        
        Args:
            base_url: Base URL of the RRC download page
            
        Returns:
            List of tuples (county_name, download_url)
        """
        try:
            logger.info("Scraping download links from RRC website...")
            response = requests.get(base_url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find all download links (adjust selector based on actual page structure)
            links = []
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '.zip' in href.lower() and 'well' in href.lower():
                    # Extract county name from link text or URL
                    county_name = link.text.strip() or Path(href).stem
                    full_url = href if href.startswith('http') else base_url.rstrip('/') + '/' + href.lstrip('/')
                    links.append((county_name, full_url))
            
            logger.info(f"Found {len(links)} shapefile links")
            return links
        except Exception as e:
            logger.error(f"Failed to scrape links: {e}")
            return []
    
    def extract_zip(self, zip_path):
        """
        Extract zip file
        
        Args:
            zip_path: Path to zip file
            
        Returns:
            Path to extraction directory
        """
        extract_dir = zip_path.parent / zip_path.stem
        
        # Check if already extracted
        if extract_dir.exists() and any(extract_dir.glob('*.shp')):
            logger.info(f"✓ Files already extracted to {extract_dir.name}, skipping extraction")
            return extract_dir
        
        extract_dir.mkdir(exist_ok=True)
        
        try:
            logger.info(f"📦 Extracting {zip_path.name}...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                file_list = zip_ref.namelist()
                logger.info(f"   Contains {len(file_list)} files")
                zip_ref.extractall(extract_dir)
            
            # Count extracted shapefiles
            shapefiles = list(extract_dir.glob('*.shp'))
            logger.info(f"✓ Extracted {len(shapefiles)} shapefile(s) to {extract_dir.name}")
            return extract_dir
        except zipfile.BadZipFile:
            logger.error(f"✗ {zip_path.name} is not a valid zip file or is corrupted")
            return None
        except Exception as e:
            logger.error(f"✗ Failed to extract {zip_path.name}: {e}")
            return None
    
    def find_shapefiles(self, directory, surface_only=True):
        """
        Find .shp files in directory
        
        RRC well data comes with multiple shapefiles per county:
        - *s.shp = Surface locations (this is what we want!)
        - *b.shp = Bottom hole locations
        - *l.shp = Lease/line data
        
        Args:
            directory: Directory to search
            surface_only: If True, only return *s.shp files (default: True)
            
        Returns:
            List of shapefile paths
        """
        all_shapefiles = list(Path(directory).rglob('*.shp'))
        
        if surface_only:
            # Filter to only surface location files (ending in 's.shp')
            shapefiles = [shp for shp in all_shapefiles if shp.stem.endswith('s')]
            logger.info(f"Found {len(all_shapefiles)} total shapefiles, "
                       f"filtered to {len(shapefiles)} surface location files (*s.shp)")
        else:
            shapefiles = all_shapefiles
            logger.info(f"Found {len(shapefiles)} shapefiles in {directory}")
        
        return shapefiles
    
    def upload_shapefile_to_db(self, shapefile_path, table_name='well_locations', 
                                if_exists='append'):
        """
        Upload shapefile to Supabase database (well_locations table)
        
        Maps shapefile columns to match existing well_locations schema:
        - gid (serial, auto-generated)
        - surface_id (float8)
        - symnum (int4)
        - api (varchar)
        - reliab (varchar)
        - long27, lat27, long83, lat83 (numeric)
        - wellid (varchar)
        - geom (geometry)
        
        Args:
            shapefile_path: Path to .shp file
            table_name: Name of the target table (default: well_locations)
            if_exists: 'append', 'replace', or 'fail'
        """
        try:
            logger.info(f"📄 Reading shapefile: {shapefile_path.name}")
            
            # Read shapefile with geopandas
            gdf = gpd.read_file(shapefile_path)
            
            print("\n" + "="*60)
            print(f"📊 SHAPEFILE CONTAINS {len(gdf)} RECORDS")
            print("="*60 + "\n")
            
            logger.info(f"Original columns: {list(gdf.columns)[:10]}...")
            
            # Ensure the geometry column is named 'geom' to match schema
            if gdf.geometry.name != 'geom':
                gdf = gdf.rename_geometry('geom')
            
            # Convert to EPSG:4326 (WGS84) if not already
            if gdf.crs != 'EPSG:4326':
                logger.info(f"Converting CRS from {gdf.crs} to EPSG:4326")
                gdf = gdf.to_crs('EPSG:4326')
            
            # Standardize column names (lowercase, replace spaces with underscores)
            gdf.columns = [col.lower().replace(' ', '_').replace('-', '_').replace('.', '_')
                          for col in gdf.columns]
            
            # Map common shapefile column names to your schema
            column_mapping = {
                'surface__i': 'surface_id',
                'surface_id': 'surface_id',
                'surfid': 'surface_id',
                'symnum': 'symnum',
                'api_numbe': 'api',
                'api_no': 'api',
                'api_num': 'api',
                'api': 'api',
                'reliabilit': 'reliab',
                'reliab': 'reliab',
                'long27': 'long27',
                'lon27': 'long27',
                'longitude27': 'long27',
                'lat27': 'lat27',
                'latitude27': 'lat27',
                'long83': 'long83',
                'lon83': 'long83',
                'longitude83': 'long83',
                'lat83': 'lat83',
                'latitude83': 'lat83',
                'well_id': 'wellid',
                'wellid': 'wellid',
                'well_numbe': 'wellid',
            }
            
            # Rename columns based on mapping
            mapped_count = 0
            for old_name, new_name in column_mapping.items():
                if old_name in gdf.columns:
                    gdf = gdf.rename(columns={old_name: new_name})
                    mapped_count += 1
            
            logger.info(f"Mapped {mapped_count} columns to schema")
            
            # Keep only columns that exist in the well_locations schema
            schema_columns = ['surface_id', 'symnum', 'api', 'reliab', 
                            'long27', 'lat27', 'long83', 'lat83', 'wellid', 'geom']
            
            # Filter to only existing columns
            existing_cols = [col for col in schema_columns if col in gdf.columns]
            gdf = gdf[existing_cols]
            
            # Filter out records with null wellid
            original_count = len(gdf)
            if 'wellid' in gdf.columns:
                gdf = gdf[gdf['wellid'].notna()]
                filtered_count = original_count - len(gdf)
                if filtered_count > 0:
                    logger.info(f"🗑️  Filtered out {filtered_count} records with null wellid")
            
            logger.info(f"Final columns for upload: {list(gdf.columns)}")
            logger.info(f"📤 Uploading {len(gdf)} records to {table_name}...")
            
            # Upload to PostGIS using geopandas
            gdf.to_postgis(
                name=table_name,
                con=self.engine,
                if_exists=if_exists,
                index=False,
                chunksize=1000
            )
            
            logger.info(f"✓ Successfully uploaded {len(gdf)} records from {shapefile_path.name}")
            return len(gdf)
            
        except Exception as e:
            logger.error(f"✗ Failed to upload {shapefile_path.name}: {e}")
            logger.exception("Detailed error:")
            return 0
    
    def process_all_files(self, download_urls=None, table_name='well_locations'):
        """
        Main process to download, extract, and upload all files
        
        IMPORTANT: This CLEARS all existing data in the table before uploading.
        Since you're uploading ALL counties each time, this prevents duplicates.
        
        Args:
            download_urls: List of tuples (county_name, url) or None to use manual list
            table_name: Target database table name
        """
        if not self.connect_to_database():
            logger.error("Cannot proceed without database connection")
            return
        
        total_records = 0
        processed_files = 0
        
        # If no URLs provided, use a manual list or scrape
        if not download_urls:
            # You can manually add URLs here or scrape them
            logger.info("No download URLs provided. Add URLs or implement scraping.")
            return
        
        # Check if table exists and truncate if it does
        table_exists = self._check_table_exists(table_name)
        
        if table_exists:
            logger.info(f"\n🗑️  Clearing all data from '{table_name}' table...")
            self._truncate_table(table_name)
            logger.info(f"✓ Table cleared, ready for fresh upload")
            
        for idx, (filename, url) in enumerate(download_urls, 1):
            try:
                print("\n" + "="*60)
                print(f"📁 FILE {idx}/{len(download_urls)}: {filename}")
                print("="*60)
                
                # Download (use actual filename from list)
                zip_path = self.download_file(url, filename)
                if not zip_path:
                    logger.warning(f"⚠️  Skipping {filename} - download failed")
                    continue
                
                # Extract
                extract_dir = self.extract_zip(zip_path)
                if not extract_dir:
                    logger.warning(f"⚠️  Skipping {filename} - extraction failed")
                    continue
                
                # Find shapefiles (surface locations only)
                shapefiles = self.find_shapefiles(extract_dir)
                
                if not shapefiles:
                    logger.warning(f"⚠️  No surface location shapefiles found in {filename}")
                    continue
                
                # Upload each shapefile
                for shapefile in shapefiles:
                    # Always append (table was truncated or will be created)
                    if_exists = 'append'
                    
                    records = self.upload_shapefile_to_db(
                        shapefile,
                        table_name=table_name,
                        if_exists=if_exists
                    )
                    
                    if records > 0:
                        total_records += records
                        processed_files += 1
                        logger.info(f"✓ {filename}: Added {records} records (Running total: {total_records:,})")
                    else:
                        logger.warning(f"⚠️  {filename}: No records uploaded")
                
            except Exception as e:
                logger.error(f"✗ Error processing {filename}: {e}")
                continue
        
        logger.info(f"\n{'='*60}")
        logger.info(f"Processing complete!")
        logger.info(f"Total files processed: {processed_files}")
        logger.info(f"Total records uploaded: {total_records}")
        logger.info(f"{'='*60}")
    
    def _check_table_exists(self, table_name):
        """Check if table exists and has data"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
                    f"WHERE table_name = '{table_name}');"
                ))
                exists = result.fetchone()[0]
                
                if exists:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name};"))
                    count = result.fetchone()[0]
                    logger.info(f"Table '{table_name}' exists with {count:,} records")
                    return True
                else:
                    logger.info(f"Table '{table_name}' does not exist yet (will be created)")
                    return False
        except:
            return False
    
    def _truncate_table(self, table_name):
        """Delete all data from table but keep the structure"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))
                conn.commit()
                logger.info(f"Truncated table '{table_name}'")
        except Exception as e:
            logger.error(f"Failed to truncate table: {e}")
            raise
    
    def process_local_files(self, directory, table_name='well_locations'):
        """
        Process already downloaded and extracted files
        
        IMPORTANT: This CLEARS all existing data in the table before uploading.
        
        Args:
            directory: Directory containing shapefiles
            table_name: Target database table name
        """
        if not self.connect_to_database():
            logger.error("Cannot proceed without database connection")
            return
        
        shapefiles = self.find_shapefiles(directory)
        total_records = 0
        
        # Check if table exists and truncate if it does
        table_exists = self._check_table_exists(table_name)
        
        if table_exists:
            logger.info(f"\n🗑️  Clearing all data from '{table_name}' table...")
            self._truncate_table(table_name)
            logger.info(f"✓ Table cleared, ready for fresh upload")
            
        for idx, shapefile in enumerate(shapefiles):
            # Always append (table was truncated or will be created)
            if_exists = 'append'
            
            records = self.upload_shapefile_to_db(
                shapefile,
                table_name=table_name,
                if_exists=if_exists
            )
            
            total_records += records
        
        logger.info(f"\nTotal records uploaded: {total_records}")
    
    def test_download_only(self, download_urls):
        """
        Test download and extraction functionality without uploading
        Useful for verifying downloads work before full processing
        
        Args:
            download_urls: List of tuples (filename, url)
        """
        logger.info("\n" + "="*60)
        logger.info("TESTING DOWNLOAD FUNCTIONALITY ONLY")
        logger.info("No database connection or upload will occur")
        logger.info("="*60)
        
        successful_downloads = 0
        failed_downloads = 0
        total_shapefiles = 0
        
        for idx, (filename, url) in enumerate(download_urls, 1):
            try:
                print("\n" + "="*60)
                print(f"📁 FILE {idx}/{len(download_urls)}: {filename}")
                print("="*60)
                
                # Download
                zip_path = self.download_file(url, filename)
                if not zip_path:
                    logger.warning(f"⚠️  Failed to download {filename}")
                    failed_downloads += 1
                    continue
                
                # Extract
                extract_dir = self.extract_zip(zip_path)
                if not extract_dir:
                    logger.warning(f"⚠️  Failed to extract {filename}")
                    failed_downloads += 1
                    continue
                
                # Find shapefiles
                shapefiles = self.find_shapefiles(extract_dir)
                
                if shapefiles:
                    logger.info(f"✓ {filename}: Successfully downloaded and extracted {len(shapefiles)} shapefile(s)")
                    successful_downloads += 1
                    total_shapefiles += len(shapefiles)
                    
                    # Show shapefile details
                    for shp in shapefiles:
                        gdf = gpd.read_file(shp)
                        logger.info(f"   - {shp.name}: {len(gdf)} records")
                else:
                    logger.warning(f"⚠️  {filename}: No surface location shapefiles found")
                    failed_downloads += 1
                
            except Exception as e:
                logger.error(f"✗ Error testing {filename}: {e}")
                failed_downloads += 1
        
        # Summary
        print("\n" + "="*60)
        print("DOWNLOAD TEST SUMMARY")
        print("="*60)
        print(f"✓ Successful: {successful_downloads}")
        print(f"✗ Failed: {failed_downloads}")
        print(f"📊 Total shapefiles found: {total_shapefiles}")
        print("="*60)
        
        if successful_downloads == len(download_urls):
            print("\n🎉 All downloads successful! Ready to run full upload.")
        elif successful_downloads > 0:
            print(f"\n⚠️  {successful_downloads}/{len(download_urls)} downloads successful.")
            print("   Check failed counties and URLs before proceeding.")
        else:
            print("\n❌ All downloads failed. Check URLs and network connectivity.")


def try_database_connection(user, password, host, ports, database):
    """
    Try connecting to database using multiple ports.
    Returns (connection_string, port) tuple if successful, (None, None) if all fail.
    """
    for port in ports:
        connection_string = (
            f"postgresql://{user}:{password}"
            f"@{host}:{port}/{database}"
        )
        logger.info(f"🔌 Trying to connect via port {port}...")
        
        try:
            # Test the connection
            engine = create_engine(connection_string)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info(f"✅ Successfully connected via port {port}!")
            return connection_string, port
        except Exception as e:
            logger.warning(f"⚠️  Port {port} failed: {str(e)}")
            continue
    
    logger.error(f"❌ Could not connect using any of the ports: {ports}")
    return None, None


def main():
    """Main execution function"""
    SUPABASE_HOST = "aws-1-us-east-1.pooler.supabase.com"
    SUPABASE_PORT = "5432"
    SUPABASE_DB = "postgres"
    SUPABASE_USER = "postgres.cybbfiogqisodsytxlnx"
    TABLE_NAME = "well_locations"
    DOWNLOAD_DIR = "./rrc_data"
    RRC_DOWNLOAD_PAGE = "https://mft.rrc.texas.gov/link/d551fb20-442e-4b67-84fa-ac3f23ecabb4"
    
    print("="*60)
    print("RRC Data Upload Tool - Browser Automation")
    print("="*60)
    print("\nSelect mode:")
    print("1. Download files with browser automation (test)")
    print("2. Download + Upload to database (full process)")
    print("3. Upload from already downloaded local files")
    
    mode = input("\nEnter mode (1/2/3): ").strip()
    
    files_to_download = None
    max_files = None
    
    if mode in ["1", "2"]:
        print("\n" + "="*60)
        print("How many files do you want to download?")
        print("="*60)
        file_count = input("Enter a number (e.g., 5) or 'all' for all files: ").strip().lower()
        
        if file_count == 'all':
            logger.info("Will download ALL files from the RRC website")
            max_files = None
        else:
            try:
                max_files = int(file_count)
                logger.info(f"Will download the first {max_files} files")
            except ValueError:
                logger.error("Invalid input. Please enter a number or 'all'")
                return
        
        # Show what will happen
        print("\n" + "="*60)
        if max_files:
            print(f"📋 PLAN: Download {max_files} file(s) from RRC website")
        else:
            print(f"📋 PLAN: Download ALL files from RRC website")
        print("="*60)
        input("Press Enter to continue or Ctrl+C to cancel...")
        print()
    
    if mode == "1":
        # Test browser download only
        logger.info("Mode 1: Testing browser automation download")
        uploader = RRCDataUploader(None, DOWNLOAD_DIR)
        
        # Clear download directory for fresh start
        uploader.clear_download_directory()
        
        # Download files using browser automation
        downloaded = uploader.download_files_with_browser(RRC_DOWNLOAD_PAGE, files_to_download, max_files)
        
        if downloaded:
            logger.info(f"\n✓ Successfully downloaded {len(downloaded)} files!")
            logger.info("Files are ready in: " + str(DOWNLOAD_DIR))
            
            # Extract and show shapefile info
            for zip_path in downloaded:
                extract_dir = uploader.extract_zip(zip_path)
                if extract_dir:
                    shapefiles = uploader.find_shapefiles(extract_dir)
                    logger.info(f"\n{zip_path.name}: Found {len(shapefiles)} shapefile(s)")
                    for shp in shapefiles:
                        try:
                            gdf = gpd.read_file(shp)
                            logger.info(f"  - {shp.name}: {len(gdf)} records")
                        except:
                            pass
        else:
            logger.error("No files were downloaded successfully")
        
    elif mode == "2":
        # Download with browser + upload to database
        logger.info("Mode 2: Download and upload to database")
        
        SUPABASE_PASSWORD = input("\nEnter Supabase database password: ").strip()
        if not SUPABASE_PASSWORD:
            logger.error("Password is required")
            return
        
        # Build connection string for session pooler
        connection_string = (
            f"postgresql://{SUPABASE_USER}:{SUPABASE_PASSWORD}"
            f"@{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DB}"
        )
        
        uploader = RRCDataUploader(connection_string, DOWNLOAD_DIR)
        
        # Clear download directory for fresh start
        uploader.clear_download_directory()
        
        # Download files
        logger.info("\n📥 Step 1: Downloading files with browser automation...")
        downloaded = uploader.download_files_with_browser(RRC_DOWNLOAD_PAGE, files_to_download, max_files)
        
        if not downloaded:
            logger.error("Failed to download files. Aborting.")
            return
        
        # Connect to database
        if not uploader.connect_to_database():
            logger.error("Failed to connect to database. Aborting.")
            return
        
        # Confirm before clearing table
        print(f"\n⚠️  WARNING: This will CLEAR the '{TABLE_NAME}' table before uploading!")
        confirm = input("Type 'yes' to proceed: ").strip().lower()
        if confirm != 'yes':
            logger.info("Upload cancelled")
            return
        
        # Clear table
        if uploader._check_table_exists(TABLE_NAME):
            uploader._truncate_table(TABLE_NAME)
        
        # Process each downloaded file
        logger.info("\n📤 Step 2: Uploading to database...")
        total_records = 0
        
        for zip_path in downloaded:
            try:
                # Extract
                extract_dir = uploader.extract_zip(zip_path)
                if not extract_dir:
                    continue
                
                # Find and upload shapefiles
                shapefiles = uploader.find_shapefiles(extract_dir)
                for shp in shapefiles:
                    records = uploader.upload_shapefile_to_db(shp, TABLE_NAME, 'append')
                    total_records += records
                    
            except Exception as e:
                logger.error(f"Error processing {zip_path.name}: {e}")
        
        logger.info(f"\n✓ Upload complete! Total records: {total_records:,}")
        
    elif mode == "3":
        # Process already downloaded/extracted local files
        logger.info("Mode 3: Upload from local files")
        
        LOCAL_FILES_DIR = input("\nEnter path to directory containing shapefiles (or press Enter for './rrc_data'): ").strip()
        if not LOCAL_FILES_DIR:
            LOCAL_FILES_DIR = "./rrc_data"
        
        SUPABASE_PASSWORD = input("Enter Supabase database password: ").strip()
        if not SUPABASE_PASSWORD:
            logger.error("Password is required")
            return
        
        # Build connection string for session pooler
        connection_string = (
            f"postgresql://{SUPABASE_USER}:{SUPABASE_PASSWORD}"
            f"@{SUPABASE_HOST}:{SUPABASE_PORT}/{SUPABASE_DB}"
        )
        
        uploader = RRCDataUploader(connection_string, DOWNLOAD_DIR)
        
        # Confirm before proceeding (table will be cleared!)
        print("\n⚠️  WARNING: This will CLEAR the existing table before uploading!")
        confirm = input("Type 'yes' to proceed: ").strip().lower()
        if confirm != 'yes':
            logger.info("Upload cancelled")
            return
        
        uploader.process_local_files(LOCAL_FILES_DIR, TABLE_NAME)
    
    else:
        logger.error("Invalid mode selected")
        return
    
    logger.info("\n✓ Script complete!")


if __name__ == "__main__":
    main()
