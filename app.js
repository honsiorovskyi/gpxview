class GPXViewer {
    constructor() {
        this.map = null;
        this.currentGPXLayer = null;
        this.currentTrackData = null;
        this.elevationControl = null;
        this.init();
    }

    init() {
        this.initMap();
        this.initElevationControl();
        this.setupEventListeners();
        this.loadFromURL();
        this.loadSampleGPX();
    }

    initMap() {
        this.map = L.map('map').setView([50.0, 5.0], 5);
        
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
    }

    initElevationControl() {
        // Create elevation control once
        this.elevationControl = L.control.elevation({
            theme: "lime-theme",
            elevationDiv: "#elevation-chart",
            collapsed: false,
            detached: true,
            ruler: true,
            legend: true,
            summary: false,
            closeBtn: false,
            distanceMarkers: true,
            hotline: true,
        });
        

        // Setup chart resizing
        this.setupChartResize();

        // Patch hotline styling by overriding the _initHotLine method
        const originalInitHotLine = this.elevationControl._initHotLine;
        this.elevationControl._initHotLine = function(layer) {
            let prop = typeof this.options.hotline == 'string' ? this.options.hotline : 'elevation';
            return this.options.hotline ? this.import(this.__LHOTLINE)
                .then(() => {
                    layer.eachLayer((trkseg) => {
                        if (trkseg.feature.geometry.type != "Point") {
                            let geo = L.geoJson(trkseg.toGeoJSON(), { coordsToLatLng: (coords) => L.latLng(coords[0], coords[1], coords[2] * (this.options.altitudeFactor || 1))});
                            let line = L.hotline(geo.toGeoJSON().features[0].geometry.coordinates, {
                                renderer: L.Hotline.renderer(),
                                min: isFinite(this.track_info[prop + '_min']) ? this.track_info[prop + '_min'] : 0,
                                max: isFinite(this.track_info[prop + '_max']) ? this.track_info[prop + '_max'] : 1,
                                palette: {
                                    0.0: '#008800',
                                    0.5: '#ffff00',
                                    1.0: '#ff0000'
                                },
                                weight: 4,
                                outlineColor: '#000000',
                                outlineWidth: 2
                            }).addTo(this._hotline);
                            let alpha = trkseg.options.style && trkseg.options.style.opacity || 1;
                            trkseg.on('add remove', ({type}) => {
                                trkseg.setStyle({opacity: (type == 'add' ? 0 : alpha)});
                                line[(type == 'add' ? 'addTo' : 'removeFrom')](trkseg._map);
                                if (line._renderer) line._renderer._container.parentElement.insertBefore(line._renderer._container, line._renderer._container.parentElement.firstChild);
                            });
                        }
                    });
                }) : Promise.resolve();
        };

        // Add elevation control to map once
        this.elevationControl.addTo(this.map);

        // Setup event listeners for elevation control
        this.elevationControl.on('eledata_loaded', (e) => {
            const track = e.layer;
            if (track) {
                this.currentGPXLayer = track;
                this.map.fitBounds(track.getBounds(), { padding: [20, 20] });
                this.setupDownloadLink();
            }
        });
    }

    setupEventListeners() {
        const fileInput = document.getElementById('gpx-file');
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        const toggleButton = document.getElementById('toggle-track-info');
        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTrackInfo();
        });
        
        const expandButton = document.getElementById('expand-track-info');
        expandButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
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

    async loadSampleGPX() {
        // Only load sample if no URL hash is present
        if (window.location.hash) return;
        
        try {
            const response = await fetch('./sample.gpx');
            if (response.ok) {
                const gpxData = await response.text();
                this.loadGPX(gpxData, 'sample.gpx');
            }
        } catch (error) {
            console.log('Sample GPX not found or failed to load:', error);
        }
    }

    loadGPX(gpxData, fileName = 'track.gpx') {
        this.hideError();

        try {
            // Clear existing track data completely
            this.elevationControl.clear();
            if (this.elevationControl.layer) {
                this.elevationControl.layer.remove();
            }

            // Store GPX data for sharing/downloading
            this.currentTrackData = {
                rawGPXData: gpxData,
                fileName: fileName,
                elevationControl: this.elevationControl
            };

            // Load GPX data into existing elevation control
            this.elevationControl.load(gpxData);

        } catch (error) {
            this.showError('Error parsing GPX file: ' + error.message);
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

    toggleFullscreen() {
        const trackInfo = document.getElementById('track-info');
        const expandButton = document.getElementById('expand-track-info');
        
        if (!trackInfo.classList.contains('fullscreen')) {
            // Entering fullscreen - immediate transition
            trackInfo.classList.add('fullscreen');
            
            // Update expand button to show "minimize" icon
            expandButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 14h6v6"></path>
                    <path d="M20 10h-6V4"></path>
                    <path d="M14 10l7-7"></path>
                    <path d="M3 21l7-7"></path>
                </svg>
            `;
            expandButton.title = "Exit full screen";
            
            // Remove collapsed state if it was set
            trackInfo.classList.remove('collapsed');
            document.getElementById('toggle-track-info').textContent = '−';
        } else {
            // Update expand button to show "expand" icon
            expandButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
            `;
            expandButton.title = "Expand to full screen";

            trackInfo.classList.remove('fullscreen');
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

    setupChartResize() {
        const container = document.getElementById('elevation-chart');
        if (!container) return;

        // Setup ResizeObserver for dynamic resizing
        if (this.chartResizeObserver) {
            this.chartResizeObserver.disconnect();
        }

        this.chartResizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0 && this.elevationControl && this.elevationControl._chart) {
                    // Debounce resize calls
                    clearTimeout(this.resizeTimeout);
                    this.resizeTimeout = setTimeout(() => {
                        this.resizeChart();
                    }, 0);
                }
            }
        });

        this.chartResizeObserver.observe(container);

        // Trigger initial resize
        this.resizeChart()
    }

    resizeChart() {
        if (!this.elevationControl) return;

        const container = document.getElementById('elevation-chart');
        if (!container) return;



        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            console.log('Resizing elevation chart to:', rect.width, 'x', rect.height);

            // Update elevation control options
            this.elevationControl.options.width = rect.width;
            this.elevationControl.options.height = rect.height;
            
            // Use the plugin's built-in redraw method
            this.elevationControl.redraw();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GPXViewer();
});