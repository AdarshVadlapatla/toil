# Gas Production Data Upload Tool

This tool downloads EBCDIC-encoded .ebc files from the Texas Railroad Commission (RRC) containing gas well production data, decodes them, and uploads the data to a Supabase PostgreSQL database.

## Overview

The RRC distributes historical gas production data in mainframe format:
- **Format**: EBCDIC encoding (IBM EBCDIC cp500)
- **File type**: `.ebc` files
- **Record layout**: COBOL-style fixed-width records
- **Record length**: 2120 bytes per record
- **Record types**: 
  - Type 1: Field records (gas field information)
  - Type 5: Well records (individual well production data)

## What This Script Does

1. **Downloads** `.ebc` files from the RRC website using browser automation
2. **Decodes** EBCDIC-encoded bytes to readable ASCII
3. **Parses** COMP-3 packed decimal fields (mainframe numeric format)
4. **Extracts** monthly production data for each well:
   - Well number (`WELL-NO`)
   - Year/Month (`W-DATE`)
   - Monthly gas production in MCF (`GAS-PRD`)
   - Well status/type for the month (`W-TYPE-MO`)
5. **Uploads** to Supabase PostgreSQL database

## Data Fields Extracted

Based on the COBOL record layout from the RRC manual:

| Field Name | Position | Type | Description |
|------------|----------|------|-------------|
| `WELL-NO` | 26-31 | EBCDIC | Well identifier (tract + number + suffix) |
| `W-DATE` | 317+ (monthly) | EBCDIC | Year-month (CCYYMM format) |
| `GAS-PRD` | 353 offset | COMP-3 | Monthly gas production (MCF) |
| `W-TYPE-MO` | 337 offset | EBCDIC | Well status for month |

Each well record contains 14 monthly entries.

## Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

Required packages:
- `sqlalchemy` - Database ORM
- `psycopg2-binary` - PostgreSQL adapter
- `requests` - HTTP library
- `selenium` - Browser automation
- `webdriver-manager` - Chrome driver management

## Database Schema

The script creates a `gas_production` table with the following schema:

```sql
CREATE TABLE gas_production (
    id SERIAL PRIMARY KEY,
    well_no VARCHAR(10) NOT NULL,
    year_month DATE NOT NULL,
    gas_production BIGINT,
    well_type_month VARCHAR(5),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_well_no ON gas_production(well_no);
CREATE INDEX idx_year_month ON gas_production(year_month);
```

## Usage

### Mode 1: Test Decoder (No Database)

Test the EBCDIC decoder with a local .ebc file to verify it's working correctly:

```bash
python upload_gas_production.py
# Select mode: 1
# Enter path to .ebc file: ./sample.ebc
```

Or use the dedicated test script:

```bash
python test_decoder.py ./path/to/file.ebc
```

This will:
- Decode the file
- Show sample records
- Display statistics (wells, production, date ranges)
- Help verify the decoder is working before uploading

### Mode 2: Download and Upload

Download .ebc files from RRC and upload to Supabase:

```bash
python upload_gas_production.py
# Select mode: 2
# Enter Supabase password: [your-password]
# Choose: Download all files or specific files
```

**⚠️ WARNING**: This mode clears the existing table before uploading!

### Mode 3: Process Local Files

Process already downloaded .ebc files:

```bash
python upload_gas_production.py
# Select mode: 3
# Enter path to .ebc file: ./gas_production_data/dbf001.ebc
# Enter Supabase password: [your-password]
```

## Configuration

Update these variables in `upload_gas_production.py`:

```python
SUPABASE_HOST = "aws-0-us-west-1.pooler.supabase.com"
SUPABASE_PORT = "6543"
SUPABASE_DB = "postgres"
SUPABASE_USER = "postgres.mfbpxbawqrxuvqwsebgs"
TABLE_NAME = "gas_production"
RRC_DOWNLOAD_PAGE = "https://mft.rrc.texas.gov/link/c45ee840-9d50-4a74-b6b0-dba0cb4954b7"
```

## Understanding EBCDIC and COMP-3 Encoding

### EBCDIC (Extended Binary Coded Decimal Interchange Code)
- Mainframe character encoding (IBM standard)
- Different from ASCII - requires conversion
- We use `cp500` codec (IBM EBCDIC Latin-1)

### COMP-3 (Packed Decimal)
- Compact numeric storage format
- Two decimal digits per byte
- Last nibble contains sign (+/-/unsigned)
- Example: `\x12\x3c` = +123

The script includes a `COMP3Decoder` class that handles this conversion automatically.

## File Structure

```
rrc_upload_tools/
├── upload_gas_production.py  # Main script
├── test_decoder.py           # Testing utility (optional)
├── requirements.txt          # Python dependencies
└── README_GAS.md            # This file
```

## Quick Start

1. **Test with a sample file first**:
   ```bash
   python test_decoder.py C:\path\to\gsf001l.ebc
   ```

2. **Verify the output looks correct**:
   - Check well numbers (e.g., `1H`, `20H`, `71H`)
   - Verify dates are reasonable (14 months of data per well)
   - Review production values (MCF per month)
   - Check status codes (K, H, J, A, etc.)

3. **Upload to database**:
   ```bash
   python upload_gas_production.py
   # Select Mode 3 for local file
   ```

## Expected Results

Based on testing with `gsf001l.ebc` (Districts 1, 2, 3):
- **File size**: ~87 MB (86,777,960 bytes)
- **Total records**: 40,933 (18,303 field + 22,630 well records)
- **Monthly entries**: ~316,000 (from 3,596 unique wells × 14 months)
- **Active production**: ~46% of records have production > 0
- **Processing time**: < 5 seconds for decoding
- **Top wells**: 600K-750K MCF/month

## Well Status Codes

Common status codes you'll see in `W-TYPE-MO`:
- **K**: Shut-in (not currently producing)
- **H**: Producing (active)
- **J**: New well
- **A**: Active
- **R**: Regulatory action
- **Z**: Abandoned
- **S**: Special status
- **I**: Injection well
- **(blank)**: Status not reported

## Troubleshooting

### Issue: No records decoded

**Possible causes:**
1. File might have IBM tape labels (240 bytes at start)
2. Wrong record type identifier
3. File corrupted or not in EBCDIC format

**Solution:**
- Use test mode (Mode 1) to inspect the file
- Check file size is multiple of 2120 bytes
- Verify first byte is `\xf1` (EBCDIC '1') or `\xf5` (EBCDIC '5') for field/well records
- The script automatically handles EBCDIC-encoded record type markers

### Issue: Wrong dates or production values

**Possible causes:**
1. COMP-3 decoding offset incorrect
2. Date format not CCYYMM
3. Monthly record size calculation wrong

**Solution:**
- Check the COBOL layout positions match your file version
- Use `test_decoder.py` to see raw decoded values
- Verify against RRC manual for your specific file version

### Issue: Database connection failed

**Possible causes:**
1. Wrong password
2. Network/firewall blocking connection
3. Supabase pooler not accessible

**Solution:**
- Verify connection string details
- Test connection with `psql` or another PostgreSQL client
- Check Supabase dashboard for database status

## Performance

- **Processing speed**: ~10,000-50,000 records/second (depends on system)
- **Upload batch size**: 5,000 records per transaction
- **Typical file size**: 50-500 MB per .ebc file
- **Expected output**: 100,000s to millions of monthly production entries

## Data Quality Notes

1. **Zero production**: Many records have `gas_production = 0` (well not producing that month) - this is normal
2. **Well status codes**: Single letter codes indicating well state (see Well Status Codes section above)
3. **Date validation**: Script filters invalid dates (month 1-12, year 1900-2100)
4. **Missing data**: Some fields may be blank/null - represented as empty strings or 0
5. **14-month windows**: Each well record contains 14 months of historical data (rolling window)
6. **EBCDIC encoding**: All text fields are converted from EBCDIC cp500 to ASCII/UTF-8
7. **COMP-3 numbers**: Packed decimal values are automatically decoded to integers

## Next Steps / Future Enhancements

You mentioned wanting to add more columns later. Here are fields readily available in the record:

- `ALLOW` (Position 349): Well allowable production
- `INJ-CREDIT` (Position 357): Injection credit
- `W-LIQ-ALLOW` (Position 362): Liquid allowable
- `LSE-LIQ` (Position 365): Lease liquid production
- `MO-BHP` (Position 386): Monthly bottom hole pressure

To add these, update:
1. `parse_well_record()` method - add extraction logic
2. `create_production_table()` - add columns to schema
3. `upload_to_database()` - include in INSERT statement

## References

- RRC File Transfer Site: https://mft.rrc.texas.gov/
- Gas production files: https://mft.rrc.texas.gov/link/c45ee840-9d50-4a74-b6b0-dba0cb4954b7
- EBCDIC Reference: IBM cp500 (EBCDIC Latin-1)
- COMP-3 Format: IBM packed decimal format

## License

This tool is for data processing purposes. Gas production data is public domain from the Texas Railroad Commission.
