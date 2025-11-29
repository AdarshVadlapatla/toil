# RRC Well Location Data Upload Tools

Upload Texas Railroad Commission well data to Supabase `well_locations` table.

## Files

- `upload_loc_data.py` - Main script with 3 modes (download test, download+upload, upload local files)
- `requirements.txt` - Dependencies

## Quick Start

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the script**
   ```bash
   python upload_rrc_data.py
   ```
   
3. **Select a mode:**
   - **Mode 1**: Download files (test browser automation)
   - **Mode 2**: Download + Upload to database
   - **Mode 3**: Upload from already downloaded files

## Important Notes

- **Shapefile types**: Each county has 3 files - only `*s.shp` (surface locations) are uploaded. Scripts auto-filter.
- **Duplicates**: Script automatically clears table before upload (TRUNCATE), so running multiple times is safe.
- **Null wellid**: Records with null `wellid` are automatically filtered out before upload.
- **Session Pooler**: Uses IPv4-compatible session pooler for reliable connectivity.

## Configuration

Edit `upload_rrc_data.py` if needed:
```python
SUPABASE_HOST = "aws-1-us-east-1.pooler.supabase.com"  # Session pooler
SUPABASE_USER = "postgres.cybbfiogqisodsytxlnx"
TABLE_NAME = "well_locations"
```
