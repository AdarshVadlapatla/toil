import geopandas as gpd

shapefile_path = "/Downloads/well001"  # base shapefile name
wells = gpd.read_file(shapefile_path, layer="well001s")

print("Columns in shapefile:")
print(wells.columns)
print("\nFirst 10 records:")
print(wells.head(10))

output_csv = "file_path.csv"
wells.to_csv(output_csv, index=False)
print(f"All data exported to: {output_csv}")