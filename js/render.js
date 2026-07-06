// Which category tab is selected in the dashboard's expense list filter.
// Resets to 'all' whenever the previously selected category no longer has
// any expenses (see renderDashboardScreen).
let dashboardCategoryFilter = 'all';

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

function renderShareSectionBody() {
  if (isSharedMode()) {
    const link = shareUrlForTrip(getSharedTripId());
    const tripName = getSettings()?.tripName?.trim();
    const shareTitle = tripName ? `${tripName} 가계부` : '여행 가계부';
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    return `
      <span class="share-badge"><span class="dot"></span>실시간 공유 중</span>
      <p class="field-hint" style="margin:0 0 10px">이 링크가 있는 사람은 누구나 같이 보고 편집할 수 있어요.</p>
      <div class="share-link-box">
        <span>${escapeHtml(link)}</span>
        <button type="button" id="btn-copy-share-link" data-link="${escapeHtml(link)}" data-title="${escapeHtml(shareTitle)}">${canNativeShare ? '공유' : '복사'}</button>
      </div>
      <button type="button" id="btn-stop-sharing" class="btn-danger">공유 중지 (이 기기만 로컬로 전환)</button>
    `;
  }
  return `
    <p class="field-hint" style="margin:0 0 12px">링크를 만들어서 같이 여행하는 사람과 예산/지출을 실시간으로 같이 보고 편집할 수 있어요.</p>
    <button type="button" id="btn-start-sharing" class="btn-primary" style="margin-top:0">이 여행 공유하기</button>
  `;
}

function renderSettingsScreen() {
  const settings = getSettings() || {};
  const isFirstRun = Object.keys(settings).length === 0;
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">설정</h1></div>
    ${isFirstRun ? '<p class="banner-info" id="settings-first-run-banner">환영합니다! 제목과 예산, 환율을 먼저 설정해주세요.</p>' : ''}

    <h3 class="section-title">내 정보</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <form id="username-form">
          <label class="field-label" style="margin-top:0" for="input-settings-user-name">내 이름</label>
          <input type="text" id="input-settings-user-name" value="${escapeHtml(getUserName())}" placeholder="이름 또는 닉네임">
          <button type="submit" class="btn-primary" style="margin-top:14px">이름 저장</button>
        </form>
      </div>
    </div>

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

          <label class="field-label" for="btn-open-daterange">여행 기간</label>
          <button type="button" class="date-range-field" id="btn-open-daterange">
            <span id="date-range-display">${dpFormatRange(settings.tripStartDate, settings.tripEndDate)}</span>
          </button>
          <input type="hidden" id="input-trip-start" value="${settings.tripStartDate ?? ''}">
          <input type="hidden" id="input-trip-end" value="${settings.tripEndDate ?? ''}">

          <button type="submit" class="btn-primary">저장</button>
        </form>
      </div>
    </div>

    ${isFirstRun ? '' : `
      <h3 class="section-title">공유</h3>
      <div class="card-section">
        <div class="card-section-pad">
          ${renderShareSectionBody()}
        </div>
      </div>
    `}

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
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

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

  if (dashboardCategoryFilter !== 'all' && !categoryRows.some(r => r.cat.id === dashboardCategoryFilter)) {
    dashboardCategoryFilter = 'all';
  }
  const listToShow = dashboardCategoryFilter === 'all'
    ? sortedExpenses.slice(0, 5)
    : sortedExpenses.filter(e => (e.category || 'other') === dashboardCategoryFilter);
  const listTitle = dashboardCategoryFilter === 'all'
    ? '최근 지출'
    : `${getCategoryById(dashboardCategoryFilter).label} 지출`;

  const ringAmountText = `${Math.abs(remaining).toLocaleString()}원`;
  const ringFontSize = fitFontSize(ringAmountText, [[8, 20], [10, 17], [12, 15], [15, 12]]);
  const totalBudgetText = `${settings.totalBudget.toLocaleString()}원`;
  const totalSpentText = `${Math.round(totalSpent).toLocaleString()}원`;
  const statFontSize = (text) => fitFontSize(text, [[10, 17], [12, 14], [15, 12]]);

  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">${tripName ? escapeHtml(tripName) : '대시보드'}</h1>
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

    <button type="button" class="btn-primary btn-add-main" id="btn-add-expense">
      <span class="btn-icon-inline">${ICON_PLUS}</span>지출 추가
    </button>

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

    <h3 class="section-title">${listTitle}</h3>
    ${categoryRows.length ? `
      <div class="ios-chip-row" id="dashboard-category-filter" style="margin-bottom:12px">
        <button type="button" class="ios-chip filter-tab ${dashboardCategoryFilter === 'all' ? 'active' : ''}" data-value="all">전체</button>
        ${categoryRows.map(({ cat }) => `
          <button type="button" class="ios-chip filter-tab ${dashboardCategoryFilter === cat.id ? 'active' : ''}" data-value="${cat.id}">
            <span class="chip-dot" style="background:${dashboardCategoryFilter === cat.id ? '#fff' : cat.color}"></span>${cat.label}
          </button>
        `).join('')}
      </div>
    ` : ''}
    ${listToShow.length
      ? `<div class="card-section">${listToShow.map(e => expenseCardHtml(e)).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${ICON_RECEIPT}</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>위의 + 지출 추가 버튼으로 첫 지출을 기록해보세요.</div>
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
        <span class="expense-meta">${cat.label}${e.addedBy ? ` · ${escapeHtml(e.addedBy)}` : ''}</span>
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

function renderDateRangeSheet(state) {
  const container = document.getElementById('daterange-body');
  const cells = dpBuildMonthGrid(state.year, state.month);
  const monthLabel = `${state.year}년 ${state.month + 1}월`;

  container.innerHTML = `
    <div class="dp-header">
      <button type="button" class="dp-nav" id="dp-prev"><span style="display:inline-block;transform:scaleX(-1)">${ICON_CHEVRON}</span></button>
      <span class="dp-month-label">${monthLabel}</span>
      <button type="button" class="dp-nav" id="dp-next">${ICON_CHEVRON}</button>
    </div>
    <div class="dp-weekdays">${DP_WEEKDAY_LABELS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="dp-grid">
      ${cells.map(c => {
        const isStart = c.dateStr === state.start;
        const isEnd = c.dateStr === state.end;
        const inRange = state.start && state.end && c.dateStr > state.start && c.dateStr < state.end;
        const classes = ['dp-day'];
        if (!c.inMonth) classes.push('dp-muted');
        if (isStart) classes.push('dp-start');
        if (isEnd) classes.push('dp-end');
        if (inRange) classes.push('dp-in-range');
        return `<button type="button" class="${classes.join(' ')}" data-date="${c.dateStr}">${c.day}</button>`;
      }).join('')}
    </div>
    <div class="dp-summary">${dpFormatRange(state.start, state.end)}</div>
    <button type="button" class="btn-primary" id="dp-confirm" ${state.start && state.end ? '' : 'disabled'}>확인</button>
  `;
}

// Which day tab is showing in the 뭐먹? screen. Reset to null so the first
// render picks today (if it's within the trip) or the trip's first day.
let mealPlanSelectedDate = null;

function renderMealPlanScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-meals');
  if (!settings || !settings.tripStartDate || !settings.tripEndDate) {
    container.innerHTML = `
      <div class="ios-header"><h1 class="ios-large-title">뭐먹?</h1></div>
      <div class="empty-state">
        <div class="empty-icon">${ICON_INFO}</div>
        <div class="empty-text">먼저 설정 화면에서<br>여행 기간을 입력해주세요.</div>
      </div>
    `;
    return;
  }

  const days = buildTripDayList(settings.tripStartDate, settings.tripEndDate);
  if (!mealPlanSelectedDate || !days.some(d => d.date === mealPlanSelectedDate)) {
    const today = todayYmd();
    mealPlanSelectedDate = days.some(d => d.date === today) ? today : days[0]?.date;
  }

  const meals = getMeals();

  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">뭐먹?</h1></div>
    <div class="ios-chip-row" id="meal-day-tabs" style="margin-bottom:16px">
      ${days.map(d => {
        const [, m, day] = d.date.split('-');
        return `<button type="button" class="ios-chip meal-day-tab ${d.date === mealPlanSelectedDate ? 'active' : ''}" data-date="${d.date}">${d.dayNum}일차 (${Number(m)}/${Number(day)})</button>`;
      }).join('')}
    </div>
    ${MEAL_SLOTS.map(slot => {
      const entries = meals.filter(m => m.date === mealPlanSelectedDate && m.slot === slot.id);
      return `
        <h3 class="section-title">${slot.label}</h3>
        <div class="card-section">
          ${entries.length ? entries.map(m => mealEntryHtml(m)).join('') : '<div class="card-section-pad"><p class="field-hint" style="margin:0">아직 추천이 없어요.</p></div>'}
          <button type="button" class="meal-add-row" data-date="${mealPlanSelectedDate}" data-slot="${slot.id}">${ICON_PLUS} 추가</button>
        </div>
      `;
    }).join('')}
  `;
}

function mealEntryHtml(m) {
  return `
    <div class="meal-entry">
      <div class="meal-entry-info">
        <div class="meal-entry-name">${escapeHtml(m.name)}</div>
        ${m.address ? `<div class="meal-entry-address">${escapeHtml(m.address)}</div>` : ''}
        ${m.memo ? `<div class="meal-entry-memo">${escapeHtml(m.memo)}</div>` : ''}
        ${m.suggestedBy ? `<div class="meal-entry-by">${escapeHtml(m.suggestedBy)} 추천</div>` : ''}
      </div>
      ${m.placeUrl ? `<button type="button" class="meal-map-btn" data-url="${escapeHtml(m.placeUrl)}">지도</button>` : ''}
      <button type="button" class="meal-delete-btn" data-id="${m.id}" aria-label="삭제">✕</button>
    </div>
  `;
}

function renderMealAddSheetBody(state) {
  const container = document.getElementById('meal-add-body');
  const slotLabel = MEAL_SLOTS.find(s => s.id === state.slot)?.label ?? '';
  document.getElementById('meal-add-title').textContent = `${slotLabel} 추가`;
  const isRestaurant = (state.mode || 'restaurant') === 'restaurant';

  container.innerHTML = `
    <div class="ios-segment" id="meal-mode-segment" style="margin-bottom:16px">
      <div class="ios-segment-thumb" style="--count:2; --index:${isRestaurant ? 0 : 1}"></div>
      <button type="button" class="ios-segment-btn meal-mode-btn ${isRestaurant ? 'active' : ''}" data-mode="restaurant">식당</button>
      <button type="button" class="ios-segment-btn meal-mode-btn ${isRestaurant ? '' : 'active'}" data-mode="menu">메뉴만 (캠핑 등)</button>
    </div>

    ${isRestaurant ? (isKakaoMapConfigured() ? `
      <label class="field-label">식당 검색 (카카오맵)</label>
      <input type="text" id="input-meal-search" placeholder="식당 이름으로 검색" autocomplete="off">
      <div id="meal-search-results"></div>
    ` : `
      <p class="field-hint" style="margin:0 0 12px">카카오맵 연동 준비 중이에요. 식당 이름은 아래에 직접 입력해주세요.</p>
    `) : ''}

    ${isRestaurant && state.selectedPlace ? `
      <div class="meal-selected-place">
        <div class="meal-selected-place-name">${escapeHtml(state.selectedPlace.name)}</div>
        <div class="meal-selected-place-address">${escapeHtml(state.selectedPlace.address || '')}</div>
      </div>
    ` : ''}

    <label class="field-label" for="input-meal-name">${isRestaurant ? '식당 이름' : '메뉴/음식 이름'}</label>
    <input type="text" id="input-meal-name" placeholder="${isRestaurant ? '예: OO식당' : '예: 김치찌개, 라면'}" value="${escapeHtml((isRestaurant ? state.selectedPlace?.name : null) ?? state.name ?? '')}">

    <label class="field-label" for="input-meal-memo">메모 (선택)</label>
    <input type="text" id="input-meal-memo" placeholder="예: 팟타이 추천" value="${escapeHtml(state.memo ?? '')}">

    <label class="field-label" for="input-meal-suggester">추천인 (선택)</label>
    <input type="text" id="input-meal-suggester" placeholder="이름" value="${escapeHtml(state.suggestedBy ?? '')}">

    <button type="button" class="btn-primary" id="btn-save-meal">추가</button>
  `;
}

function mealSearchResultsHtml(results) {
  if (!results) return '';
  if (results.length === 0) {
    return '<p class="field-hint" style="margin:6px 0 0">검색 결과가 없어요.</p>';
  }
  return `
    <div class="meal-search-results">
      ${results.map((p, i) => `
        <button type="button" class="meal-search-result" data-index="${i}">
          <span class="meal-search-result-name">${escapeHtml(p.name)}</span>
          <span class="meal-search-result-address">${escapeHtml(p.address || '')}</span>
        </button>
      `).join('')}
    </div>
  `;
}

const UNASSIGNED_LABEL = '미정';

function renderPackingScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-packing');
  const participants = settings?.packingParticipants || [];
  const items = getPackingItems();
  const doneCount = items.filter(i => i.checked).length;

  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">준비물</h1></div>
    ${items.length ? `<p class="trip-pill">${doneCount} / ${items.length} 준비완료</p>` : ''}

    <div class="ios-chip-row" id="packing-participants-row" style="margin-bottom:14px">
      ${participants.map(p => `<span class="ios-chip packing-participant-chip">${escapeHtml(p)}</span>`).join('')}
      <button type="button" class="ios-chip" id="btn-manage-participants">${ICON_PLUS} 참여자 관리</button>
    </div>

    <button type="button" class="btn-primary btn-add-main" id="btn-add-packing-item">
      <span class="btn-icon-inline">${ICON_PLUS}</span>준비물 추가
    </button>

    ${renderPackingTable(participants, items)}
  `;
}

function renderPackingTable(participants, items) {
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICON_BAG}</div>
        <div class="empty-text">아직 준비물이 없어요.<br>위의 + 준비물 추가 버튼으로 등록해보세요.</div>
      </div>
    `;
  }
  const columns = [...participants, UNASSIGNED_LABEL];
  return `
    <div class="packing-table-wrap">
      <table class="packing-table">
        <thead>
          <tr>
            <th class="packing-corner"></th>
            ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${items.map(item => packingTableRowHtml(item, columns)).join('')}
        </tbody>
      </table>
    </div>
    <p class="field-hint" style="margin:8px 2px 0">준비물 이름을 탭하면 수정·삭제, 담당자 칸을 탭하면 그 사람에게 배정돼요. 이미 배정된 칸을 다시 탭하면 준비완료로 체크돼요.</p>
  `;
}

function packingTableRowHtml(item, columns) {
  const currentAssignee = item.assignee || UNASSIGNED_LABEL;
  return `
    <tr>
      <th class="packing-row-header" data-id="${item.id}">
        <span class="packing-row-name">${escapeHtml(item.name)}</span>
        ${item.memo ? `<span class="packing-row-memo">${escapeHtml(item.memo)}</span>` : ''}
      </th>
      ${columns.map(col => {
        const isAssigned = currentAssignee === col;
        const cellClass = isAssigned ? (col === UNASSIGNED_LABEL ? 'packing-cell-unassigned' : 'packing-cell-assigned') : '';
        return `<td class="packing-cell ${cellClass}" data-id="${item.id}" data-assignee="${escapeHtml(col)}">${isAssigned && item.checked ? ICON_CHECK : ''}</td>`;
      }).join('')}
    </tr>
  `;
}

function renderPackingAddSheetBody(state) {
  const container = document.getElementById('packing-add-body');
  document.getElementById('packing-add-title').textContent = state.id ? '준비물 수정' : '준비물 추가';

  container.innerHTML = `
    <label class="field-label" style="margin-top:0" for="input-packing-name">준비물 이름</label>
    <input type="text" id="input-packing-name" placeholder="예: 텐트, 버너" value="${escapeHtml(state.name ?? '')}">

    <label class="field-label" for="input-packing-memo">메모 (선택)</label>
    <input type="text" id="input-packing-memo" placeholder="예: 4인용" value="${escapeHtml(state.memo ?? '')}">

    <p class="field-hint" style="margin:0 0 4px">${state.id ? '담당자는 표에서 칸을 탭해 바꿀 수 있어요.' : '추가 후 표에서 담당자 칸을 탭해 배정해주세요.'}</p>

    <button type="button" class="btn-primary" id="btn-save-packing-item">${state.id ? '수정' : '추가'}</button>
    ${state.id ? '<button type="button" class="btn-danger" id="btn-delete-packing-item">삭제</button>' : ''}
  `;
}

function renderParticipantSheetBody() {
  const settings = getSettings();
  const participants = settings?.packingParticipants || [];
  const container = document.getElementById('participant-sheet-body');

  container.innerHTML = `
    ${participants.length ? `
      <div class="participant-list">
        ${participants.map((p, i) => `
          <div class="participant-row">
            <span>${escapeHtml(p)}</span>
            <button type="button" class="participant-remove-btn" data-index="${i}" aria-label="삭제">✕</button>
          </div>
        `).join('')}
      </div>
    ` : '<p class="field-hint" style="margin:0 0 12px">아직 참여자가 없어요.</p>'}

    <label class="field-label" for="input-new-participant">이름 추가</label>
    <input type="text" id="input-new-participant" placeholder="예: 규현" autocomplete="off">
    <button type="button" class="btn-primary" id="btn-add-participant">추가</button>
  `;
}
