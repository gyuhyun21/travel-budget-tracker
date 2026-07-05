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
