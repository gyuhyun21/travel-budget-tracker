function renderSettingsScreen() {
  const settings = getSettings() || {};
  const isFirstRun = Object.keys(settings).length === 0;
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <h2>설정</h2>
    <form id="settings-form">
      <label>총 예산 (원)
        <input type="number" id="input-total-budget" value="${settings.totalBudget ?? ''}" required>
      </label>
      <label>1바트(THB) = ? 원
        <input type="number" id="input-thb-rate" value="${settings.thbRate ?? ''}" required>
      </label>
      <label>1달러(USD) = ? 원
        <input type="number" id="input-usd-rate" value="${settings.usdRate ?? ''}" required>
      </label>
      <label>여행 시작일
        <input type="date" id="input-trip-start" value="${settings.tripStartDate ?? ''}" required>
      </label>
      <label>여행 종료일
        <input type="date" id="input-trip-end" value="${settings.tripEndDate ?? ''}" required>
      </label>
      <button type="submit">저장</button>
    </form>
    <hr>
    <h3>데이터 백업</h3>
    <button id="btn-export" type="button">JSON으로 내보내기</button>
    <label>JSON 불러오기
      <input type="file" id="input-import" accept="application/json">
    </label>
    <p id="settings-message">${isFirstRun ? '최초 실행: 예산과 환율을 설정해주세요.' : ''}</p>
  `;
}

function renderDashboardScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-dashboard');
  if (!settings) {
    container.innerHTML = `<h2>대시보드</h2><p>먼저 설정 화면에서 예산과 환율을 입력해주세요.</p>`;
    return;
  }
  const expenses = getExpenses();
  const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
  const remaining = settings.totalBudget - totalSpent;
  const percent = settings.totalBudget > 0
    ? Math.min(100, Math.round((totalSpent / settings.totalBudget) * 100))
    : 0;
  const tripLabel = tripStatusLabel(settings);
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  container.innerHTML = `
    <h2>대시보드</h2>
    <p class="trip-status">${tripLabel}</p>
    <p>총 예산: ${settings.totalBudget.toLocaleString()}원</p>
    <p>총 지출: ${totalSpent.toLocaleString()}원</p>
    <p>남은 예산: ${remaining.toLocaleString()}원</p>
    <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
    <p>${percent}% 사용</p>
    <h3>최근 지출</h3>
    <ul id="recent-expense-list">
      ${recent.length
        ? recent.map(e => `<li>${e.date} · ${e.amount.toLocaleString()} ${e.currency} (${Math.round(e.krwAmount).toLocaleString()}원) - ${e.memo || ''}</li>`).join('')
        : '<li>지출 내역이 없습니다.</li>'}
    </ul>
  `;
}
