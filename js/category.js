const EXPENSE_CATEGORIES = [
  { id: 'food', label: '식비', icon: '🍜', color: '#E8622C' },
  { id: 'transport', label: '교통', icon: '🚕', color: '#2F6F5E' },
  { id: 'lodging', label: '숙소', icon: '🏨', color: '#6C63B5' },
  { id: 'shopping', label: '쇼핑', icon: '🛍️', color: '#D64550' },
  { id: 'activity', label: '액티비티', icon: '🎫', color: '#3E8FB0' },
  { id: 'other', label: '기타', icon: '📦', color: '#8A8F98' },
];

function getCategoryById(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
