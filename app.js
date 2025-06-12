class TrackData {
    constructor(gpxObject, rawGPXData, fileName) {
        this.gpxObject = gpxObject;
        this.rawGPXData = rawGPXData;
        this.fileName = fileName;
        this.statistics = {};
        this.elevationData = [];
        this.waypoints = [];
        
        this.extractTrackData();
    }
    
    extractTrackData() {
        if (!this.gpxObject) return;
        
        // Extract basic statistics
        this.statistics = {
            distance: this.gpxObject.get_distance ? this.gpxObject.get_distance() : null,
            minElevation: this.gpxObject.get_elevation_min ? this.gpxObject.get_elevation_min() : null,
            maxElevation: this.gpxObject.get_elevation_max ? this.gpxObject.get_elevation_max() : null,
            elevationGain: this.gpxObject.get_elevation_gain ? this.gpxObject.get_elevation_gain() : null,
            elevationLoss: this.gpxObject.get_elevation_loss ? this.gpxObject.get_elevation_loss() : null,
            movingTime: this.gpxObject.get_moving_time ? this.gpxObject.get_moving_time() : null
        };
        
        // Extract waypoints
        this.waypoints = this.gpxObject.get_waypoints ? this.gpxObject.get_waypoints() : [];
        
        // Extract elevation data
        this.elevationData = this.extractElevationData();
    }
    
    extractElevationData() {
        try {
            if (this.gpxObject.get_elevation_data && typeof this.gpxObject.get_elevation_data === 'function') {
                const eleData = this.gpxObject.get_elevation_data();
                
                if (eleData && eleData.length > 0) {
                    // The get_elevation_data() returns an array of [distance, elevation, tooltip]
                    const result = eleData.map((point, index) => ({
                        index: index,
                        distance: point[0], // distance from start in meters
                        elevation: parseFloat(point[1]) // elevation in meters
                    }));
                    
                    // Sample data if too many points (for performance)
                    if (result.length > 200) {
                        const step = Math.ceil(result.length / 200);
                        return result.filter((_, index) => index % step === 0);
                    }
                    
                    return result;
                }
            }
            
            return [];
        } catch (error) {
            console.error('Error getting elevation data:', error);
            return [];
        }
    }
    
    hasElevationData() {
        return this.elevationData.length > 0;
    }
    
    getFormattedDistance() {
        return this.statistics.distance ? (this.statistics.distance / 1000).toFixed(2) : null;
    }
    
    getFormattedMovingTime() {
        if (!this.statistics.movingTime) return null;
        
        const hours = Math.floor(this.statistics.movingTime / 3600);
        const minutes = Math.floor((this.statistics.movingTime % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
}

class GPXViewer {
    constructor() {
        this.map = null;
        this.currentGPXLayer = null;
        this.currentTrackData = null;
        this.init();
    }

    init() {
        this.initMap();
        this.setupEventListeners();
        this.loadFromURL();
    }

    initMap() {
        this.map = L.map('map').setView([50.0, 5.0], 5);
        
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
    }

    setupEventListeners() {
        const fileInput = document.getElementById('gpx-file');
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        const toggleButton = document.getElementById('toggle-track-info');
        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTrackInfo();
        });
        
        const trackInfo = document.getElementById('track-info');
        trackInfo.addEventListener('click', (e) => {
            // Only toggle when clicking on the collapsed icon, not on the content when expanded
            if (trackInfo.classList.contains('collapsed')) {
                this.toggleTrackInfo();
            }
        });
        
        const copyUrlButton = document.getElementById('copy-url');
        copyUrlButton.addEventListener('click', () => this.copyURL());
        
        window.addEventListener('hashchange', () => this.loadFromURL());
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.gpx')) {
            this.showError('Please select a valid GPX file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.loadGPX(e.target.result, file.name);
            } catch (error) {
                this.showError('Error reading GPX file: ' + error.message);
            }
        };
        reader.onerror = () => {
            this.showError('Error reading file.');
        };
        reader.readAsText(file);
    }

    loadFromURL() {
        const hash = window.location.hash.substring(1);
        if (hash.startsWith('gpx=')) {
            try {
                const base64Data = hash.substring(4);
                const gpxData = atob(base64Data);
                this.loadGPX(gpxData, 'shared-track.gpx');
            } catch (error) {
                this.showError('Invalid GPX data in URL: ' + error.message);
            }
        }
    }

    loadGPX(gpxData, fileName = 'track.gpx') {
        this.hideError();
        this.hideTrackInfo();

        if (this.currentGPXLayer) {
            this.map.removeLayer(this.currentGPXLayer);
        }

        try {
            this.currentGPXLayer = new L.GPX(gpxData, {
                async: true,
                marker_options: {
                    startIconUrl: null,
                    endIconUrl: null,
                    shadowUrl: null,
                    wptIconUrls: {
                        '': 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png'
                    }
                },
                polyline_options: {
                    color: '#3498db',
                    weight: 4,
                    opacity: 0.8
                }
            });

            this.currentGPXLayer.on('loaded', (e) => {
                const gpx = e.target;
                this.map.fitBounds(gpx.getBounds(), { padding: [20, 20] });
                
                // Create TrackData instance with parsed GPX data
                this.currentTrackData = new TrackData(gpx, gpxData, fileName);
                this.displayTrackInfo();
            });

            this.currentGPXLayer.on('error', (e) => {
                this.showError('Error loading GPX data: ' + e.err);
            });

            this.currentGPXLayer.addTo(this.map);

        } catch (error) {
            this.showError('Error parsing GPX file: ' + error.message);
        }
    }

    displayTrackInfo() {
        if (!this.currentTrackData) return;
        
        const trackInfo = document.getElementById('track-info');
        const trackStats = document.getElementById('track-stats');
        const toggleButton = document.getElementById('toggle-track-info');
        
        let statsHTML = '';
        
        // Distance
        const distance = this.currentTrackData.getFormattedDistance();
        if (distance) {
            statsHTML += `<div><strong>Distance:</strong> ${distance} km</div>`;
        }
        
        // Elevation data
        if (this.currentTrackData.statistics.minElevation !== null && this.currentTrackData.statistics.maxElevation !== null) {
            statsHTML += `<div><strong>Min Elevation:</strong> ${this.currentTrackData.statistics.minElevation.toFixed(0)} m</div>`;
            statsHTML += `<div><strong>Max Elevation:</strong> ${this.currentTrackData.statistics.maxElevation.toFixed(0)} m</div>`;
            
            if (this.currentTrackData.statistics.elevationGain !== null) {
                statsHTML += `<div><strong>Elevation Gain:</strong> ${this.currentTrackData.statistics.elevationGain.toFixed(0)} m</div>`;
            }

            if (this.currentTrackData.statistics.elevationLoss !== null) {
                statsHTML += `<div><strong>Elevation Loss:</strong> ${this.currentTrackData.statistics.elevationLoss.toFixed(0)} m</div>`;
            }
        }
        
        // Moving time
        const movingTime = this.currentTrackData.getFormattedMovingTime();
        if (movingTime) {
            statsHTML += `<div><strong>Moving Time:</strong> ${movingTime}</div>`;
        }

        // Waypoints
        if (this.currentTrackData.waypoints.length > 0) {
            statsHTML += `<div><strong>Waypoints:</strong> ${this.currentTrackData.waypoints.length}</div>`;
        }

        if (statsHTML) {
            trackStats.innerHTML = statsHTML;
            trackInfo.classList.remove('hidden');
            trackInfo.classList.add('collapsed');
            toggleButton.textContent = '+';
            this.setupDownloadLink();
            this.updateElevationProfile();
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        const errorDiv = document.getElementById('error-message');
        errorDiv.classList.add('hidden');
    }

    hideTrackInfo() {
        const trackInfo = document.getElementById('track-info');
        trackInfo.classList.add('hidden');
    }

    toggleTrackInfo() {
        const trackInfo = document.getElementById('track-info');
        const toggleButton = document.getElementById('toggle-track-info');
        
        trackInfo.classList.toggle('collapsed');
        
        if (trackInfo.classList.contains('collapsed')) {
            toggleButton.textContent = '+';
        } else {
            toggleButton.textContent = '−';
            // Re-render elevation profile when expanding (if it was hidden)
            this.renderElevationProfile();
        }
    }

    setupDownloadLink() {
        const downloadLink = document.getElementById('download-gpx');
        if (this.currentTrackData && this.currentTrackData.rawGPXData) {
            const blob = new Blob([this.currentTrackData.rawGPXData], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            
            downloadLink.href = url;
            downloadLink.download = this.currentTrackData.fileName || 'track.gpx';
            
            // Clean up previous URLs to prevent memory leaks
            downloadLink.addEventListener('click', () => {
                setTimeout(() => URL.revokeObjectURL(url), 100);
            });
        }
    }

    async copyURL() {
        if (!this.currentTrackData || !this.currentTrackData.rawGPXData) return;
        
        const copyButton = document.getElementById('copy-url');
        const originalText = copyButton.textContent;
        
        try {
            // Encode GPX data as base64
            const base64Data = btoa(unescape(encodeURIComponent(this.currentTrackData.rawGPXData)));
            
            // Create the shareable URL
            const baseUrl = window.location.origin + window.location.pathname;
            const shareableUrl = `${baseUrl}#gpx=${base64Data}`;
            
            // Copy to clipboard
            await navigator.clipboard.writeText(shareableUrl);
            
            // Show success feedback
            copyButton.classList.add('copied');
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                Copied!
            `;
            
            // Reset after 2 seconds
            setTimeout(() => {
                copyButton.classList.remove('copied');
                copyButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy URL
                `;
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy URL:', error);
            // Show error feedback
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Failed
            `;
            
            setTimeout(() => {
                copyButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy URL
                `;
            }, 2000);
        }
    }

    updateElevationProfile() {
        if (!this.currentTrackData) return;
        
        // Only render if track info is expanded and elevation data exists
        if (!document.getElementById('track-info').classList.contains('collapsed') && 
            this.currentTrackData.hasElevationData()) {
            this.renderElevationProfile();
        } else if (!this.currentTrackData.hasElevationData()) {
            // Hide elevation profile if no elevation data
            document.getElementById('elevation-profile').classList.add('hidden');
        } else {
            // Show elevation section but don't render canvas until expanded
            document.getElementById('elevation-profile').classList.remove('hidden');
        }
    }

    renderElevationProfile() {
        if (!this.currentTrackData || !this.currentTrackData.hasElevationData()) {
            document.getElementById('elevation-profile').classList.add('hidden');
            return;
        }
        
        this.createElevationProfile(this.currentTrackData.elevationData);
    }

    createElevationProfile(elevationData) {
        try {
            const canvas = document.getElementById('elevation-canvas');
            const ctx = canvas.getContext('2d');
            const profileDiv = document.getElementById('elevation-profile');
            
            if (elevationData.length === 0) {
                profileDiv.classList.add('hidden');
                return;
            }
            
            profileDiv.classList.remove('hidden');
            
            // Set canvas size
            const width = canvas.width;
            const height = canvas.height;
            const padding = 20;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Find min/max elevations
            const elevations = elevationData.map(point => point.elevation);
            const minEle = Math.min(...elevations);
            const maxEle = Math.max(...elevations);
            const eleRange = maxEle - minEle;
            
            if (eleRange === 0) {
                profileDiv.classList.add('hidden');
                return;
            }
            
            // Draw background
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, width, height);
            
            // Draw grid lines
            ctx.strokeStyle = '#e9ecef';
            ctx.lineWidth = 1;
            
            // Horizontal grid lines
            for (let i = 1; i < 4; i++) {
                const y = padding + (height - 2 * padding) * i / 4;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }
            
            // Calculate points
            const graphWidth = width - 2 * padding;
            const graphHeight = height - 2 * padding;
            
            const points = elevationData.map((point, index) => ({
                x: padding + (graphWidth * index) / (elevationData.length - 1),
                y: padding + graphHeight - ((point.elevation - minEle) / eleRange) * graphHeight
            }));
            
            // Draw elevation line
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            
            ctx.stroke();
            
            // Fill area under the curve
            ctx.fillStyle = 'rgba(52, 152, 219, 0.1)';
            ctx.beginPath();
            ctx.moveTo(points[0].x, height - padding);
            ctx.lineTo(points[0].x, points[0].y);
            
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            
            ctx.lineTo(points[points.length - 1].x, height - padding);
            ctx.closePath();
            ctx.fill();
            
            // Draw elevation labels
            ctx.fillStyle = '#6c757d';
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'right';
            
            // Min elevation
            ctx.fillText(`${minEle.toFixed(0)}m`, width - padding - 5, height - padding - 5);
            
            // Max elevation
            ctx.fillText(`${maxEle.toFixed(0)}m`, width - padding - 5, padding + 12);
            
        } catch (error) {
            console.error('Error creating elevation profile:', error);
            document.getElementById('elevation-profile').classList.add('hidden');
        }
    }

}

document.addEventListener('DOMContentLoaded', () => {
    new GPXViewer();
});