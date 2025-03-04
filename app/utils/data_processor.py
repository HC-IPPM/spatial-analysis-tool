import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import os
import json

def validate_coordinates(df):
    """Validate and identify coordinate columns in the dataframe."""
    possible_lat_cols = ['lat', 'latitude', 'ddlat', 'y']
    possible_lon_cols = ['lon', 'long', 'longitude', 'ddlong', 'x']

    lat_col = None
    lon_col = None

    for col in df.columns:
        col_lower = col.lower()
        if lat_col is None and any(lat in col_lower for lat in possible_lat_cols):
            if df[col].dtype in ['float64', 'float32']:
                if df[col].between(-90, 90).all():
                    lat_col = col

        if lon_col is None and any(lon in col_lower for lon in possible_lon_cols):
            if df[col].dtype in ['float64', 'float32']:
                if df[col].between(-180, 180).all():
                    lon_col = col

    return lat_col, lon_col

def validate_and_process_data(file_path):
    """Process uploaded file and return GeoDataFrame."""
    try:
        file_ext = os.path.splitext(file_path)[1].lower()

        if file_ext == '.csv':
            df = pd.read_csv(file_path)
            lat_col, lon_col = validate_coordinates(df)

            if lat_col is None or lon_col is None:
                raise ValueError("Could not identify valid coordinate columns in CSV")

            geometry = [Point(xy) for xy in zip(df[lon_col], df[lat_col])]
            return gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")

        elif file_ext == '.geojson':
            try:
                # First try using geopandas
                gdf = gpd.read_file(file_path)

                # Validate geometry types
                if not all(geom.geom_type == 'Point' for geom in gdf.geometry):
                    raise ValueError("GeoJSON file contains non-point geometries")

                # Ensure CRS is set
                if gdf.crs is None:
                    gdf.set_crs("EPSG:4326", inplace=True)
                return gdf

            except Exception as e:
                # If geopandas fails, try manual JSON parsing
                with open(file_path, 'r') as f:
                    geojson_data = json.load(f)

                if geojson_data['type'] != 'FeatureCollection':
                    raise ValueError("Invalid GeoJSON: Must be a FeatureCollection")

                features = geojson_data['features']
                if not features:
                    raise ValueError("GeoJSON file contains no features")

                if any(f['geometry']['type'] != 'Point' for f in features):
                    raise ValueError("GeoJSON file contains non-point geometries")

                # Create GeoDataFrame from valid GeoJSON
                return gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")

        else:
            raise ValueError(f"Unsupported file format: {file_ext}")

    except Exception as e:
        print(f"Error processing file: {str(e)}")
        return None
