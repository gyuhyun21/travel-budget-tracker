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

// Shrinks a money label's font size in steps as its text gets longer, so
// large amounts (e.g. eight-digit budgets) stay inside their fixed-width
// container instead of overflowing it.
function fitFontSize(text, thresholds) {
  for (const [maxLen, size] of thresholds) {
    if (text.length <= maxLen) return `${size}px`;
  }
  return `${thresholds[thresholds.length - 1][1]}px`;
}

function renderSettingsScreen() {
  const settings = getSettings() || {};
  const isFirstRun = Object.keys(settings).length === 0;
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">설정</h1></div>
    ${isFirstRun ? '<p class="banner-info" id="settings-first-run-banner">환영합니다! 제목과 예산, 환율을 먼저 설정해주세요.</p>' : ''}
    <h3 class="section-title">제목 &amp; 기간</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <form id="settings-form">
          <label class="field-label" style="margin-top:0" for="input-trip-name">제목</label>
          <input type="text" id="input-trip-name" value="${escapeHtml(settings.tripName ?? '')}" placeholder="예: 치앙마이 여행, 팀 워크샵">

          <label class="field-label" for="input-total-budget">총 예산 (원)</label>
          <input type="text" inputmode="decimal" class="input-money" id="input-total-budget" value="${formatMoneyValue(settings.totalBudget)}" required>

          <label class="field-label" for="input-thb-rate">1바트(THB) = ? 원</label>
          <input type="text" inputmode="decimal" class="input-money" id="input-thb-rate" value="${formatMoneyValue(settings.thbRate ?? DEFAULT_THB_RATE)}" required>
          ${isFirstRun ? '<p class="field-hint">참고용 기준 환율이에요. 실제 환율에 맞게 확인·수정해주세요.</p>' : ''}

          <label class="field-label" for="input-usd-rate">1달러(USD) = ? 원</label>
          <input type="text" inputmode="decimal" class="input-money" id="input-usd-rate" value="${formatMoneyValue(settings.usdRate ?? DEFAULT_USD_RATE)}" required>
          ${isFirstRun ? '<p class="field-hint">참고용 기준 환율이에요. 실제 환율에 맞게 확인·수정해주세요.</p>' : ''}

          <label class="field-label" for="input-trip-start">시작일</label>
          <input type="date" id="input-trip-start" value="${settings.tripStartDate ?? ''}" required>

          <label class="field-label" for="input-trip-end">종료일</label>
          <input type="date" id="input-trip-end" value="${settings.tripEndDate ?? ''}" required>

          <button type="submit" class="btn-primary">저장</button>
        </form>
      </div>
    </div>

    <h3 class="section-title">데이터 백업</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <button id="btn-export" type="button" class="btn-export">JSON으로 내보내기</button>
        <label class="field-label field-file" for="input-import">JSON 불러오기</label>
        <input type="file" id="input-import" accept="application/json">
      </div>
    </div>

    ${isFirstRun ? '' : `
      <h3 class="section-title">새 여행 준비</h3>
      <div class="card-section">
        <div class="card-section-pad">
          <p class="field-hint" style="margin:0 0 12px">지금까지의 예산과 지출 기록을 모두 지우고, 다음 여행을 위해 처음부터 다시 설정해요. 필요하면 먼저 위에서 JSON으로 백업해두세요.</p>
          <button id="btn-reset-data" type="button" class="btn-danger">예산 &amp; 지출 초기화</button>
        </div>
      </div>
    `}
    <p id="settings-message" class="banner-info" style="display:none"></p>
  `;
}

function renderDashboardScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-dashboard');
  if (!settings) {
    container.innerHTML = `
      <div class="ios-header"><h1 class="ios-large-title">대시보드</h1></div>
      <div class="empty-state">
        <div class="empty-icon">${ICON_INFO}</div>
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
  const ringColor = overBudget ? 'var(--color-danger)' : percent >= 80 ? 'var(--color-warning)' : 'var(--color-success)';
  const tripLabel = tripStatusLabel(settings);
  const tripName = settings.tripName?.trim();
  document.title = tripName ? `${tripName} 가계부` : '여행 가계부';
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

  const ringAmountText = `${Math.abs(remaining).toLocaleString()}원`;
  const ringFontSize = fitFontSize(ringAmountText, [[8, 20], [10, 17], [12, 15], [15, 12]]);
  const totalBudgetText = `${settings.totalBudget.toLocaleString()}원`;
  const totalSpentText = `${Math.round(totalSpent).toLocaleString()}원`;
  const statFontSize = (text) => fitFontSize(text, [[10, 17], [12, 14], [15, 12]]);

  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">${tripName ? escapeHtml(tripName) : '대시보드'}</h1>
      <button type="button" class="ios-header-action" id="btn-add-expense" aria-label="지출 추가">${ICON_PLUS}</button>
    </div>
    <p class="trip-pill">${tripLabel}</p>

    <div class="budget-ring" style="--pct:${percent}; --ring-color:${ringColor}">
      <div class="budget-ring-inner">
        <div class="ring-amount" style="font-size:${ringFontSize}">${ringAmountText}</div>
        <div class="ring-label">${overBudget ? '예산 초과' : '남음'}</div>
        <div class="ring-pct">${percent}% 사용</div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-chip">
        <div class="stat-label">총 예산</div>
        <div class="stat-value" style="font-size:${statFontSize(totalBudgetText)}">${totalBudgetText}</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">총 지출</div>
        <div class="stat-value" style="font-size:${statFontSize(totalSpentText)}">${totalSpentText}</div>
      </div>
    </div>

    ${categoryRows.length ? `
      <h3 class="section-title">카테고리별 지출</h3>
      <div class="card-section">
        ${categoryRows.map(({ cat, amount }) => `
          <div class="category-row">
            <span class="cat-dot" style="background:${cat.color}"></span>
            <span class="cat-label">${cat.label}</span>
            <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${Math.round(amount / maxCategoryAmount * 100)}%; background:${cat.color}"></span></span>
            <span class="cat-amount">${Math.round(amount).toLocaleString()}원</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <h3 class="section-title">최근 지출</h3>
    ${recent.length
      ? `<div class="card-section">${recent.map(e => expenseCardHtml(e)).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${ICON_RECEIPT}</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>오른쪽 위 + 버튼으로 첫 지출을 기록해보세요.</div>
        </div>`}
  `;
}

function expenseCardHtml(e) {
  const cat = getCategoryById(e.category);
  const [, month, day] = e.date.split('-');
  return `
    <button class="expense-card expense-item" type="button" data-id="${e.id}">
      <span class="expense-date-col">
        <span class="expense-date-day">${day}</span>
        <span class="expense-date-month">${Number(month)}월</span>
      </span>
      <span class="cat-dot" style="background:${cat.color}"></span>
      <span class="expense-info">
        <span class="expense-memo">${escapeHtml(e.memo || cat.label)}</span>
        <span class="expense-meta">${cat.label}</span>
      </span>
      <span class="expense-amount">
        ${Math.round(e.krwAmount).toLocaleString()}원
        ${e.currency !== 'KRW' ? `<span class="original">${e.amount.toLocaleString()} ${e.currency}</span>` : ''}
      </span>
      <span class="chevron">${ICON_CHEVRON}</span>
    </button>
  `;
}

function currencySegmentedHtml(selected) {
  const options = [
    { id: 'THB', label: '바트' },
    { id: 'USD', label: '달러' },
    { id: 'KRW', label: '원화' },
  ];
  const index = Math.max(0, options.findIndex(o => o.id === selected));
  return `
    <div class="ios-segment-thumb" style="--count:${options.length}; --index:${index}"></div>
    ${options.map(o => `
      <button type="button" class="ios-segment-btn currency-btn ${o.id === selected ? 'active' : ''}" data-value="${o.id}">${o.label}</button>
    `).join('')}
  `;
}

function categorySegmentedHtml(selected) {
  return EXPENSE_CATEGORIES.map(c => `
    <button type="button" class="ios-chip category-btn ${c.id === selected ? 'active' : ''}" data-value="${c.id}">
      <span class="chip-dot" style="background:${c.id === selected ? '#fff' : c.color}"></span>${c.label}
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
    <div class="ios-header">
      <h1 class="ios-large-title">${existing ? '지출 수정' : '지출 추가'}</h1>
      <button type="button" class="ios-header-link" id="btn-close-expense-form">취소</button>
    </div>

    ${existing ? '' : `
      <button type="button" class="btn-receipt" id="btn-scan-receipt">${ICON_CAMERA} 영수증으로 등록</button>
      <input type="file" id="input-receipt-photo" accept="image/*" capture="environment" style="display:none">
      <p class="ocr-status" id="ocr-status" style="display:none"></p>
    `}

    <div class="card-section">
      <div class="card-section-pad">
        <form id="expense-form">
          <input type="hidden" id="input-expense-id" value="${existing ? existing.id : ''}">
          <input type="hidden" id="input-expense-currency" value="${selectedCurrency}">
          <input type="hidden" id="input-expense-category" value="${selectedCategory}">

          <label class="field-label" style="margin-top:0" for="input-expense-date">날짜</label>
          <input type="date" id="input-expense-date" value="${existing ? existing.date : today}" required>

          <label class="field-label">통화</label>
          <div class="ios-segment" id="currency-segmented">${currencySegmentedHtml(selectedCurrency)}</div>

          <label class="field-label" for="input-expense-amount">금액</label>
          <input type="text" inputmode="decimal" class="input-money" id="input-expense-amount" value="${existing ? formatMoneyValue(existing.amount) : ''}" required>

          <label class="field-label">카테고리</label>
          <div class="ios-chip-row" id="category-segmented">${categorySegmentedHtml(selectedCategory)}</div>

          <label class="field-label" for="input-expense-memo">메모</label>
          <input type="text" id="input-expense-memo" value="${existing ? escapeHtml(existing.memo || '') : ''}" placeholder="예: 팟타이 점심">

          <button type="submit" class="btn-primary">저장</button>
          ${existing ? '<button type="button" id="btn-delete-expense" class="btn-danger">삭제</button>' : ''}
        </form>
      </div>
    </div>
    <p id="expense-form-message" class="banner-info banner-error" style="display:none"></p>
  `;
}

function renderExpenseListScreen() {
  const expenses = [...getExpenses()].sort((a, b) => b.date.localeCompare(a.date));
  const container = document.getElementById('screen-expense-list');
  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">지출 목록</h1>
      <button type="button" class="ios-header-action" id="btn-add-expense" aria-label="지출 추가">${ICON_PLUS}</button>
    </div>
    ${expenses.length
      ? `<div class="card-section">${expenses.map(e => expenseCardHtml(e)).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${ICON_RECEIPT}</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>오른쪽 위 + 버튼으로 첫 지출을 기록해보세요.</div>
        </div>`}
  `;
}
