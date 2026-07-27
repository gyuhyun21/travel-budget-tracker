const DOCUMENT_CATEGORIES = [
  { id: 'flight', label: '항공권', icon: '✈️' },
  { id: 'lodging', label: '숙소', icon: '🏨' },
  { id: 'transport', label: '교통·렌터카', icon: '🚗' },
  { id: 'insurance', label: '여행자보험', icon: '🛡️' },
  { id: 'ticket', label: '티켓·입장권', icon: '🎫' },
  { id: 'other', label: '기타', icon: '📄' },
];

const DOCUMENT_CATEGORY_KEYWORD_RULES = [
  { id: 'flight', keywords: ['e-ticket', 'eticket', 'boarding', 'itinerary', 'flight', 'airline', 'pnr', '항공권', '탑승', '항공사', '전자항공권'] },
  { id: 'lodging', keywords: ['hotel', 'reservation confirm', 'check-in', 'check in', 'booking.com', 'airbnb', 'guesthouse', 'resort', '호텔', '숙소', '체크인', '예약확인'] },
  { id: 'transport', keywords: ['rental car', 'rent a car', 'car hire', 'train ticket', 'railway', 'jr pass', '렌터카', '렌트카', '기차표', '열차'] },
  { id: 'insurance', keywords: ['insurance', 'policy number', 'coverage', '보험', '여행자보험', '보장'] },
  { id: 'ticket', keywords: ['admission', 'e-voucher', 'evoucher', 'attraction', 'museum ticket', 'theme park', '입장권', '티켓', '입장료'] },
];

function getDocumentCategoryById(id) {
  return DOCUMENT_CATEGORIES.find(c => c.id === id) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];
}

function guessDocumentCategoryFromText(text) {
  const lower = (text || '').toLowerCase();
  for (const rule of DOCUMENT_CATEGORY_KEYWORD_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.id;
  }
  return 'other';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

// Firestore documents cap out around 1MiB; images get resized/recompressed
// down toward this many base64 bytes so an upload reliably fits. PDFs and
// other non-image files are stored as-is and may be rejected if too large.
const DOCUMENT_MAX_DATA_URL_BYTES = 700 * 1024;

async function compressImageToDataUrl(file, maxBytes = DOCUMENT_MAX_DATA_URL_BYTES) {
  const original = await fileToDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    el.src = original;
  });

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  let quality = 0.85;
  let dataUrl = original;

  for (let attempt = 0; attempt < 6 && dataUrl.length > maxBytes; attempt++) {
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    quality = Math.max(0.5, quality - 0.1);
  }

  return dataUrl;
}
