// Replace with the "JavaScript" key from a Kakao Developers app (Product
// settings > Platform > Web must whitelist this site's domain). Restaurant
// search degrades to manual entry (no crash) until a real key is set.
const KAKAO_JS_KEY = 'f454469d0a29176898ad01c5ca6a853a';

let kakaoReadyPromise = null;

function isKakaoMapConfigured() {
  return !KAKAO_JS_KEY.startsWith('PLACEHOLDER');
}

function loadKakaoMapsSdk() {
  if (!isKakaoMapConfigured()) return Promise.reject(new Error('KAKAO_KEY_NOT_SET'));
  if (kakaoReadyPromise) return kakaoReadyPromise;
  kakaoReadyPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('KAKAO_SDK_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return kakaoReadyPromise;
}

// Resolves to an array of { name, address, lat, lng, placeUrl, category }.
async function searchKakaoPlaces(keyword) {
  await loadKakaoMapsSdk();
  return new Promise((resolve, reject) => {
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(keyword, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        resolve(data.map(p => ({
          name: p.place_name,
          address: p.road_address_name || p.address_name,
          lat: p.y,
          lng: p.x,
          placeUrl: p.place_url,
          category: p.category_name,
        })));
      } else if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error('KAKAO_SEARCH_FAILED'));
      }
    });
  });
}
