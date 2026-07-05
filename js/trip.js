function tripStatusLabel(settings, today = new Date()) {
  if (!settings || !settings.tripStartDate || !settings.tripEndDate) {
    return '여행 일정 미설정';
  }
  const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const start = toDateOnly(new Date(settings.tripStartDate));
  const end = toDateOnly(new Date(settings.tripEndDate));
  const now = toDateOnly(today);
  const MS_PER_DAY = 86400000;

  if (now < start) {
    const days = Math.round((start - now) / MS_PER_DAY);
    return `여행 D-${days}`;
  }
  if (now > end) {
    return '여행 종료';
  }
  const dayNum = Math.round((now - start) / MS_PER_DAY) + 1;
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1;
  return `여행 ${dayNum}일차 / 총 ${totalDays}일`;
}
