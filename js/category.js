const EXPENSE_CATEGORIES = [
  { id: 'food', label: '식비', icon: '🍜', color: '#E8622C' },
  { id: 'transport', label: '교통', icon: '🚕', color: '#2F6F5E' },
  { id: 'lodging', label: '숙소', icon: '🏨', color: '#6C63B5' },
  { id: 'shopping', label: '쇼핑', icon: '🛍️', color: '#D64550' },
  { id: 'activity', label: '액티비티', icon: '🎫', color: '#3E8FB0' },
  { id: 'other', label: '기타', icon: '📦', color: '#8A8F98' },
];

const CATEGORY_KEYWORD_RULES = [
  { id: 'food', keywords: ['restaurant', 'cafe', 'coffee', 'food', 'kitchen', 'noodle', 'bakery', 'ร้านอาหาร', 'คาเฟ่', 'กาแฟ', 'ก๋วยเตี๋ยว', 'เบเกอรี่'] },
  { id: 'transport', keywords: ['grab', 'taxi', 'tuk', 'transport', 'fuel', 'gas station', 'แท็กซี่', 'เดินทาง', 'ปั๊มน้ำมัน'] },
  { id: 'lodging', keywords: ['hotel', 'resort', 'hostel', 'guesthouse', 'โรงแรม', 'ที่พัก', 'รีสอร์ท'] },
  { id: 'shopping', keywords: ['mart', 'market', 'shop', 'store', '7-eleven', 'supermarket', 'เซเว่น', 'ตลาด', 'ร้านค้า'] },
  { id: 'activity', keywords: ['tour', 'ticket', 'museum', 'temple', 'wat', 'ตั๋ว', 'ทัวร์', 'พิพิธภัณฑ์', 'วัด'] },
];

function getCategoryById(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

function guessCategoryFromText(text) {
  const lower = (text || '').toLowerCase();
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.id;
  }
  return 'other';
}

function guessAmountFromText(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const numberPattern = /\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?/g;
  const candidates = [];
  for (const line of lines) {
    const matches = line.match(numberPattern);
    if (!matches) continue;
    const isTotalLine = /total|รวม|net|grand/i.test(line);
    for (const m of matches) {
      const val = parseFloat(m.replace(/,/g, ''));
      if (!isNaN(val) && val > 0) candidates.push({ val, isTotalLine });
    }
  }
  if (!candidates.length) return null;
  const totals = candidates.filter(c => c.isTotalLine);
  const pool = totals.length ? totals : candidates;
  return Math.max(...pool.map(c => c.val));
}

function guessMemoFromText(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] || '';
}
