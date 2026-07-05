function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  // div.innerHTML escapes &, <, > but NOT quote characters (text-node
  // serialization doesn't escape quotes). Since this helper is also used to
  // interpolate into HTML attributes (e.g. value="..."), quotes must be
  // escaped too, or a memo containing a `"` would still break out of the
  // attribute.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderSettingsScreen() {
  const settings = getSettings() || {};
  const isFirstRun = Object.keys(settings).length === 0;
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <h2>설정</h2>
    ${isFirstRun ? '<p class="banner-info" id="settings-first-run-banner">환영합니다! 여행 예산과 환율을 먼저 설정해주세요.</p>' : ''}
    <div class="card-section">
      <h3 class="section-title" style="margin-top:0">예산 &amp; 환율</h3>
      <form id="settings-form">
        <label class="field-label" for="input-total-budget">총 예산 (원)</label>
        <input type="number" id="input-total-budget" value="${settings.totalBudget ?? ''}" required>

        <label class="field-label" for="input-thb-rate">1바트(THB) = ? 원</label>
        <input type="number" id="input-thb-rate" value="${settings.thbRate ?? ''}" required>

        <label class="field-label" for="input-usd-rate">1달러(USD) = ? 원</label>
        <input type="number" id="input-usd-rate" value="${settings.usdRate ?? ''}" required>

        <label class="field-label" for="input-trip-start">여행 시작일</label>
        <input type="date" id="input-trip-start" value="${settings.tripStartDate ?? ''}" required>

        <label class="field-label" for="input-trip-end">여행 종료일</label>
        <input type="date" id="input-trip-end" value="${settings.tripEndDate ?? ''}" required>

        <button type="submit" class="btn-primary">저장</button>
      </form>
    </div>
    <div class="card-section">
      <h3 class="section-title" style="margin-top:0">데이터 백업</h3>
      <button id="btn-export" type="button" class="btn-export">JSON으로 내보내기</button>
      <label class="field-label field-file" for="input-import">JSON 불러오기</label>
      <input type="file" id="input-import" accept="application/json">
    </div>
    <p id="settings-message" class="banner-info" style="display:none"></p>
  `;
}

function renderDashboardScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-dashboard');
  if (!settings) {
    container.innerHTML = `
      <h2>대시보드</h2>
      <div class="empty-state">
        <div class="empty-icon">🧭</div>
        <div class="empty-text">먼저 설정 화면에서<br>예산과 환율을 입력해주세요.</div>
      </div>
    `;
    return;
  }
  const expenses = getExpenses();
  const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
  const remaining = Math.round(settings.totalBudget - totalSpent);
  const percent = settings.totalBudget > 0
    ? Math.min(100, Math.round((totalSpent / settings.totalBudget) * 100))
    : 0;
  const overBudget = remaining < 0;
  const ringColor = overBudget ? 'var(--color-danger)' : percent >= 80 ? 'var(--color-primary)' : 'var(--color-secondary)';
  const tripLabel = tripStatusLabel(settings);
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const byCategory = {};
  for (const e of expenses) {
    const catId = e.category || 'other';
    byCategory[catId] = (byCategory[catId] || 0) + (e.krwAmount || 0);
  }
  const categoryRows = EXPENSE_CATEGORIES
    .map(cat => ({ cat, amount: byCategory[cat.id] || 0 }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const maxCategoryAmount = Math.max(1, ...categoryRows.map(r => r.amount));

  container.innerHTML = `
    <h2>대시보드</h2>
    <p class="trip-pill">${tripLabel}</p>

    <div class="budget-ring" style="--pct:${percent}; --ring-color:${ringColor}">
      <div class="budget-ring-inner">
        <div class="ring-amount">${Math.abs(remaining).toLocaleString()}원</div>
        <div class="ring-label">${overBudget ? '예산 초과' : '남음'}</div>
        <div class="ring-pct">${percent}% 사용</div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-chip">
        <div class="stat-label">총 예산</div>
        <div class="stat-value">${settings.totalBudget.toLocaleString()}원</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">총 지출</div>
        <div class="stat-value">${Math.round(totalSpent).toLocaleString()}원</div>
      </div>
    </div>

    ${categoryRows.length ? `
      <h3 class="section-title">카테고리별 지출</h3>
      <div class="card-section">
        ${categoryRows.map(({ cat, amount }) => `
          <div class="category-row">
            <span class="cat-icon">${cat.icon}</span>
            <span class="cat-label">${cat.label}</span>
            <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${Math.round(amount / maxCategoryAmount * 100)}%; background:${cat.color}"></span></span>
            <span class="cat-amount">${Math.round(amount).toLocaleString()}원</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <h3 class="section-title">최근 지출</h3>
    ${recent.length
      ? recent.map(e => expenseCardHtml(e)).join('')
      : `<div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>오른쪽 아래 + 버튼으로 첫 지출을 기록해보세요.</div>
        </div>`}
  `;
}

function expenseCardHtml(e) {
  const cat = getCategoryById(e.category);
  return `
    <button class="expense-card expense-item" type="button" data-id="${e.id}">
      <span class="cat-badge" style="background:${cat.color}22">${cat.icon}</span>
      <span class="expense-info">
        <span class="expense-memo">${escapeHtml(e.memo || cat.label)}</span>
        <span class="expense-meta">${e.date} · ${cat.label}</span>
      </span>
      <span class="expense-amount">
        ${Math.round(e.krwAmount).toLocaleString()}원
        ${e.currency !== 'KRW' ? `<span class="original">${e.amount.toLocaleString()} ${e.currency}</span>` : ''}
      </span>
    </button>
  `;
}

function currencySegmentedHtml(selected) {
  const options = [
    { id: 'THB', label: '바트', icon: '🇹🇭' },
    { id: 'USD', label: '달러', icon: '💵' },
    { id: 'KRW', label: '원화', icon: '🇰🇷' },
  ];
  return options.map(o => `
    <button type="button" class="segmented-btn currency-btn ${o.id === selected ? 'active' : ''}" data-value="${o.id}">
      <span class="seg-icon">${o.icon}</span>${o.label}
    </button>
  `).join('');
}

function categorySegmentedHtml(selected) {
  return EXPENSE_CATEGORIES.map(c => `
    <button type="button" class="segmented-btn category-btn ${c.id === selected ? 'active' : ''}" data-value="${c.id}">
      <span class="seg-icon">${c.icon}</span>${c.label}
    </button>
  `).join('');
}

function renderExpenseFormScreen(editId = null) {
  const container = document.getElementById('screen-add-expense');
  const existing = editId ? getExpenseById(editId) : null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedCurrency = existing?.currency || 'THB';
  const selectedCategory = existing?.category || 'other';

  container.innerHTML = `
    <div class="screen-header">
      <h2>${existing ? '지출 수정' : '지출 추가'}</h2>
      <button type="button" class="btn-close" id="btn-close-expense-form">✕</button>
    </div>

    ${existing ? '' : `
      <button type="button" class="btn-receipt" id="btn-scan-receipt">📷 영수증으로 등록</button>
      <input type="file" id="input-receipt-photo" accept="image/*" capture="environment" style="display:none">
      <p class="ocr-status" id="ocr-status" style="display:none"></p>
    `}

    <div class="card-section">
      <form id="expense-form">
        <input type="hidden" id="input-expense-id" value="${existing ? existing.id : ''}">
        <input type="hidden" id="input-expense-currency" value="${selectedCurrency}">
        <input type="hidden" id="input-expense-category" value="${selectedCategory}">

        <label class="field-label" for="input-expense-date">날짜</label>
        <input type="date" id="input-expense-date" value="${existing ? existing.date : today}" required>

        <label class="field-label">통화</label>
        <div class="segmented" id="currency-segmented">${currencySegmentedHtml(selectedCurrency)}</div>

        <label class="field-label" for="input-expense-amount">금액</label>
        <input type="number" id="input-expense-amount" value="${existing ? existing.amount : ''}" required>

        <label class="field-label">카테고리</label>
        <div class="segmented" id="category-segmented">${categorySegmentedHtml(selectedCategory)}</div>

        <label class="field-label" for="input-expense-memo">메모</label>
        <input type="text" id="input-expense-memo" value="${existing ? escapeHtml(existing.memo || '') : ''}" placeholder="예: 팟타이 점심">

        <button type="submit" class="btn-primary">저장</button>
        ${existing ? '<button type="button" id="btn-delete-expense" class="btn-danger">삭제</button>' : ''}
      </form>
    </div>
    <p id="expense-form-message" class="banner-info banner-error" style="display:none"></p>
  `;
}

function renderExpenseListScreen() {
  const expenses = [...getExpenses()].sort((a, b) => b.date.localeCompare(a.date));
  const container = document.getElementById('screen-expense-list');
  container.innerHTML = `
    <h2>지출 목록</h2>
    ${expenses.length
      ? expenses.map(e => expenseCardHtml(e)).join('')
      : `<div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>오른쪽 아래 + 버튼으로 첫 지출을 기록해보세요.</div>
        </div>`}
  `;
}
