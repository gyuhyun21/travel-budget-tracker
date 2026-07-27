// Replace with an API key from Google Cloud Console (Maps JavaScript API +
// Places API enabled, HTTP referrer restricted to this site's domain and
// localhost). Place search degrades to manual entry (no crash) until a real
// key is set. See README for the full setup steps.
const GOOGLE_MAPS_API_KEY = 'AIzaSyAajdOsAEPZpLGA8yUYEBjWh4y6VXMcr2w';

let googleMapsReadyPromise = null;
let placesServiceInstance = null;

function isGoogleMapsConfigured() {
  return !GOOGLE_MAPS_API_KEY.startsWith('PLACEHOLDER');
}

function loadGoogleMapsSdk() {
  if (!isGoogleMapsConfigured()) return Promise.reject(new Error('GOOGLE_MAPS_KEY_NOT_SET'));
  if (googleMapsReadyPromise) return googleMapsReadyPromise;
  googleMapsReadyPromise = new Promise((resolve, reject) => {
    const callbackName = '__googleMapsSdkReady';
    window[callbackName] = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=${callbackName}`;
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SDK_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return googleMapsReadyPromise;
}

function getPlacesService() {
  if (!placesServiceInstance) {
    // PlacesService requires a Map or HTMLDivElement for attribution; it's
    // never attached to the page since we only use text search results.
    placesServiceInstance = new window.google.maps.places.PlacesService(document.createElement('div'));
  }
  return placesServiceInstance;
}

// Resolves to an array of { name, address, lat, lng, placeUrl, category }.
async function searchGooglePlaces(keyword) {
  await loadGoogleMapsSdk();
  return new Promise((resolve, reject) => {
    getPlacesService().textSearch({ query: keyword }, (results, status) => {
      const { OK, ZERO_RESULTS } = window.google.maps.places.PlacesServiceStatus;
      if (status === OK) {
        resolve(results.map(p => ({
          name: p.name,
          address: p.formatted_address || '',
          lat: p.geometry?.location?.lat(),
          lng: p.geometry?.location?.lng(),
          placeUrl: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
          category: (p.types || [])[0] || '',
        })));
      } else if (status === ZERO_RESULTS) {
        resolve([]);
      } else {
        reject(new Error('GOOGLE_PLACES_SEARCH_FAILED'));
      }
    });
  });
}
