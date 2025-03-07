// Add state tracking variables
let isochroneGenerationInProgress = false;
let pendingIsochrones = 0;

// Add field aliases mapping
let fieldAliases = new Map();

// Initialize map with HTTPS tiles
const map = L.map('map').setView([45.4215, -75.6972], 13);

// Define base layers
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

const esriTopoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
});

// Add the default layer
osmLayer.addTo(map);

// Create layer control
const baseMaps = {
    "OpenStreetMap": osmLayer,
    "ESRI Topographic": esriTopoLayer
};

// Initialize buffer layer group and add to map
let bufferLayer = L.featureGroup().addTo(map);

// Add layer control to map
L.control.layers(baseMaps, null, {
    position: 'topright'
}).addTo(map);

// Global variables for table management
let tableData = [];
let currentPage = 1;
const rowsPerPage = 10;
let currentSortColumn = null;
let currentSortDirection = 'asc';
let selectedAttributes = new Set();
let pointCounter = 0;
let isAllAttributesSelected = true;

// Add processing status tracking variables
let processingStats = {
    totalPoints: 0,
    successfulPoints: 0,
    failedPoints: 0,
    startTime: null,
    endTime: null,
    processingErrors: []
};

// Function to get selected statistical measures
function getSelectedMeasures() {
    const measures = {};
    document.querySelectorAll('.stats-measures input[type="checkbox"]').forEach(checkbox => {
        measures[checkbox.value] = checkbox.checked;
    });
    return measures;
}

// Update calculateStats to add more logging
function calculateStats(features, field) {
    console.log(`Calculating stats for field ${field} with ${features.length} features`);

    const values = features
        .map(f => f.properties[field])
        .filter(v => v != null && !isNaN(v))
        .map(v => parseFloat(v));

    console.log(`Found ${values.length} valid numeric values for field ${field}`);

    if (values.length === 0) return null;

    const selectedMeasures = getSelectedMeasures();
    const stats = {};

    // Only calculate selected measures
    if (selectedMeasures.count) {
        stats.count = values.length;
    }

    if (selectedMeasures.mean) {
        const sum = values.reduce((a, b) => a + b, 0);
        stats.mean = (sum / values.length).toFixed(2);
    }

    if (selectedMeasures.median) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        stats.median = sorted.length % 2 === 0
            ? ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)
            : sorted[mid].toFixed(2);
    }

    if (selectedMeasures.min) {
        stats.min = Math.min(...values).toFixed(2);
    }

    if (selectedMeasures.max) {
        stats.max = Math.max(...values).toFixed(2);
    }

    if (selectedMeasures.stdDev) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
        stats.stdDev = Math.sqrt(variance).toFixed(2);
    }

    console.log(`Calculated stats for field ${field}:`, stats);
    return stats;
}

// Update addRowToTable to only include selected measures
function addRowToTable(stats, dimension) {
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;
    const distanceOrTime = isIsochrone
        ? parseInt(document.getElementById('isochroneTime').value) * 60
        : parseFloat(document.getElementById('bufferDistance').value);

    const selectedMeasures = getSelectedMeasures();
    const row = {
        id: `Point_${stats.pointId}`,
        point_id: stats.pointId,
        original_id: stats.original_id || 'undefined',
        isIsochrone: isIsochrone,
        distance_or_time: distanceOrTime,
        coordinates: stats.coordinates,
        ...(selectedMeasures.count && stats.count !== undefined && {count: stats.count}),
        ...(selectedMeasures.mean && stats.mean !== undefined && {mean: stats.mean}),
        ...(selectedMeasures.median && stats.median !== undefined && {median: stats.median}),
        ...(selectedMeasures.min && stats.min !== undefined && {min: stats.min}),
        ...(selectedMeasures.max && stats.max !== undefined && {max: stats.max}),
        ...(selectedMeasures.stdDev && stats.stdDev !== undefined && {stdDev: stats.stdDev}),
        dimension: dimension
    };

    tableData.push(row);
    updateTable();
}

// Update updateTable to reflect selected measures
function updateTable() {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = tableData.slice(startIndex, endIndex);
    const selectedMeasures = getSelectedMeasures();
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;
    const distanceHeader = isIsochrone ? 'Service Area (seconds)' : 'Buffer (km)';

    // Update table headers based on selected measures
    const thead = document.querySelector('#stats-table thead tr');
    thead.innerHTML = `
        <th>Point ID <span class="sort-icon">↕</span></th>
        <th>${distanceHeader} <span class="sort-icon">↕</span></th>
        ${selectedMeasures.count ? '<th>Count <span class="sort-icon">↕</span></th>' : ''}
        ${selectedMeasures.mean ? '<th>Mean <span class="sort-icon">↕</span></th>' : ''}
        ${selectedMeasures.median ? '<th>Median <span class="sort-icon">↕</span></th>' : ''}
        ${selectedMeasures.min ? '<th>Min <span class="sort-icon">↕</span></th>' : ''}
        ${selectedMeasures.max ? '<th>Max <span class="sort-icon">↕</span></th>' : ''}
        ${selectedMeasures.stdDev ? '<th>Standard Deviation <span class="sort-icon">↕</span></th>' : ''}
        <th>Dimension</th>
    `;

    // Add click handlers for sorting
    thead.querySelectorAll('th').forEach((header, index) => {
        if (header.textContent !== 'Dimension') {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => sortTable(index));
        }
    });

    const tbody = document.querySelector('#stats-table tbody');
    tbody.innerHTML = '';

    pageData.forEach(row => {
        const cells = [
            `<td>${row.point_id}</td>`,
            `<td>${row.distance_or_time}</td>`
        ];

        if (selectedMeasures.count) cells.push(`<td>${row.count || ''}</td>`);
        if (selectedMeasures.mean) cells.push(`<td>${row.mean || ''}</td>`);
        if (selectedMeasures.median) cells.push(`<td>${row.median || ''}</td>`);
        if (selectedMeasures.min) cells.push(`<td>${row.min || ''}</td>`);
        if (selectedMeasures.max) cells.push(`<td>${row.max || ''}</td>`);
        if (selectedMeasures.stdDev) cells.push(`<td>${row.stdDev || ''}</td>`);

        cells.push(`<td>${row.dimension}</td>`);

        const tr = document.createElement('tr');
        tr.innerHTML = cells.join('');
        tbody.appendChild(tr);
    });

    updatePagination();
}

// Add sorting functionality
function sortTable(columnIndex) {
    const headers = ['point_id', 'distance_or_time', 'count', 'mean', 'median', 'min', 'max', 'stdDev', 'dimension'];
    const column = headers[columnIndex];

    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    tableData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Convert to numbers for numeric columns
        if (column !== 'dimension') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        }

        return currentSortDirection === 'asc' ?
            (aVal > bVal ? 1 : -1) :
            (bVal > aVal ? 1 : -1);
    });

    updateTable();
}


// Initialize event listeners
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Bootstrap tooltips with accessibility options
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl, {
        trigger: 'hover focus', // Enable both hover and focus triggers
        html: true,
        animation: true,
        delay: {show: 100, hide: 300}, // Give users time to move cursor to tooltip
        container: 'body'
    }));

    // Add keyboard event listeners for tooltip dismissal
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            tooltipList.forEach(tooltip => tooltip.hide());
        }
    });

    initializeEventListeners();
    populateAttributeSelect();

    // Validate isochrone service availability
    const isochroneAvailable = await validateIsochroneService();
    if (!isochroneAvailable) {
        console.warn('Isochrone service is not available');
        // Optionally disable the isochrone radio button
        const isochroneRadio = document.getElementById('isochroneAnalysis');
        if (isochroneRadio) {
            isochroneRadio.disabled = true;
            isochroneRadio.nextElementSibling.textContent += ' (Service Unavailable)';
        }
    }
});

function initializeEventListeners() {
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('bufferSlider').addEventListener('input', handleBufferSliderChange);
    document.getElementById('bufferDistance').addEventListener('input', handleBufferDistanceInput);
    document.getElementById('opacitySlider').addEventListener('input', handleOpacityChange);
    document.getElementById('run-analysis').addEventListener('click', runAnalysis);
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    document.getElementById('export-geojson-btn').addEventListener('click', exportToGeoJSON); // Added GeoJSON export button handler
    document.getElementById('clear-table').addEventListener('click', clearTable);
    document.getElementById('featureServiceDropdown').addEventListener('change', handleFeatureServiceChange);
    document.getElementById('toggleAllAttributes').addEventListener('click', toggleAllAttributes);
    document.getElementById('validateUrl').addEventListener('click', validateCustomUrl);

    // Add listeners for statistical measure checkboxes
    document.querySelectorAll('.stats-measures input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (tableData.length > 0) {
                updateTable();
            }
        });
    });

    // Add these event listeners from edited code
    document.getElementById('bufferAnalysis').addEventListener('change', toggleAnalysisType);
    document.getElementById('isochroneAnalysis').addEventListener('change', toggleAnalysisType);
    document.getElementById('isochroneTime').addEventListener('input', handleIsochroneTimeInput);
    document.getElementById('isochroneSlider').addEventListener('input', handleIsochroneSliderChange);
}

function handleFeatureServiceChange(event) {
    const customUrlInput = document.getElementById('customUrlInput');
    const dropdown = event.target;

    if (dropdown.value === 'custom') {
        customUrlInput.classList.remove('d-none');
    } else {
        customUrlInput.classList.add('d-none');
        populateAttributeSelect(dropdown.value);
    }
}

function validateCustomUrl() {
    const urlInput = document.getElementById('customFeatureServiceUrl');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a URL');
        return;
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL');
        return;
    }

    console.log('Validating FeatureService URL:', url);

    // Test if it's a valid ESRI FeatureService using L.esri.request
    L.esri.request(url, {}, function(error, response) {
        if (error) {
            console.error('Error validating FeatureService:', error);
            alert('Invalid FeatureService URL. Please ensure the URL points to a valid ESRI FeatureService or MapServer layer.');
            return;
        }

        console.log('Successfully validated URL:', response);
        // URL is valid, update dropdown and populate attributes
        const dropdown = document.getElementById('featureServiceDropdown');
        const option = new Option(url, url);
        dropdown.add(option);
        dropdown.value = url;
        populateAttributeSelect(url);
    });
}

// Update populateAttributeSelect to handle numeric fields and aliases correctly
async function populateAttributeSelect(serviceUrl) {
    console.log('Populating attribute select...');
    const container = document.createElement('div');
    container.className = 'attribute-checkboxes';

    if (!serviceUrl) {
        serviceUrl = document.getElementById('featureServiceDropdown').value;
    }
    console.log('Using service URL:', serviceUrl);

    try {
        // Use L.esri.request to fetch metadata
        const metadata = await new Promise((resolve, reject) => {
            L.esri.request(serviceUrl, {}, function(error, response) {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            });
        });

        console.log('Metadata received:', metadata);

        // Clear existing checkboxes and aliases
        container.innerHTML = '';
        selectedAttributes.clear();
        fieldAliases.clear();

        // Filter for numeric fields (excluding OBJECTID)
        const numericFields = metadata.fields.filter(field =>
            (field.type === 'esriFieldTypeDouble' ||
                field.type === 'esriFieldTypeInteger' ||
                field.type === 'esriFieldTypeSingle') &&
            field.name !== 'OBJECTID'
        );

        console.log('Numeric fields found:', numericFields);

        numericFields.forEach(field => {
            // Store field alias
            fieldAliases.set(field.name, field.alias || field.name);

            const div = document.createElement('div');
            div.className = 'form-check';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `attr-${field.name}`;
            checkbox.className = 'form-check-input';
            checkbox.value = field.name;
            checkbox.checked = isAllAttributesSelected;

            if (checkbox.checked) {
                selectedAttributes.add(field.name);
            }

            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = `attr-${field.name}`;
            label.textContent = field.alias || field.name;

            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    selectedAttributes.add(this.value);
                } else {
                    selectedAttributes.delete(this.value);
                }
                console.log('Selected attributes:', Array.from(selectedAttributes));
            });

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });

        // Replace the existing container
        const attributeSelect = document.getElementById('attribute-select');
        attributeSelect.innerHTML = '';
        attributeSelect.appendChild(container);

    } catch (error) {
        console.error('Error in populateAttributeSelect:', error);
        alert('Error loading attributes. Please check if the URL points to a valid MapServer layer and try again.');
    }
}

// Analysis and Table Functions
// Update runAnalysis function to clear results first
// Update runAnalysis function to include processing status
async function runAnalysis() {
    if (isochroneGenerationInProgress) {
        alert('Please wait while service areas are being generated...');
        return;
    }

    console.log('Starting analysis...');

    const statusElement = document.getElementById('processing-status');
    const statusMessage = document.getElementById('status-message');
    statusElement.className = 'processing-status processing';
    statusElement.style.display = 'block';

    // Disable export buttons during processing
    document.getElementById('export-csv-btn').disabled = true;
    document.getElementById('export-geojson-btn').disabled = true;

    const selectedAttrs = Array.from(selectedAttributes);
    console.log('Selected attributes:', selectedAttrs);

    if (selectedAttrs.length === 0) {
        alert('Please select at least one attribute to analyze.');
        return;
    }

    if (!window.geoLayer) {
        alert('Please upload data first.');
        return;
    }

    const layers = window.geoLayer.getLayers();
    processingStats.totalPoints = layers.length;
    pointCounter = 0;

    // Clear table data only
    tableData = [];
    document.querySelector('#stats-table tbody').innerHTML = '';
    document.getElementById('pagination-controls').innerHTML = '';

    const opacity = document.getElementById('opacitySlider').value / 100;
    const bufferStyle = {
        color: '#3388ff',
        weight: 2,
        opacity: 0.6,
        fillOpacity: opacity
    };

    const featureServiceUrl = document.getElementById('featureServiceDropdown').value;
    console.log('Using FeatureService URL:', featureServiceUrl);

    // Reset processing stats
    processingStats = {
        totalPoints: layers.length,
        successfulPoints: 0,
        failedPoints: 0,
        startTime: new Date().toISOString(),
        endTime: null,
        processingErrors: []
    };

    // Create a new buffer layer without removing the old one yet
    const newBufferLayer = L.featureGroup().addTo(map);

    try {
        for (const layer of layers) {
            if (layer.getLatLng) {
                try {
                    pointCounter++;
                    const pointId = pointCounter;
                    const latlng = layer.getLatLng();

                    statusMessage.textContent = `Processing ${pointCounter}/${processingStats.totalPoints} points...`;

                    let serviceArea;
                    const isIsochrone = document.getElementById('isochroneAnalysis').checked;

                    if (isIsochrone) {
                        const timeInMinutes = parseInt(document.getElementById('isochroneTime').value);
                        serviceArea = await getIsochrone(latlng, timeInMinutes);
                        if (!serviceArea) {
                            throw new Error('Failed to get isochrone');
                        }
                    } else {
                        const bufferDistance = parseFloat(document.getElementById('bufferDistance').value);
                        const point = turf.point([latlng.lng, latlng.lat]);
                        serviceArea = turf.buffer(point, bufferDistance, {
                            units: 'kilometers',
                            steps: 64
                        });
                    }

                    // Add the buffer/isochrone to the new layer
                    const analysisLayer = L.geoJSON(serviceArea, {
                        style: bufferStyle
                    }).addTo(newBufferLayer);

                    // Store reference to the layer
                    layer.analysisLayer = analysisLayer;

                    // Process each selected attribute
                    for (const field of selectedAttrs) {
                        try {
                            const whereClause = `${field} IS NOT NULL`;
                            console.log(`Processing field ${field} for point ${pointId}`);

                            // Convert GeoJSON to ESRI geometry format
                            const esriGeometry = {
                                rings: serviceArea.geometry.coordinates,
                                spatialReference: {wkid: 4326}
                            };

                            const results = await queryFeatureService(featureServiceUrl, esriGeometry, whereClause, [field], pointId);

                            if (results && results.features && results.features.length > 0) {
                                const stats = calculateStats(results.features, field);
                                if (stats) {
                                    stats.pointId = pointId;
                                    stats.original_id = layer.feature?.properties?.original_id || 'undefined';
                                    stats.coordinates = [latlng.lng, latlng.lat];
                                    addRowToTable(stats, field);
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing field ${field} for point ${pointId}:`, error);
                            processingStats.processingErrors.push({
                                pointId,
                                field,
                                error: error.message
                            });
                        }
                    }
                    processingStats.successfulPoints++;
                } catch (error) {
                    console.error(`Error processing point ${pointCounter}:`, error);
                    processingStats.failedPoints++;
                }
            }
        }
    } catch (error) {
        console.error('Error in analysis:', error);
    } finally {
        // Now that all processing is complete, we can safely remove the old buffer layer
        if (bufferLayer) {
            map.removeLayer(bufferLayer);
        }
        // Assign the new buffer layer
        bufferLayer = newBufferLayer;

        // Update final status
        processingStats.endTime = new Date().toISOString();
        statusElement.className = 'processing-status success';
        statusMessage.textContent = `Analysis complete: ${processingStats.successfulPoints} points processed successfully, ${processingStats.failedPoints} failed.`;

        // Enable export buttons if we have results
        document.getElementById('export-csv-btn').disabled = tableData.length === 0;
        document.getElementById('export-geojson-btn').disabled = tableData.length === 0;

        // Update buffer layer opacity
        if (bufferLayer) {
            bufferLayer.eachLayer(layer => {
                if (layer.setStyle) {
                    layer.setStyle({
                        fillOpacity: opacity
                    });
                }
            });
        }
    }
}

// Helper function to get bounding box from coordinates
function getBoundingBox(coordinates) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    coordinates.forEach(coord => {
        minX = Math.min(minX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxX = Math.max(maxX, coord[0]);
        maxY = Math.max(maxY, coord[1]);
    });

    return L.latLngBounds(
        [minY, minX],
        [maxY, maxX]
    );
}

// Update queryFeatureService for better error handling and logging
async function queryFeatureService(url, geometry, whereClause, fields, pointId) {
    return new Promise((resolve, reject) => {
        try {
            // Validate the geometry format
            if (!geometry || !geometry.rings || !geometry.spatialReference) {
                console.error(`Invalid geometry format for point ${pointId}:`, geometry);
                return resolve({
                    type: "FeatureCollection",
                    features: []
                });
            }

            console.log(`Query details for point ${pointId}:`, {
                url: url,
                geometryType: 'esriGeometryPolygon',
                rings: geometry.rings,
                where: whereClause,
                fields: fields
            });

            // Create query
            const query = L.esri.query({
                url: url
            });

            // Convert ESRI geometry to GeoJSON for Leaflet
            const geoJsonGeometry = {
                type: "Polygon",
                coordinates: geometry.rings.map(ring => ring.map(coord => [coord[0], coord[1]]))
            };

            // Set up the query with proper spatial filter
            query
                .intersects(geoJsonGeometry)  // Use intersects with GeoJSON geometry
                .where(whereClause)
                .fields(fields)
                .run((error, featureCollection) => {
                    if (error) {
                        console.error(`Query error for point ${pointId}:`, error);
                        resolve({
                            type: "FeatureCollection",
                            features: []
                        });
                        return;
                    }

                    // Log the response
                    console.log(`Query response for point ${pointId}:`, {
                        features: featureCollection?.features?.length || 0,
                        fields: fields
                    });

                    resolve(featureCollection || {
                        type: "FeatureCollection",
                        features: []
                    });
                });

        } catch (error) {
            console.error(`Error in query setup for point ${pointId}:`, error);
            resolve({
                type: "FeatureCollection",
                features: []
            });
        }
    });
}

// Helper function to get bounding box from rings
function getBoundingBoxFromRings(rings) {
    try {
        // Validate input
        if (!rings || !Array.isArray(rings) || rings.length === 0) {
            console.error('Invalid rings input:', rings);
            // Return a default bounding box for Canada
            return L.latLngBounds(
                [41.676556, -141.002197],  // Southwest corner
                [83.110626, -52.620201]    // Northeast corner
            );
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // Handle both single ring and multiple ring cases
        const coordinates = Array.isArray(rings[0][0]) ? rings : [rings];

        coordinates.forEach(ring => {
            if (Array.isArray(ring)) {
                ring.forEach(coord => {
                    if (Array.isArray(coord) && coord.length >= 2) {
                        const [x, y] = coord;
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                });
            }
        });

        // Check if we found valid bounds
        if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            console.error('No valid coordinates found in rings');
            // Return a default bounding box for Canada
            return L.latLngBounds(
                [41.676556, -141.002197],
                [83.110626, -52.620201]
            );
        }

        return L.latLngBounds(
            [minY, minX],
            [maxY, maxX]
        );
    } catch (error) {
        console.error('Error in getBoundingBoxFromRings:', error);
        // Return a default bounding box for Canada
        return L.latLngBounds(
            [41.676556, -141.002197],
            [83.110626, -52.620201]
        );
    }
}

// Update createPaginationButton to use GoC styling
function createPaginationButton(text, enabled, onClick) {
    const button = document.createElement('button');
    button.className = 'gc-button';
    button.textContent = text;
    button.disabled = !enabled;
    if (enabled) {
        button.addEventListener('click', onClick);
    }
    return button;
}

// Update updatePagination to show limited pages with ellipsis
function updatePagination() {
    const totalPages = Math.ceil(tableData.length / rowsPerPage);
    const controls = document.getElementById('pagination-controls');

    if (!controls) {
        console.error('Pagination controls element not found');
        return;
    }

    controls.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous button
    controls.appendChild(createPaginationButton('Previous', currentPage > 1, () => changePage(currentPage - 1)));

    // Calculate visible page range
    let startPage = Math.max(1, currentPage - 4);
    let endPage = Math.min(totalPages, startPage + 9);

    // Adjust start if we're near the end
    if (endPage - startPage < 9) {
        startPage = Math.max(1, endPage - 9);
    }

    // First page
    if (startPage > 1) {
        controls.appendChild(createPaginationButton('1', true, () => changePage(1)));
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'px-2';
            controls.appendChild(ellipsis);
        }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = createPaginationButton(i.toString(), true, () => changePage(i));
        if (i === currentPage) {
            pageBtn.classList.add('active');
        }
        controls.appendChild(pageBtn);
    }

    // Last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'px-2';
            controls.appendChild(ellipsis);
        }
        controls.appendChild(createPaginationButton(totalPages.toString(), true, () => changePage(totalPages)));
    }

    // Next button
    controls.appendChild(createPaginationButton('Next', currentPage < totalPages, () => changePage(currentPage + 1)));
}

function changePage(page) {
    if (page < 1 || page > Math.ceil(tableData.length / rowsPerPage)) return;
    currentPage = page;
    updateTable();
}

// Update clearTable function to be more robust
function clearTable(clearBuffers = true) {
    tableData = [];
    currentPage = 1;
    currentSortColumn = null;
    currentSortDirection = 'asc';
    pointCounter = 0;

    const tbody = document.querySelector('#stats-table tbody');
    if (tbody) {
        tbody.innerHTML = '';
    }

    const paginationControls = document.getElementById('pagination-controls');
    if (paginationControls) {
        paginationControls.innerHTML = '';
    }

    // Clear status message
    const statusElement = document.getElementById('processing-status');
    if (statusElement) {
        statusElement.style.display = 'none';
    }

    // Reset run analysis button
    const runAnalysisBtn = document.getElementById('run-analysis');
    if (runAnalysisBtn) {
        runAnalysisBtn.disabled = false;
    }

    // Disable export buttons
    document.getElementById('export-csv-btn').disabled = true;
    document.getElementById('export-geojson-btn').disabled = true;

    // Only clear buffers if explicitly requested
    if (clearBuffers && bufferLayer) {
        bufferLayer.clearLayers();
    }

    // Reset processing stats
    processingStats = {
        totalPoints: 0,
        successfulPoints: 0,
        failedPoints: 0,
        startTime: null,
        endTime: null,
        processingErrors: []
    };

    // Reset isochrone state
    isochroneGenerationInProgress = false;
    pendingIsochrones = 0;
}

// Add MD5 generation utility function
function generateMD5(content) {
    return CryptoJS.MD5(content).toString();
}

// Update metadata generation to include REST endpoint and dimensions
function generateMetadata(data, exportType, checksum) {
    const now = new Date();
    const timestamp = now.toISOString();
    const epoch = Math.floor(now.getTime() / 1000);

    // Get analysis parameters
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;
    const analysisParams = isIsochrone ? {
        type: 'isochrone',
        timeInMinutes: parseInt(document.getElementById('isochroneTime').value),
    } : {
        type: 'buffer',
        distanceKm: parseFloat(document.getElementById('bufferDistance').value)
    };

    // Calculate bounding box from all points
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    window.geoLayer.eachLayer(function(layer) {
        if (layer.getLatLng) {
            const latlng = layer.getLatLng();
            minLat = Math.min(minLat, latlng.lat);
            maxLat = Math.max(maxLat, latlng.lat);
            minLon = Math.min(minLon, latlng.lng);
            maxLon = Math.max(maxLon, latlng.lng);
        }
    });

    // Get selected REST endpoint anddimensions
    const featureServiceUrl = document.getElementById('featureServiceDropdown').value;
    // Getselected dimensions with their aliases
    const selectedDimensions = Array.from(selectedAttributes).map(attr => ({
        fieldName: attr,
        alias: fieldAliases.get(attr) || attr
    }));

    // Create ISO 19115:2014 compliant metadata
    const metadata = {
        fileIdentifier: `spatial-analysis-${epoch}`,
        language: document.documentElement.lang || 'en',
        characterSet: "utf8",
        contact: {
            organization: "Government of Canada"
        },
        dateStamp: timestamp,
        metadataStandardName: "ISO 19115:2014",
        metadataStandardVersion: "2014",
        dataQualityInfo: {
            scope: {
                level: "dataset"
            },
            lineage: {
                statement: `Generated using ${analysisParams.type} analysis`
            }
        },
        identificationInfo: {
            citation: {
                title: `Spatial Analysis Export - ${timestamp}`,
                date: timestamp,
                edition: "1.0"
            },
            abstract: `Spatial analysis results using ${analysisParams.type} method`,
            status: "completed",
            spatialRepresentationType: "vector",
            language: document.documentElement.lang || 'en',
            characterSet: "utf8",
            extent: {
                geographicElement: {
                    westBoundLongitude: minLon,
                    eastBoundLongitude: maxLon,
                    southBoundLatitude: minLat,
                    northBoundLatitude: maxLat
                },
                temporalElement: {
                    begin: timestamp,
                    end: timestamp
                }
            }
        },
        distributionInfo: {
            distributionFormat: {
                name: exportType,
                version: "1.0",
                specification: exportType === 'geojson' ? 'GeoJSON' : 'CSV',
                fileDecompressionTechnique: "none",
                transferSize: null // Will be set during export
            }
        },
        analysisParameters: {
            ...analysisParams,
            featureServiceUrl: featureServiceUrl,
            selectedDimensions: selectedDimensions,
            numberOfPoints: window.geoLayer.getLayers().length
        },
        contentInfo: {
            processingReport: {
                totalPoints: processingStats.totalPoints,
                successfulPoints: processingStats.successfulPoints,
                failedPoints: processingStats.failedPoints,
                startTime: processingStats.startTime,
                endTime: processingStats.endTime,
                errors: processingStats.processingErrors
            }
        },
        checksum: checksum
    };

    return metadata;
}

// Update export functions to include MD5 and metadata
async function exportToCSV() {
    if (tableData.length === 0) {
        alert('No data to export');
        return;
    }

    try {
        const isIsochrone = document.getElementById('isochroneAnalysis').checked;
        const distanceOrTimeLabel = isIsochrone ? 'Drive Time (seconds)' : 'Buffer Distance (km)';

        // Create CSV content with proper headers
        const selectedMeasures = getSelectedMeasures();
        const headers = [
            'Point ID',
            'Original Latitude',
            'Original Longitude',
            distanceOrTimeLabel
        ];

        if (selectedMeasures.count) headers.push('Count');
        if (selectedMeasures.mean) headers.push('Mean');
        if (selectedMeasures.median) headers.push('Median');
        if (selectedMeasures.min) headers.push('Min');
        if (selectedMeasures.max) headers.push('Max');
        if (selectedMeasures.stdDev) headers.push('Standard Deviation');
        headers.push('Dimension');

        const csvRows = [headers.join(',')];

        tableData.forEach(row => {
            const rowData = [
                row.point_id,
                row.coordinates[1].toFixed(6), // Latitude
                row.coordinates[0].toFixed(6), // Longitude
                row.distance_or_time
            ];

            if (selectedMeasures.count) rowData.push(row.count || '');
            if (selectedMeasures.mean) rowData.push(row.mean || '');
            if (selectedMeasures.median) rowData.push(row.median || '');
            if (selectedMeasures.min) rowData.push(row.min || '');
            if (selectedMeasures.max) rowData.push(row.max || '');
            if (selectedMeasures.stdDev) rowData.push(row.stdDev || '');

            // Use field alias if available
            const dimensionAlias = fieldAliases.get(row.dimension) || row.dimension;
            rowData.push(`"${dimensionAlias.replace(/"/g, '""')}"`);

            csvRows.push(rowData.join(','));
        });

        const csvContent = csvRows.join('\n');
        const checksum = generateMD5(csvContent);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Generate metadata with additional information
        const metadata = generateMetadata(tableData, 'csv', checksum);

        // Create zip file
        const zip = new JSZip();
        zip.file('data.csv', csvContent);
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));
        zip.file('checksum.md5', `${checksum}  data.csv`);

        // Generate and download zip file
        const zipBlob = await zip.generateAsync({type: 'blob'});
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(zipBlob);
        downloadLink.download = `spatial_analysis_${timestamp}.zip`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Error exporting CSV file. Please try again.');
    }
}

async function exportToGeoJSON() {
    if (tableData.length === 0 || !window.geoLayer) {
        alert('No data to export');
        return;
    }

    try {
        const selectedMeasures = getSelectedMeasures();
        const features = [];
        const isIsochrone = document.getElementById('isochroneAnalysis').checked;

        window.geoLayer.eachLayer(layer => {
            if (layer.getLatLng) {
                const latlng = layer.getLatLng();
                const pointId = layer.feature?.properties?.pointId;
                const originalId = layer.feature?.properties?.original_id;

                // Find all results for this point
                const pointResults = tableData.filter(row => row.point_id === pointId);

                if (pointResults.length > 0) {
                    // Create properties object for the original point
                    const pointProperties = {
                        feature_type: 'source_point',
                        pointId: pointId,
                        original_id: originalId || 'undefined',
                        coordinates: {
                            latitude: latlng.lat,
                            longitude: latlng.lng
                        }
                    };

                    // Add analysis results for each dimension to point properties
                    pointResults.forEach(result => {
                        const dimensionAlias = fieldAliases.get(result.dimension) || result.dimension;
                        const prefix = dimensionAlias.replace(/[^a-zA-Z0-9]/g, '_');

                        if (selectedMeasures.count) pointProperties[`${prefix}_count`] = result.count;
                        if (selectedMeasures.mean) pointProperties[`${prefix}_mean`] = result.mean;
                        if (selectedMeasures.median) pointProperties[`${prefix}_median`] = result.median;
                        if (selectedMeasures.min) pointProperties[`${prefix}_min`] = result.min;
                        if (selectedMeasures.max) pointProperties[`${prefix}_max`] = result.max;
                        if (selectedMeasures.stdDev) pointProperties[`${prefix}_stddev`] = result.stdDev;
                    });

                    // Add point feature
                    features.push({
                        type: 'Feature',
                        id: `point_${pointId}`,
                        geometry: {
                            type: 'Point',
                            coordinates: [latlng.lng, latlng.lat]
                        },
                        properties: pointProperties
                    });

                    // Get the buffer/service area geometry
                    if (layer.analysisLayer) {
                        layer.analysisLayer.eachLayer(polygonLayer => {
                            if (polygonLayer.feature && polygonLayer.feature.geometry) {
                                // Create properties for the service area/buffer polygon
                                const polygonProperties = {
                                    feature_type: isIsochrone ? 'service_area' : 'buffer',
                                    pointId: pointId,
                                    original_id: originalId || 'undefined',
                                    source_point_ref: `point_${pointId}`,
                                    analysis_parameters: {
                                        type: isIsochrone ? 'drive_time' : 'buffer_distance',
                                        value: isIsochrone ?
                                            parseInt(document.getElementById('isochroneTime').value) * 60 : // Convert to seconds
                                            parseFloat(document.getElementById('bufferDistance').value) // kilometers
                                    }
                                };

                                // Add polygon feature
                                features.push({
                                    type: 'Feature',
                                    id: `${isIsochrone ? 'service_area' : 'buffer'}_${pointId}`,
                                    geometry: polygonLayer.feature.geometry,
                                    properties: polygonProperties
                                });
                            }
                        });
                    }
                }
            }
        });

        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        const geojsonContent = JSON.stringify(geojson, null, 2);
        const checksum = generateMD5(geojsonContent);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Generate metadata with additional information
        const metadata = {
            timestamp: new Date().toISOString(),
            exportType: 'geojson',
            checksum: checksum,
            featureServiceUrl: document.getElementById('featureServiceDropdown').value,
            analysisType: isIsochrone ? 'isochrone' : 'buffer',
            isochroneServiceUrl: isIsochrone ?
                'https://ors-sro.alpha.phac-aspc.gc.ca/ors/v2/isochrones/driving-car' : null,
            analysisParameters: {
                type: isIsochrone ? 'drive_time_seconds' : 'buffer_distance_km',
                value: isIsochrone ?
                    parseInt(document.getElementById('isochroneTime').value) * 60 :
                    parseFloat(document.getElementById('bufferDistance').value)
            },
            statistics: Array.from(selectedAttributes).map(attr => ({
                field: attr,
                alias: fieldAliases.get(attr) || attr
            }))
        };

        // Create zip file with all components
        const zip = new JSZip();
        zip.file('data.geojson', geojsonContent);
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));
        zip.file('checksum.md5', `${checksum}  data.geojson`);

        // Generate and download zip file
        const zipBlob = await zip.generateAsync({type: 'blob'});
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(zipBlob);
        downloadLink.download = `spatial_analysis_${timestamp}.zip`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

    } catch (error) {
        console.error('Error exporting GeoJSON:', error);
        alert('Error exporting GeoJSON file. Please try again.');
    }
}

// File upload and GeoJSON rendering functions
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Clear previous state before loading new file
    clearAnalysisState();

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const fileContent = e.target.result;
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'csv') {
                parseCSV(fileContent);
            } else if (extension === 'geojson') {
                const parsedJson = JSON.parse(fileContent);
                renderGeoJSON(parsedJson);
            } else {
                throw new Error('Unsupported file format');
            }
        } catch (error) {
            console.error('Error processing file:', error);
            alert('Error processing file. Please ensure it is a valid CSV or GeoJSON file.');
        }
    };

    reader.onerror = function(error) {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
}

function parseCSV(content) {
    Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            if (!results.data || results.data.length === 0) {
                alert('No valid data found in CSV file');
                return;
            }

            // Find latitude and longitude columns
            const headers = Object.keys(results.data[0]);
            const latField = headers.find(h => /^(lat|latitude)$/i.test(h));
            const lonField = headers.find(h => /^(lon|long|longitude)$/i.test(h));
            // Look for ID field - try common variations
            const idField = headers.find(h => /^(id|key|identifier|point_id)$/i.test(h)) || headers[0];

            if (!latField || !lonField) {
                alert('Could not find latitude/longitude columns in CSV');
                return;
            }

            const geojson = {
                type: "FeatureCollection",
                features: results.data
                    .filter(row => row[latField] && row[lonField])
                    .map(row => ({
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            coordinates: [parseFloat(row[lonField]), parseFloat(row[latField])]
                        },
                        properties: {
                            ...row,
                            original_id: row[idField] || 'undefined' // Store original ID
                        }
                    }))
            };

            renderGeoJSON(geojson);
        }
    });
}


// Handle buffer and opacity changes
function handleBufferDistanceInput(event) {
    const value = parseFloat(event.target.value);
    if (value >= 0 && value <= 50) {
        document.getElementById('bufferSlider').value = value;
        updateServiceAreas();
    }
}

function handleBufferSliderChange(event) {
    const value = event.target.value;
    document.getElementById('bufferDistance').value = value;
    updateServiceAreas();
}

function handleOpacityChange(event) {
    const opacity = event.target.value / 100;
    document.getElementById('opacityValue').textContent = event.target.value + '%';

    if (bufferLayer) {
        bufferLayer.eachLayer(layer => {
            if (layer.setStyle) {
                layer.setStyle({
                    fillOpacity: opacity
                });
            }
        });
    }
}

// Update toggleAnalysisType function to properly handle UI updates
function toggleAnalysisType() {
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;
    const bufferControls = document.getElementById('bufferControls');
    const isochroneControls = document.getElementById('isochroneControls');
    const runAnalysisBtn = document.getElementById('run-analysis');

    // Update visibility of controls
    bufferControls.style.display = isIsochrone ? 'none' : 'block';
    isochroneControls.style.display = isIsochrone ? 'block' : 'none';

    // Clear existing results and state
    clearTable(true);

    // Reset all state variables
    isochroneGenerationInProgress = false;
    pendingIsochrones = 0;
    tableData = [];
    currentPage = 1;
    currentSortColumn = null;
    currentSortDirection = 'asc';
    pointCounter = 0;

    // Clear buffer layer
    if (bufferLayer) {
        bufferLayer.clearLayers();
        map.removeLayer(bufferLayer);
        bufferLayer = L.featureGroup().addTo(map);
    }

    // Enable run analysis button
    runAnalysisBtn.disabled = false;

    // Update table header
    updateTable();
}

function handleIsochroneTimeInput(event) {
    const value = parseInt(event.target.value);
    if (isNaN(value) || value < 1) {
        event.target.value = 1;
    } else if (value > 60) { // Maximum 1 hour
        event.target.value = 60;
    }
    document.getElementById('isochroneSlider').value = event.target.value;
}

function handleIsochroneSliderChange(event) {
    const value = event.target.value;
    document.getElementById('isochroneTime').value = value;
    updateServiceAreas();
}

// Update getIsochrone function to use the correct service
async function getIsochrone(latlng, timeInMinutes) {
    try {
        const timeInSeconds = timeInMinutes * 60;
        const payload = {
            locations: [[latlng.lng, latlng.lat]],
            range: [timeInSeconds]
        };

        const response = await fetch('https://ors-sro.alpha.phac-aspc.gc.ca/ors/v2/isochrones/driving-car', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Convert response to GeoJSON if needed
        if (data && data.features && data.features.length > 0) {
            return data.features[0];
        } else {
            throw new Error('No isochrone data received');
        }
    } catch (error) {
        console.error('Error generating isochrone:', error);
        return null;
    }
}

// Add this function to validate isochrone service
async function validateIsochroneService() {
    try {
        const testPayload = {
            locations: [[-75.6972, 45.4215]], // Ottawa coordinates
            range: [300] // 5 minutes
        };

        const response = await fetch('https://ors-sro.alpha.phac-aspc.gc.ca/ors/v2/isochrones/driving-car', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPayload)
        });

        if (!response.ok) {
            console.error('Isochrone service test failed:', response.status);
            return false;
        }

        const data = await response.json();
        return data && data.features && data.features.length > 0;
    } catch (error) {
        console.error('Error validating isochrone service:', error);
        return false;
    }
}

// Update updateServiceAreas function to add popups
async function updateServiceAreas() {
    if (bufferLayer) {
        bufferLayer.clearLayers();
    }

    bufferLayer = L.featureGroup().addTo(map);
    const opacity = parseInt(document.getElementById('opacitySlider').value) / 100;
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;

    if (!window.geoLayer) return;

    if (isIsochrone) {
        const timeInMinutes = parseInt(document.getElementById('isochroneTime').value);
        const timeInSeconds = timeInMinutes * 60;

        for (const layer of window.geoLayer.getLayers()) {
            if (layer.getLatLng) {
                const latlng = layer.getLatLng();
                const isochrone = await getIsochrone(latlng, timeInMinutes);

                if (isochrone && isochrone.geometry && isochrone.geometry.coordinates) {
                    try {
                        const geoJsonLayer = L.geoJSON(isochrone, {
                            style: {
                                color: 'blue',
                                fillColor: '#30f',
                                fillOpacity: opacity
                            }
                        });

                        // Add popup to service area
                        const popupContent = `
                            <strong>Point ID:</strong> ${pointCounter}<br>
                            <strong>Drive Time:</strong> ${timeInSeconds} seconds<br>
                            <strong>Coordinates:</strong> ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}
                        `;
                        geoJsonLayer.bindPopup(popupContent);

                        // Validate the layer before adding it
                        if (geoJsonLayer && geoJsonLayer.getBounds) {
                            geoJsonLayer.addTo(bufferLayer);
                        } else {
                            console.error('Invalid GeoJSON layer created from isochrone:', isochrone);
                        }
                    } catch (error) {
                        console.error('Error rendering isochrone:', error);
                    }
                }
            }
        }
    } else {
        const bufferDistance = parseFloat(document.getElementById('bufferDistance').value);

        window.geoLayer.eachLayer(function(layer) {
            if (layer.getLatLng) {
                const latlng = layer.getLatLng();
                const buffer = L.circle(layer.getLatLng(), {
                    radius: bufferDistance * 1000,
                    color: 'blue',
                    fillColor: '#30f',
                    fillOpacity: opacity
                });

                // Add popup to buffer
                const popupContent = `
                    <strong>Point ID:</strong> ${pointCounter}<br>
                    <strong>Buffer Distance:</strong> ${bufferDistance} km<br>
                    <strong>Coordinates:</strong> ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}
                `;
                buffer.bindPopup(popupContent);

                buffer.addTo(bufferLayer);
            }
        });
    }
}

function toggleAllAttributes() {
    const checkboxes = document.querySelectorAll('#attribute-select input[type="checkbox"]');
    isAllAttributesSelected = !isAllAttributesSelected;

    checkboxes.forEach(checkbox => {
        checkbox.checked = isAllAttributesSelected;
        if (isAllAttributesSelected) {
            selectedAttributes.add(checkbox.value);
        } else {
            selectedAttributes.delete(checkbox.value);
        }
    });

    console.log('Selected attributes after toggle:', Array.from(selectedAttributes));
}

function renderGeoJSON(geojson) {
    // Clear existing layers
    if (window.geoLayer) {
        map.removeLayer(window.geoLayer);
    }

    window.geoLayer = L.geoJSON(geojson, {
        pointToLayer: function(feature, latlng) {
            const marker = L.marker(latlng);
            // Add Point ID to feature properties for popup
            feature.properties.pointId = ++pointCounter;
            // Store coordinates in feature properties
            feature.properties.latitude = latlng.lat;
            feature.properties.longitude = latlng.lng;
            return marker;
        },
        onEachFeature: function(feature, layer) {
            let popupContent = '<div class="popup-content">';
            popupContent += `<strong>Point ID:</strong> ${feature.properties.pointId}<br>`;
            Object.entries(feature.properties).forEach(([key, value]) => {
                if (key !== 'pointId') {  // Skip pointId as it's already shown
                    popupContent += `<strong>${key}:</strong> ${value}<br>`;
                }
            });
            popupContent += '</div>';
            layer.bindPopup(popupContent);
        }
    }).addTo(map);

    // Fit map to show all points
    if (window.geoLayer.getBounds().isValid()) {
        map.fitBounds(window.geoLayer.getBounds());
    }

    updateServiceAreas();
}

function handleOpacityChange(event) {
    const opacity = event.target.value / 100;
    document.getElementById('opacityValue').textContent = event.target.value + '%';

    if (bufferLayer) {
        bufferLayer.eachLayer(layer => {
            if (layer.setStyle) {
                layer.setStyle({
                    fillOpacity: opacity
                });
            }
        });
    }
}

// Add reset functionality when switching analysis types
function toggleAnalysisType() {
    const isIsochrone = document.getElementById('isochroneAnalysis').checked;
    document.getElementById('bufferControls').style.display = isIsochrone ? 'none' : 'block';
    document.getElementById('isochroneControls').style.display = isIsochrone ? 'block' : 'none';

    // Reset table and analysis state
    clearAnalysisState();
}

// Add reset functionality for file uploads
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Clear previous state before loading new file
    clearAnalysisState();

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const fileContent = e.target.result;
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'csv') {
                parseCSV(fileContent);
            } else if (extension === 'geojson') {
                const parsedJson = JSON.parse(fileContent);
                renderGeoJSON(parsedJson);
            } else {
                throw new Error('Unsupported file format');
            }
        } catch (error) {
            console.error('Error processing file:', error);
            alert('Error processing file. Please ensure it is a valid CSV or GeoJSON file.');
        }
    };

    reader.onerror = function(error) {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
}

// Centralized function to clear analysis state
function clearAnalysisState() {
    // Clear table data
    tableData = [];
    currentPage = 1;
    currentSortColumn = null;
    currentSortDirection = 'asc';

    // Clear table display
    const tbody = document.querySelector('#stats-table tbody');
    if (tbody) tbody.innerHTML = '';

    // Clear pagination
    const paginationControls = document.getElementById('pagination-controls');
    if (paginationControls) paginationControls.innerHTML = '';

    // Clear buffer/service area layer
    if (bufferLayer) {
        bufferLayer.clearLayers();
    }

    // Reset processing stats
    processingStats = {
        totalPoints: 0,
        successfulPoints: 0,
        failedPoints: 0,
        startTime: null,
        endTime: null,
        processingErrors: []
    };

    // Reset status message
    const statusElement = document.getElementById('processing-status');
    const statusMessage = document.getElementById('status-message');
    if (statusElement) statusElement.style.display = 'none';
    if (statusMessage) statusMessage.textContent = '';

    // Disable export buttons
    document.getElementById('export-csv-btn').disabled = true;
    document.getElementById('export-geojson-btn').disabled = true;
    pointCounter = 0;
    isochroneGenerationInProgress = false;
    pendingIsochrones = 0;
}

// Update run analysis function to check generation state
async function runAnalysis() {
    if (isochroneGenerationInProgress) {
        alert('Please wait while service areas are being generated...');
        return;
    }

    console.log('Starting analysis...');

    const statusElement = document.getElementById('processing-status');
    const statusMessage = document.getElementById('status-message');
    statusElement.className = 'processing-status processing';
    statusElement.style.display = 'block';

    // Disable export buttons during processing
    document.getElementById('export-csv-btn').disabled = true;
    document.getElementById('export-geojson-btn').disabled = true;

    const selectedAttrs = Array.from(selectedAttributes);
    console.log('Selected attributes:', selectedAttrs);

    if (selectedAttrs.length === 0) {
        alert('Please select at least one attribute to analyze.');
        return;
    }

    if (!window.geoLayer) {
        alert('Please upload data first.');
        return;
    }

    const layers = window.geoLayer.getLayers();
    processingStats.totalPoints = layers.length;
    pointCounter = 0;

    // Clear table data only
    tableData = [];
    document.querySelector('#stats-table tbody').innerHTML = '';
    document.getElementById('pagination-controls').innerHTML = '';

    const opacity = document.getElementById('opacitySlider').value / 100;
    const bufferStyle = {
        color: '#3388ff',
        weight: 2,
        opacity: 0.6,
        fillOpacity: opacity
    };

    const featureServiceUrl = document.getElementById('featureServiceDropdown').value;
    console.log('Using FeatureService URL:', featureServiceUrl);

    // Reset processing stats
    processingStats = {
        totalPoints: layers.length,
        successfulPoints: 0,
        failedPoints: 0,
        startTime: new Date().toISOString(),
        endTime: null,
        processingErrors: []
    };

    // Create a new buffer layer without removing the old one yet
    const newBufferLayer = L.featureGroup().addTo(map);

    try {
        for (const layer of layers) {
            if (layer.getLatLng) {
                try {
                    pointCounter++;
                    const pointId = pointCounter;
                    const latlng = layer.getLatLng();

                    statusMessage.textContent = `Processing ${pointCounter}/${processingStats.totalPoints} points...`;

                    let serviceArea;
                    const isIsochrone = document.getElementById('isochroneAnalysis').checked;

                    if (isIsochrone) {
                        const timeInMinutes = parseInt(document.getElementById('isochroneTime').value);
                        serviceArea = await getIsochrone(latlng, timeInMinutes);
                        if (!serviceArea) {
                            throw new Error('Failed to get isochrone');
                        }
                    } else {
                        const bufferDistance = parseFloat(document.getElementById('bufferDistance').value);
                        const point = turf.point([latlng.lng, latlng.lat]);
                        serviceArea = turf.buffer(point, bufferDistance, {
                            units: 'kilometers',
                            steps: 64
                        });
                    }

                    // Add the buffer/isochrone to the new layer
                    const analysisLayer = L.geoJSON(serviceArea, {
                        style: bufferStyle
                    }).addTo(newBufferLayer);

                    // Store reference to the layer
                    layer.analysisLayer = analysisLayer;

                    // Process each selected attribute
                    for (const field of selectedAttrs) {
                        try {
                            const whereClause = `${field} IS NOT NULL`;
                            console.log(`Processing field ${field} for point ${pointId}`);

                            // Convert GeoJSON to ESRI geometry format
                            const esriGeometry = {
                                rings: serviceArea.geometry.coordinates,
                                spatialReference: {wkid: 4326}
                            };

                            const results = await queryFeatureService(featureServiceUrl, esriGeometry, whereClause, [field], pointId);

                            if (results && results.features && results.features.length > 0) {
                                const stats = calculateStats(results.features, field);
                                if (stats) {
                                    stats.pointId = pointId;
                                    stats.original_id = layer.feature?.properties?.original_id || 'undefined';
                                    stats.coordinates = [latlng.lng, latlng.lat];
                                    addRowToTable(stats, field);
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing field ${field} for point ${pointId}:`, error);
                            processingStats.processingErrors.push({
                                pointId,
                                field,
                                error: error.message
                            });
                        }
                    }
                    processingStats.successfulPoints++;
                } catch (error) {
                    console.error(`Error processing point ${pointCounter}:`, error);
                    processingStats.failedPoints++;
                }
            }
        }
    } catch (error) {
        console.error('Error in analysis:', error);
    } finally {
        // Now that all processing is complete, we can safely remove the old buffer layer
        if (bufferLayer) {
            map.removeLayer(bufferLayer);
        }
        // Assign the new buffer layer
        bufferLayer = newBufferLayer;

        // Update final status
        processingStats.endTime = new Date().toISOString();
        statusElement.className = 'processing-status success';
        statusMessage.textContent = `Analysis complete: ${processingStats.successfulPoints} points processed successfully, ${processingStats.failedPoints} failed.`;

        // Enable export buttons if we have results
        document.getElementById('export-csv-btn').disabled = tableData.length === 0;
        document.getElementById('export-geojson-btn').disabled = tableData.length === 0;

        // Update buffer layer opacity
        if (bufferLayer) {
            bufferLayer.eachLayer(layer => {
                if (layer.setStyle) {
                    layer.setStyle({
                        fillOpacity: opacity
                    });
                }
            });
        }
    }
}