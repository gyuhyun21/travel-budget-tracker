const MEAL_SLOTS = [
  { id: 'breakfast', label: '조식' },
  { id: 'lunch', label: '중식' },
  { id: 'dinner', label: '석식' },
  { id: 'snack', label: '간식' },
];

// Builds one entry per calendar day between tripStartDate and tripEndDate
// (inclusive), each carrying its 1-based day number for display (e.g. "2일차").
function buildTripDayList(tripStartDate, tripEndDate) {
  if (!tripStartDate || !tripEndDate) return [];
  const s = dpParseYmd(tripStartDate);
  const e = dpParseYmd(tripEndDate);
  const start = new Date(s.year, s.month, s.day);
  const end = new Date(e.year, e.month, e.day);
  const days = [];
  let cur = new Date(start);
  let dayNum = 1;
  while (cur <= end) {
    days.push({ date: dpYmd(cur.getFullYear(), cur.getMonth(), cur.getDate()), dayNum });
    cur.setDate(cur.getDate() + 1);
    dayNum++;
  }
  return days;
}

function todayYmd() {
  const now = new Date();
  return dpYmd(now.getFullYear(), now.getMonth(), now.getDate());
}
