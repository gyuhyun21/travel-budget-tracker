const DP_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function dpYmd(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dpParseYmd(str) {
  const [y, m, d] = str.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

function dpFormatKorean(dateStr) {
  const { month, day } = dpParseYmd(dateStr);
  return `${month + 1}월 ${day}일`;
}

function dpFormatRange(start, end) {
  if (!start || !end) return '여행 기간을 선택해주세요';
  return `${dpFormatKorean(start)} – ${dpFormatKorean(end)}`;
}

// Always returns a full 6-week (42-day) grid so the calendar height never
// shifts between months, including the trailing/leading days of adjacent
// months needed to fill the first and last rows.
function dpBuildMonthGrid(year, month) {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startDate = new Date(year, month, 1 - firstDayOfWeek);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push({
      dateStr: dpYmd(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
    });
  }
  return cells;
}
