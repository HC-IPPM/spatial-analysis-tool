// Initialize map
const map = L.map('map').setView([45.4215, -75.6972], 13);

// Load tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Global variables for table management
let tableData = [];
let currentPage = 1;
const rowsPerPage = 10;

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
  initializeEventListeners();
});

function initializeEventListeners() {
  document.getElementById('fileInput').addEventListener('change', handleFileUpload);
  document.getElementById('bufferSlider').addEventListener('input', handleBufferSliderChange);
  document.getElementById('run-analysis').addEventListener('click', runAnalysis);
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
  document.getElementById('clear-table').addEventListener('click', clearTable);
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const fileContent = e.target.result;
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv') {
      parseCSV(fileContent);
    } else if (extension === 'geojson') {
      renderGeoJSON(JSON.parse(fileContent));
    }
  };
  reader.readAsText(file);
}

function parseCSV(content) {
  Papa.parse(content, {
    header: true,
    dynamicTyping: true,
    complete: function(results) {
      const geojson = convertToGeoJSON(results.data);
      renderGeoJSON(geojson);
    }
  });
}

function convertToGeoJSON(data) {
  return {
    type: "FeatureCollection",
    features: data
      .filter(row => row.lat && row.long)
      .map(row => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [row.long, row.lat]
        },
        properties: row
      }))
  };
}

function renderGeoJSON(geojson) {
  if (window.geoLayer) {
    map.removeLayer(window.geoLayer);
  }

  window.geoLayer = L.geoJSON(geojson, {
    onEachFeature: addPopupToFeature
  }).addTo(map);

  map.fitBounds(window.geoLayer.getBounds());
  createBuffers();
}

function addPopupToFeature(feature, layer) {
  const popupContent = Object.entries(feature.properties)
    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
    .join('<br>');
  layer.bindPopup(popupContent);
}

function handleBufferSliderChange() {
  const value = document.getElementById('bufferSlider').value;
  document.getElementById('bufferValue').textContent = value;
  createBuffers();
}

function createBuffers() {
  if (!window.geoLayer) return;

  // Clear existing buffers
  if (window.bufferLayer) {
    map.removeLayer(window.bufferLayer);
  }

  const bufferDistance = parseFloat(document.getElementById('bufferSlider').value);
  window.bufferLayer = L.featureGroup().addTo(map);

  window.geoLayer.eachLayer(function(layer) {
    const buffer = L.circle(layer.getLatLng(), {
      radius: bufferDistance * 1000,
      color: 'blue',
      fillOpacity: 0.2
    }).addTo(window.bufferLayer);
  });
}

function runAnalysis() {
  const selectedField = document.getElementById('attribute-select').value;
  if (!selectedField) {
    alert('Please select an attribute to analyze.');
    return;
  }

  clearTable(); // Clear previous results
  if (!window.geoLayer) {
    alert('Please upload data first.');
    return;
  }

  let pointId = 1;
  window.geoLayer.eachLayer(function(layer) {
    const buffer = L.circle(layer.getLatLng(), {
      radius: parseFloat(document.getElementById('bufferSlider').value) * 1000
    });

    queryFeatureServiceForIntersection(buffer.getBounds(), selectedField, pointId++);
  });
}

function queryFeatureServiceForIntersection(bounds, selectedField, pointId) {
  const query = L.esri.query({
    url: document.getElementById('featureServiceDropdown').value
  });

  query.within(bounds);
  query.where(`${selectedField} IS NOT NULL`);

  query.run(function(error, featureCollection) {
    if (error) {
      console.error("Error querying FeatureService:", error);
      return;
    }

    if (featureCollection.features.length > 0) {
      const stats = calculateStats(featureCollection.features, selectedField);
      if (stats) {
        addStatsToTable({
          id: `Point ${pointId}`,
          ...stats
        });
      }
    }
  });
}

function calculateStats(features, field) {
  const values = features.map(f => f.properties[field]).filter(v => v != null);

  if (values.length === 0) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stdDev = Math.sqrt(
    values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
  );

  return {
    mean: mean.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    stdDev: stdDev.toFixed(2)
  };
}

function addStatsToTable(stats) {
  tableData.push(stats);
  updateTable();
}

function updateTable() {
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const pageData = tableData.slice(startIndex, endIndex);

  const tbody = document.querySelector('#stats-table tbody');
  tbody.innerHTML = '';

  pageData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.mean}</td>
      <td>${row.min}</td>
      <td>${row.max}</td>
      <td>${row.stdDev}</td>
    `;
    tbody.appendChild(tr);
  });

  updatePagination();
}

function updatePagination() {
  const totalPages = Math.ceil(tableData.length / rowsPerPage);
  const controls = document.getElementById('pagination-controls');
  controls.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous button
  const prevBtn = createPaginationButton('Previous', currentPage > 1, () => changePage(currentPage - 1));
  controls.appendChild(prevBtn);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = createPaginationButton(i.toString(), true, () => changePage(i));
    if (i === currentPage) pageBtn.classList.add('active');
    controls.appendChild(pageBtn);
  }

  // Next button
  const nextBtn = createPaginationButton('Next', currentPage < totalPages, () => changePage(currentPage + 1));
  controls.appendChild(nextBtn);
}

function createPaginationButton(text, enabled, onClick) {
  const button = document.createElement('button');
  button.className = 'btn btn-outline-primary';
  button.textContent = text;
  button.disabled = !enabled;
  if (enabled) {
    button.addEventListener('click', onClick);
  }
  return button;
}

function changePage(page) {
  if (page < 1 || page > Math.ceil(tableData.length / rowsPerPage)) return;
  currentPage = page;
  updateTable();
}

function clearTable() {
  tableData = [];
  currentPage = 1;
  const tbody = document.querySelector('#stats-table tbody');
  tbody.innerHTML = '';
  document.getElementById('pagination-controls').innerHTML = '';
}

function exportToCSV() {
  if (tableData.length === 0) {
    alert('No data to export.');
    return;
  }

  const headers = ['Buffer/Point ID', 'Mean', 'Min', 'Max', 'Standard Deviation'];
  const csvContent = [
    headers.join(','),
    ...tableData.map(row => [
      row.id,
      row.mean,
      row.min,
      row.max,
      row.stdDev
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'analysis_results.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}