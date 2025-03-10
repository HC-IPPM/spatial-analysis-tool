from flask import Flask, render_template, request, jsonify, send_file, session, g
from flask_cors import CORS
import os
import logging
import pandas as pd
import geopandas as gpd
from app.utils.data_processor import validate_and_process_data
from app.utils.map_utils import create_base_map, add_points_to_map, add_boundary_to_map, prepare_geodataframe
from app.utils.language_controller import init_language_controller
import json
import traceback
from app.utils.spatial_analysis import generate_heatmap, calculate_local_morans_i, generate_h3_hexagons, perform_constrained_clustering, perform_kmeans
from sklearn.cluster import KMeans

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
app.secret_key = os.urandom(24)

# Initialize language controller
language_controller = init_language_controller(app)

# Configure upload folder
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
STATIC_FOLDER = os.path.join(os.path.dirname(__file__), 'static')

# Create necessary directories
for folder in [UPLOAD_FOLDER, STATIC_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)
        logger.info(f"Created directory: {folder}")

@app.route('/')
def index():
    """Render the main application page."""
    try:
        # Get accessibility preferences from session
        high_contrast = session.get('high_contrast', False)

        return render_template('index.html',
                             translations=g.translations,
                             high_contrast=high_contrast)
    except Exception as e:
        logger.error(f"Error loading index page: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/get-points')
def get_points():
    """Return current points data as GeoJSON."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({"type": "FeatureCollection", "features": []})

        # Convert points to GeoJSON
        points_geojson = json.loads(app.current_points.to_json())
        return jsonify(points_geojson)
    except Exception as e:
        logger.error(f"Error getting points data: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/points', methods=['POST'])
def upload_points():
    """Handle point data file upload."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        # Save file temporarily
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)

        # Process the file
        points_data = validate_and_process_data(temp_path)
        if points_data is None:
            os.remove(temp_path)
            return jsonify({'error': 'Invalid point data format'}), 400

        # Store current points in app context
        app.current_points = points_data

        # Clean up temp file
        os.remove(temp_path)

        return jsonify({
            'success': True,
            'message': 'Points data processed successfully'
        })
    except Exception as e:
        logger.error(f"Error processing points file: {str(e)}\n{traceback.format_exc()}")
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-boundary')
def get_boundary():
    """Return current boundary data as GeoJSON."""
    try:
        if not hasattr(app, 'current_boundary'):
            return jsonify({"type": "FeatureCollection", "features": []})

        # Prepare and convert boundary to GeoJSON
        processed_gdf = prepare_geodataframe(app.current_boundary)
        boundary_geojson = json.loads(processed_gdf.to_json())
        return jsonify(boundary_geojson)
    except Exception as e:
        logger.error(f"Error getting boundary data: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/boundary', methods=['POST'])
def upload_boundary():
    """Handle boundary file upload."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        # Save file temporarily
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)

        # Read boundary file
        boundary_data = gpd.read_file(temp_path)

        # Store current boundary in app context
        app.current_boundary = boundary_data

        # Clean up temp file
        os.remove(temp_path)

        return jsonify({
            'success': True,
            'message': 'Boundary data processed successfully'
        })
    except Exception as e:
        logger.error(f"Error processing boundary file: {str(e)}\n{traceback.format_exc()}")
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/heatmap', methods=['POST'])
def create_heatmap():
    """Generate heatmap from points data."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({'error': 'No point data available'}), 400

        # Generate heatmap data
        heatmap_data = generate_heatmap(app.current_points)

        return jsonify({
            'success': True,
            'data': heatmap_data
        })
    except Exception as e:
        logger.error(f"Error generating heatmap: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/morans', methods=['POST'])
def create_morans():
    """Generate Local Moran's I analysis from points and boundary data."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({'error': 'No point data available'}), 400

        if not hasattr(app, 'current_boundary'):
            return jsonify({'error': 'No boundary data available'}), 400

        # Get analysis parameters from request
        if not request.json:
            request_data = {}
        else:
            request_data = request.json

        analysis_type = request_data.get('analysis_type', 'count')
        weight_column = request_data.get('weight_column') if analysis_type == 'weighted' else None

        # Calculate Local Moran's I
        results = calculate_local_morans_i(
            app.current_points,
            app.current_boundary,
            weight_column
        )

        # Convert to GeoJSON
        results_json = json.loads(results.to_json())

        # Add styling information to features and ensure numerical values are valid
        for feature, row in zip(results_json['features'], results.itertuples()):
            feature['properties']['style'] = {
                'fillColor': row.color if hasattr(row, 'color') else '#808080',
                'color': row.color if hasattr(row, 'color') else '#808080',
                'weight': 1,
                'fillOpacity': 0.7
            }
            feature['properties']['cluster_type'] = row.cluster_type
            # Ensure numerical values are valid
            feature['properties']['z_score'] = float(row.z_score) if not pd.isna(row.z_score) else 0.0
            feature['properties']['p_value'] = float(row.p_value) if not pd.isna(row.p_value) else 1.0
            # Add weight sum if using weighted analysis
            if weight_column:
                feature['properties']['weight'] = float(row.count) if not pd.isna(row.count) else 0.0

        return jsonify({
            'success': True,
            'data': results_json
        })
    except Exception as e:
        logger.error(f"Error generating Local Moran's I: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

def perform_kmeans(points_data, n_clusters):
    """Performs K-means clustering on the given points data."""
    try:
        # Extract coordinates for clustering
        coords = points_data[['geometry']].copy()
        coords['x'] = coords['geometry'].x
        coords['y'] = coords['geometry'].y
        coords = coords[['x', 'y']].values

        # Perform K-means clustering
        kmeans = KMeans(n_clusters=n_clusters, random_state=0)
        labels = kmeans.fit_predict(coords)

        # Add cluster labels to the points data
        points_data['cluster'] = labels

        # Calculate cluster statistics (example: centroid coordinates)
        cluster_stats = points_data.groupby('cluster')['geometry'].agg(['centroid'])
        cluster_stats = cluster_stats.reset_index()
        cluster_stats = cluster_stats.rename(columns={'centroid': 'centroid_coordinates'})
        cluster_stats['centroid_coordinates'] = cluster_stats['centroid_coordinates'].apply(lambda x: {'type':'Point', 'coordinates': [x.x, x.y]})

        return json.loads(cluster_stats.to_json(orient='records')), json.loads(points_data.to_json(orient='records'))

    except Exception as e:
        print(f"Error during K-means clustering: {e}")
        return None, None

@app.route('/api/analysis/kmeans', methods=['POST'])
def create_kmeans():
    """Generate K-means clustering from points data."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({'error': 'No point data available'}), 400

        # Get number of clusters from request
        n_clusters = request.json.get('n_clusters', 5)

        # Validate n_clusters
        n_clusters = max(2, min(10, int(n_clusters)))

        # Perform K-means clustering
        from app.utils.spatial_analysis import perform_kmeans
        cluster_stats, points_data = perform_kmeans(app.current_points, n_clusters)

        if not cluster_stats:
            return jsonify({'error': 'Failed to generate clusters'}), 500

        return jsonify({
            'success': True,
            'data': {
                'clusters': cluster_stats,
                'points': points_data
            }
        })
    except Exception as e:
        logger.error(f"Error generating K-means clustering: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/h3-hexagons', methods=['POST'])
def create_h3_hexagons():
    """Generate H3 hexagonal grid from points data."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({'error': 'No point data available'}), 400

        # Get resolution from request
        resolution = request.json.get('resolution', 8)
        resolution = max(6, min(10, int(resolution)))  # Limit resolution range

        # Generate hexagons
        hex_gdf = generate_h3_hexagons(app.current_points, resolution)

        # Convert to GeoJSON
        hex_geojson = json.loads(hex_gdf.to_json())

        # Add styling information
        max_count = hex_gdf['point_count'].max()
        for feature in hex_geojson['features']:
            count = feature['properties']['point_count']
            opacity = min(0.8, max(0.2, count / max_count))
            feature['properties']['style'] = {
                'fillColor': '#1f77b4',
                'color': '#1f77b4',
                'weight': 1,
                'fillOpacity': opacity
            }

        return jsonify({
            'success': True,
            'data': hex_geojson
        })
    except Exception as e:
        logger.error(f"Error generating H3 hexagons: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/constrained-clustering', methods=['POST'])
def create_constrained_clusters():
    """Generate spatially constrained clusters from hexagon grid."""
    try:
        if not hasattr(app, 'current_points'):
            return jsonify({'error': 'No point data available'}), 400

        # Get parameters from request
        resolution = request.json.get('resolution', 8)
        n_clusters = request.json.get('n_clusters', 5)
        use_weights = request.json.get('use_weights', False)

        # Generate hexagons
        hex_gdf = generate_h3_hexagons(app.current_points, resolution)

        # Perform constrained clustering
        clustered_gdf = perform_constrained_clustering(hex_gdf, n_clusters, use_weights)

        # Convert to GeoJSON
        cluster_geojson = json.loads(clustered_gdf.to_json())

        # Add styling information
        colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
                 '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']

        for feature in cluster_geojson['features']:
            cluster = feature['properties']['cluster']
            feature['properties']['style'] = {
                'fillColor': colors[cluster % len(colors)],
                'color': colors[cluster % len(colors)],
                'weight': 1,
                'fillOpacity': 0.6
            }

        return jsonify({
            'success': True,
            'data': cluster_geojson
        })
    except Exception as e:
        logger.error(f"Error generating constrained clusters: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/accessibility')
def accessibility():
    """Render the accessibility statement page."""
    try:
        # Return the appropriate language version of the accessibility page
        template_name = 'accessibility_fr.html' if g.language == 'fr' else 'accessibility.html'
        return render_template(template_name, translations=g.translations)
    except Exception as e:
        logger.error(f"Error loading accessibility page: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/preferences/accessibility', methods=['POST'])
def update_accessibility():
    """Update accessibility preferences."""
    try:
        data = request.json
        high_contrast = data.get('high_contrast', False)
        session['high_contrast'] = high_contrast
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating accessibility preferences: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/language', methods=['POST'])
def change_language():
    """Handle language change requests."""
    try:
        data = request.get_json()
        if language_controller.set_language(data.get('language')):
            return jsonify({'status': 'success'})
        return jsonify({'status': 'error', 'message': 'Invalid language'}), 400
    except Exception as e:
        logger.error(f"Error changing language: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    try:
        logger.info("Starting Flask application on port 5000...")
        app.run(host='0.0.0.0', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Failed to start Flask application: {str(e)}\n{traceback.format_exc()}")
        raise