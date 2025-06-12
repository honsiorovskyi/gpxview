class GPXViewer {
    constructor() {
        this.map = null;
        this.currentGPXLayer = null;
        this.currentGPXData = null;
        this.currentFileName = null;
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

        this.currentFileName = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.loadGPX(e.target.result);
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
                this.loadGPX(gpxData);
            } catch (error) {
                this.showError('Invalid GPX data in URL: ' + error.message);
            }
        }
    }

    loadGPX(gpxData) {
        this.hideError();
        this.hideTrackInfo();
        
        this.currentGPXData = gpxData;

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
                this.displayTrackInfo(gpx);
            });

            this.currentGPXLayer.on('error', (e) => {
                this.showError('Error loading GPX data: ' + e.err);
            });

            this.currentGPXLayer.addTo(this.map);

        } catch (error) {
            this.showError('Error parsing GPX file: ' + error.message);
        }
    }

    displayTrackInfo(gpx) {
        const trackInfo = document.getElementById('track-info');
        const trackStats = document.getElementById('track-stats');
        const toggleButton = document.getElementById('toggle-track-info');
        
        let statsHTML = '';
        
        if (gpx.get_distance) {
            const distance = gpx.get_distance();
            statsHTML += `<div><strong>Distance:</strong> ${(distance / 1000).toFixed(2)} km</div>`;
        }
        
        if (gpx.get_elevation_min && gpx.get_elevation_max) {
            const minEle = gpx.get_elevation_min();
            const maxEle = gpx.get_elevation_max();
            statsHTML += `<div><strong>Min Elevation:</strong> ${minEle.toFixed(0)} m</div>`;
            statsHTML += `<div><strong>Max Elevation:</strong> ${maxEle.toFixed(0)} m</div>`;
            
            if (gpx.get_elevation_gain) {
                const gain = gpx.get_elevation_gain();
                statsHTML += `<div><strong>Elevation Gain:</strong> ${gain.toFixed(0)} m</div>`;
            }
        }
        
        if (gpx.get_moving_time) {
            const movingTime = gpx.get_moving_time();
            const hours = Math.floor(movingTime / 3600);
            const minutes = Math.floor((movingTime % 3600) / 60);
            if (hours > 0) {
                statsHTML += `<div><strong>Moving Time:</strong> ${hours}h ${minutes}m</div>`;
            } else {
                statsHTML += `<div><strong>Moving Time:</strong> ${minutes}m</div>`;
            }
        }

        const waypoints = gpx.get_waypoints ? gpx.get_waypoints() : [];
        if (waypoints.length > 0) {
            statsHTML += `<div><strong>Waypoints:</strong> ${waypoints.length}</div>`;
        }

        if (statsHTML) {
            trackStats.innerHTML = statsHTML;
            trackInfo.classList.remove('hidden');
            trackInfo.classList.add('collapsed');
            toggleButton.textContent = '+';
            this.setupDownloadLink();
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
        }
    }

    setupDownloadLink() {
        const downloadLink = document.getElementById('download-gpx');
        if (this.currentGPXData) {
            const blob = new Blob([this.currentGPXData], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            
            downloadLink.href = url;
            downloadLink.download = this.currentFileName || 'track.gpx';
            
            // Clean up previous URLs to prevent memory leaks
            downloadLink.addEventListener('click', () => {
                setTimeout(() => URL.revokeObjectURL(url), 100);
            });
        }
    }

    async copyURL() {
        if (!this.currentGPXData) return;
        
        const copyButton = document.getElementById('copy-url');
        const originalText = copyButton.textContent;
        
        try {
            // Encode GPX data as base64
            const base64Data = btoa(unescape(encodeURIComponent(this.currentGPXData)));
            
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
}

document.addEventListener('DOMContentLoaded', () => {
    new GPXViewer();
});