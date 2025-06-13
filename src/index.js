// Import CSS dependencies
import 'leaflet/dist/leaflet.css';
import '@raruto/leaflet-elevation/dist/leaflet-elevation.css';

// Import JS dependencies
import L from 'leaflet';
import * as d3 from 'd3';
import * as toGeoJSON from '@tmcw/togeojson';
import 'leaflet-geometryutil';
import 'leaflet-almostover';

// Make Leaflet, D3, and togeojson globally available
window.L = L;
window.d3 = d3;
window.toGeoJSON = toGeoJSON;

// Import the main elevation module
import '@raruto/leaflet-elevation';

// Patch the elevation control's import method to return bundled modules
const originalElevationImport = L.Control.Elevation.prototype.import;
L.Control.Elevation.prototype.import = function(src, condition) {
    if (Array.isArray(src)) {
        return Promise.all(src.map(m => this.import(m)));
    }
    
    // Check the built-in conditions first (like the original function)
    switch(src) {
        case this.__D3:          condition = typeof d3 !== 'object'; break;
        case this.__TOGEOJSON:   condition = typeof toGeoJSON !== 'object'; break;
        case this.__LGEOMUTIL:   condition = typeof L.GeometryUtil !== 'object'; break;
        case this.__LALMOSTOVER: condition = typeof L.Handler.AlmostOver  !== 'function'; break;
        case this.__LDISTANCEM:  condition = typeof L.DistanceMarkers  !== 'function'; break;
        case this.__LEDGESCALE:  condition = typeof L.Control.EdgeScale !== 'function'; break;
        case this.__LHOTLINE:    condition = typeof L.Hotline  !== 'function'; break;
    }
    
    // If condition is false, don't load (same as original)
    if (condition === false) {
        return Promise.resolve();
    }
    
    // Handle external CDN URLs by returning resolved promises since libraries are bundled
    if (src === this.__LGEOMUTIL || src.includes('leaflet-geometryutil')) {
        console.log('Skipping geometryutil import - already bundled');
        return Promise.resolve();
    }
    
    if (src === this.__LALMOSTOVER || src.includes('leaflet-almostover')) {
        console.log('Skipping almostover import - already bundled');
        return Promise.resolve();
    }
    
    // For handlers, components, and libs, use webpack dynamic imports instead of network requests
    const fileName = src.split('/').pop();
    if (fileName && src.includes('handlers/')) {
        console.log('Loading handler:', fileName);
        return import(`@raruto/leaflet-elevation/src/handlers/${fileName}`);
    }
    
    if (fileName && src.includes('components/')) {
        console.log('Loading component:', fileName);
        return import(`@raruto/leaflet-elevation/src/components/${fileName}`);
    }
    
    if (fileName && src.includes('libs/')) {
        console.log('Loading lib:', fileName);
        return import(`@raruto/leaflet-elevation/libs/${fileName}`);
    }
    
    // For everything else, fall back to original behavior
    return originalElevationImport.call(this, src, condition);
};

// // Fix leaflet default marker icons
// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
//   iconUrl: require('leaflet/dist/images/marker-icon.png'),
//   shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
// });


// Import and initialize the main app
import './styles.css';
import './app.js';