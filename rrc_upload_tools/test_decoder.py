"""
Quick test script to validate EBCDIC decoding of .ebc files
This helps verify the decoder is working correctly before full upload
"""

import sys
from pathlib import Path

# Add parent directory to path to import the uploader
sys.path.append(str(Path(__file__).parent))

from upload_gas_production import GasProductionUploader, COMP3Decoder

def test_ebc_file(filepath):
    """
    Test decoding of an .ebc file and show detailed results
    
    Args:
        filepath: Path to .ebc file
    """
    print("=" * 70)
    print("EBCDIC .ebc File Decoder Test")
    print("=" * 70)
    print(f"\nFile: {filepath}")
    
    uploader = GasProductionUploader("", "./test_output")
    
    # Process the file
    records = uploader.process_ebc_file(Path(filepath))
    
    if not records:
        print("\n⚠️  No records decoded!")
        print("\nDebugging tips:")
        print("1. Verify the file is actually in EBCDIC format")
        print("2. Check if file has IBM tape labels (may need to skip bytes)")
        print("3. Verify record length is 2120 bytes")
        return
    
    print(f"\n✓ Successfully decoded {len(records):,} monthly production entries")
    
    # Show statistics
    unique_wells = len(set(r['well_no'] for r in records))
    print(f"\nUnique wells: {unique_wells:,}")
    
    # Show sample records
    print("\n" + "=" * 70)
    print("SAMPLE RECORDS (first 20)")
    print("=" * 70)
    print(f"{'Well No':<12} {'Year-Month':<12} {'Gas Production':<18} {'Status':<8}")
    print("-" * 70)
    
    for i, record in enumerate(records[:20], 1):
        well = record['well_no']
        date = record['year_month']
        gas = record['gas_production']
        status = record['well_type_month']
        
        print(f"{well:<12} {date:<12} {gas:>15,}   {status:<8}")
    
    if len(records) > 20:
        print(f"\n... and {len(records) - 20:,} more records")
    
    # Show records with production > 0
    with_production = [r for r in records if r['gas_production'] > 0]
    print(f"\n\nRecords with gas production > 0: {len(with_production):,}")
    
    if with_production:
        print("\nSample high production records:")
        print(f"{'Well No':<12} {'Year-Month':<12} {'Gas Production':<18} {'Status':<8}")
        print("-" * 70)
        
        # Sort by production and show top 10
        sorted_records = sorted(with_production, key=lambda x: x['gas_production'], reverse=True)
        for record in sorted_records[:10]:
            well = record['well_no']
            date = record['year_month']
            gas = record['gas_production']
            status = record['well_type_month']
            
            print(f"{well:<12} {date:<12} {gas:>15,}   {status:<8}")
    
    # Show well status distribution
    print("\n\nWell Status Distribution:")
    status_counts = {}
    for record in records:
        status = record['well_type_month'] if record['well_type_month'] else 'BLANK'
        status_counts[status] = status_counts.get(status, 0) + 1
    
    for status, count in sorted(status_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {status:<10}: {count:>8,} records")
    
    # Year/month distribution
    print("\n\nYear-Month Distribution:")
    date_counts = {}
    for record in records:
        ym = record['year_month'][:7] if record['year_month'] else 'INVALID'
        date_counts[ym] = date_counts.get(ym, 0) + 1
    
    for ym, count in sorted(date_counts.items())[:20]:
        print(f"  {ym}: {count:>8,} wells")
    
    print("\n" + "=" * 70)
    print("Test complete!")
    print("=" * 70)
    print("\nIf the data looks correct, you can proceed with uploading to Supabase")


def test_comp3_decoder():
    """
    Test COMP-3 decoding with known values
    """
    print("\n" + "=" * 70)
    print("Testing COMP-3 Decoder")
    print("=" * 70)
    
    # Test cases: (bytes, expected_value)
    test_cases = [
        (b'\x12\x3c', 123),          # Positive 123
        (b'\x12\x3d', -123),         # Negative 123
        (b'\x00\x01\x2c', 12),       # Positive 12 (with leading zero byte)
        (b'\x45\x67\x8c', 45678),    # Larger positive number
    ]
    
    print("\nTest cases:")
    for test_bytes, expected in test_cases:
        result = COMP3Decoder.decode(test_bytes)
        status = "✓" if result == expected else "✗"
        hex_str = ' '.join(f'{b:02x}' for b in test_bytes)
        print(f"{status} Bytes: {hex_str} => Expected: {expected:>8}, Got: {result:>8}")


if __name__ == "__main__":
    # Run COMP-3 tests first
    test_comp3_decoder()
    
    # Test .ebc file if provided
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        if Path(test_file).exists():
            print("\n")
            test_ebc_file(test_file)
        else:
            print(f"\n⚠️  File not found: {test_file}")
    else:
        print("\n" + "=" * 70)
        print("\nUsage: python test_decoder.py <path_to_ebc_file>")
        print("\nExample:")
        print("  python test_decoder.py ./sample.ebc")
        print("=" * 70)
