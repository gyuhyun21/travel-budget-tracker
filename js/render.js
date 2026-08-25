// Which category tab is selected in the dashboard's expense list filter.
// Resets to 'all' whenever the previously selected category no longer has
// any expenses (see renderDashboardScreen).
let dashboardCategoryFilter = 'all';

// Which filter chip ("all"/"active"/"completed") the 모임 목록 screen is showing.
let eventsFilter = 'all';

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

function renderEventsScreen() {
  const container = document.getElementById('screen-events');
  const events = [...getEvents()].sort((a, b) => b.updatedAt - a.updatedAt);
  const enriched = events.map(ev => {
    const settings = readEventSettings(ev.id);
    const expenses = readEventExpenses(ev.id);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
    const hasDates = settings.tripStartDate && settings.tripEndDate;
    return {
      ...ev,
      title: settings.tripName?.trim() || '제목 없음',
      dateLabel: hasDates ? dpFormatRange(settings.tripStartDate, settings.tripEndDate) : '',
      totalSpent
    };
  });
  const filtered = eventsFilter === 'all' ? enriched : enriched.filter(ev => ev.status === eventsFilter);

  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">모임</h1>
      <button type="button" class="ios-header-action" id="btn-create-event" aria-label="새 모임">${ICON_PLUS}</button>
    </div>
    ${enriched.length ? `
      <div class="ios-chip-row" id="events-filter-row" style="margin-bottom:16px">
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'all' ? 'active' : ''}" data-value="all">전체</button>
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'active' ? 'active' : ''}" data-value="active">진행중</button>
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'completed' ? 'active' : ''}" data-value="completed">완료</button>
      </div>
    ` : ''}
    ${filtered.length ? `
      <div class="card-section">
        ${filtered.map(ev => `
          <button type="button" class="event-card" data-id="${ev.id}">
            <span class="event-card-main">
              <span class="event-card-title">${escapeHtml(ev.title)}</span>
              <span class="event-card-meta">${ev.dateLabel ? `${escapeHtml(ev.dateLabel)} · ` : ''}${Math.round(ev.totalSpent).toLocaleString()}원</span>
            </span>
            <span class="event-status-badge ${ev.status === 'completed' ? 'completed' : ''}">${ev.status === 'completed' ? '완료' : '진행중'}</span>
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">${ICON_RECEIPT}</div>
        <div class="empty-text">아직 모임이 없어요.<br>오른쪽 위 + 버튼으로 새 모임을 만들어보세요.</div>
      </div>
    `}
  `;
}

function renderEventCreateSheetBody() {
  const container = document.getElementById('event-create-body');
  container.innerHTML = `
    <label class="field-label" style="margin-top:0" for="input-new-event-title">모임 제목</label>
    <input type="text" id="input-new-event-title" placeholder="예: 8월 정기모임" autocomplete="off">
    <button type="button" class="btn-primary" id="btn-confirm-create-event">만들기</button>
  `;
}

function renderDashboardScreen() {
  const settings = getSettings() || {};
  const container = document.getElementById('screen-dashboard');
  const expenses = getExpenses();
  const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
  const tripName = settings.tripName?.trim();
  document.title = tripName ? `${tripName} 가계부` : '모임 가계부';
  const hasDates = settings.tripStartDate && settings.tripEndDate;
  const tripLabel = hasDates ? tripStatusLabel(settings) : '';
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

  const totalSpentText = `${Math.round(totalSpent).toLocaleString()}원`;
  const totalFontSize = fitFontSize(totalSpentText, [[8, 40], [10, 34], [12, 28], [15, 22]]);

  container.innerHTML = `
    <div class="dashboard-hero">
      <button type="button" class="hero-back-link" id="btn-back-to-events">← 모임 목록</button>
      <div class="ios-header">
        <h1 class="ios-large-title">${tripName ? escapeHtml(tripName) : '모임'}</h1>
      </div>
      ${tripLabel ? `<p class="trip-pill">${tripLabel}</p>` : ''}
      <div class="hero-total-label">총 지출</div>
      <div class="hero-total-amount" style="font-size:${totalFontSize}">${totalSpentText}</div>
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

const SPENDER_UNKNOWN_LABEL = '미확인';

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
        <span class="expense-meta">${cat.label} · ${escapeHtml(e.spender || SPENDER_UNKNOWN_LABEL)}</span>
      </span>
      <span class="expense-amount">
        ${Math.round(e.krwAmount).toLocaleString()}원
        ${e.currency !== 'KRW' ? `<span class="original">${e.amount.toLocaleString()} ${e.currency}</span>` : ''}
      </span>
      <span class="chevron">${ICON_CHEVRON}</span>
    </button>
  `;
}

function spenderChipsHtml(selected, participants) {
  return participants.map(p => `
    <button type="button" class="ios-chip spender-chip-btn ${p === selected ? 'active' : ''}" data-value="${escapeHtml(p)}">${escapeHtml(p)}</button>
  `).join('');
}

function spenderSummaryHtml(expenses, participants) {
  const totals = {};
  for (const e of expenses) {
    const key = e.spender || SPENDER_UNKNOWN_LABEL;
    totals[key] = (totals[key] || 0) + (e.krwAmount || 0);
  }
  const people = [
    ...participants.map(name => ({ name, amount: totals[name] || 0, known: true })),
    ...(totals[SPENDER_UNKNOWN_LABEL] ? [{ name: SPENDER_UNKNOWN_LABEL, amount: totals[SPENDER_UNKNOWN_LABEL], known: false }] : []),
  ];
  if (!people.length) return '';
  return `
    <div class="spender-summary-row">
      ${people.map(p => `
        <div class="spender-summary-tile ${p.known ? '' : 'spender-summary-unknown'}">
          <span class="spender-summary-name">${escapeHtml(p.name)}</span>
          <span class="spender-summary-amount">${Math.round(p.amount).toLocaleString()}원</span>
        </div>
      `).join('')}
    </div>
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
  const participants = getParticipants().map(p => p.name);
  const selectedSpender = existing?.spender || '';

  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">${existing ? '지출 수정' : '지출 추가'}</h1>
      <button type="button" class="ios-header-link" id="btn-close-expense-form">취소</button>
    </div>

    <div class="card-section">
      <div class="card-section-pad">
        <form id="expense-form">
          <input type="hidden" id="input-expense-id" value="${existing ? existing.id : ''}">
          <input type="hidden" id="input-expense-currency" value="${selectedCurrency}">
          <input type="hidden" id="input-expense-category" value="${selectedCategory}">
          <input type="hidden" id="input-expense-spender" value="${escapeHtml(selectedSpender)}">

          <label class="field-label" style="margin-top:0" for="input-expense-date">날짜</label>
          <input type="date" id="input-expense-date" value="${existing ? existing.date : today}" required>

          <label class="field-label">통화</label>
          <div class="ios-segment" id="currency-segmented">${currencySegmentedHtml(selectedCurrency)}</div>

          <label class="field-label" for="input-expense-amount">금액</label>
          <input type="text" inputmode="decimal" class="input-money" id="input-expense-amount" value="${existing ? formatMoneyValue(existing.amount) : ''}" required>

          <label class="field-label">카테고리</label>
          <div class="ios-chip-row" id="category-segmented">${categorySegmentedHtml(selectedCategory)}</div>

          <label class="field-label">지출한 사람</label>
          ${participants.length
            ? `<div class="ios-chip-row" id="spender-chip-row">${spenderChipsHtml(selectedSpender, participants)}</div>`
            : `<p class="field-hint" style="margin-top:0">준비물 탭의 참여자 관리에서 참여자를 추가하면 지정할 수 있어요.</p>`}
          <p class="field-hint" style="margin:4px 0 0">선택하지 않으면 '${SPENDER_UNKNOWN_LABEL}'으로 기록돼요.</p>

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

// Which sub-tab ("list" or "settlement") the 지출 목록 screen is showing.
let expenseListView = 'list';

function expenseListViewSegmentHtml(selected) {
  const options = [
    { id: 'list', label: '목록' },
    { id: 'settlement', label: 'N빵' },
  ];
  const index = Math.max(0, options.findIndex(o => o.id === selected));
  return `
    <div class="ios-segment-thumb" style="--count:${options.length}; --index:${index}"></div>
    ${options.map(o => `
      <button type="button" class="ios-segment-btn expense-list-view-btn ${o.id === selected ? 'active' : ''}" data-value="${o.id}">${o.label}</button>
    `).join('')}
  `;
}

function renderExpenseListScreen() {
  const expenses = [...getExpenses()].sort((a, b) => b.date.localeCompare(a.date));
  const participants = getParticipants();
  const container = document.getElementById('screen-expense-list');
  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">지출 목록</h1>
      <button type="button" class="ios-header-action" id="btn-add-expense" aria-label="지출 추가">${ICON_PLUS}</button>
    </div>
    <div class="ios-segment" id="expense-list-view-segment" style="margin-bottom:16px">${expenseListViewSegmentHtml(expenseListView)}</div>
    ${expenseListView === 'settlement'
      ? settlementSectionHtml(expenses, participants)
      : `
        ${expenses.length ? spenderSummaryHtml(expenses, participants.map(p => p.name)) : ''}
        ${expenses.length
          ? `<div class="card-section">${expenses.map(e => expenseCardHtml(e)).join('')}</div>`
          : `<div class="empty-state">
              <div class="empty-icon">${ICON_RECEIPT}</div>
              <div class="empty-text">아직 지출 내역이 없어요.<br>오른쪽 위 + 버튼으로 첫 지출을 기록해보세요.</div>
            </div>`}
      `}
  `;
}

function settlementSectionHtml(expenses, participants) {
  if (participants.length < 2) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICON_INFO}</div>
        <div class="empty-text">정산하려면 참여자가 2명 이상 필요해요.<br>준비물 탭의 참여자 관리에서 추가해주세요.</div>
      </div>
    `;
  }

  const result = calculateSettlement(expenses, participants);
  if (result.totalSpent === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICON_RECEIPT}</div>
        <div class="empty-text">지출한 사람이 지정된 지출이 아직 없어요.</div>
      </div>
    `;
  }

  const breakdown = participants.map(p => `${escapeHtml(p.name)} ${p.count}인`).join(' · ');

  return `
    <div class="settlement-summary-card">
      <div class="settlement-summary-total">총 지출 ${Math.round(result.totalSpent).toLocaleString()}원</div>
      <div class="settlement-summary-detail">총 ${result.totalUnits}인 (${breakdown}) · 1인당 ${result.perUnit.toLocaleString()}원</div>
    </div>

    <h3 class="section-title">각자 부담액</h3>
    <div class="card-section">
      ${result.balances.map(b => `
        <div class="settlement-balance-row">
          <div class="settlement-balance-main">
            <span class="settlement-balance-name">${escapeHtml(b.name)}</span>
            <span class="settlement-balance-amount ${b.balance >= 0 ? 'positive' : 'negative'}">${b.balance >= 0 ? '+' : ''}${Math.round(b.balance).toLocaleString()}원</span>
          </div>
          <div class="settlement-balance-detail">낸 돈 ${Math.round(b.paid).toLocaleString()}원 · 부담액 ${Math.round(b.share).toLocaleString()}원 (1인당 ${result.perUnit.toLocaleString()}원 × ${b.count}명)</div>
        </div>
      `).join('')}
    </div>

    <h3 class="section-title">정산 방법</h3>
    ${result.transfers.length ? `
      <div class="card-section">
        ${result.transfers.map(t => `
          <div class="settlement-transfer-row">
            <span class="settlement-transfer-name">${escapeHtml(t.from)}</span>
            <span class="settlement-transfer-arrow">→</span>
            <span class="settlement-transfer-name">${escapeHtml(t.to)}</span>
            <span class="settlement-transfer-amount">${Math.round(t.amount).toLocaleString()}원</span>
          </div>
        `).join('')}
      </div>
    ` : `<p class="field-hint" style="margin:0">이미 정산이 딱 맞아요. 주고받을 돈이 없어요.</p>`}
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

const UNASSIGNED_LABEL = '미정';

function renderPackingScreen() {
  const container = document.getElementById('screen-packing');
  const participantNames = getParticipants().map(p => p.name);
  const items = getPackingItems();
  const doneCount = items.filter(i => i.checked).length;

  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">준비물</h1></div>
    ${items.length ? `<p class="trip-pill">${doneCount} / ${items.length} 준비완료</p>` : ''}

    <div class="ios-chip-row" id="packing-participants-row" style="margin-bottom:14px">
      ${participantNames.map(p => `<span class="ios-chip packing-participant-chip">${escapeHtml(p)}</span>`).join('')}
      <button type="button" class="ios-chip" id="btn-manage-participants">${ICON_PLUS} 참여자 관리</button>
    </div>

    <button type="button" class="btn-primary btn-add-main" id="btn-add-packing-item">
      <span class="btn-icon-inline">${ICON_PLUS}</span>준비물 추가
    </button>

    ${renderPackingTable(participantNames, items)}
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
  const participants = getParticipants();
  const container = document.getElementById('participant-sheet-body');

  container.innerHTML = `
    ${participants.length ? `
      <p class="field-hint" style="margin:0 0 10px">인원수는 N빵 정산에서 그 사람 몫을 몇 인분으로 셀지에 쓰여요 (가족 단위 참여 시).</p>
      <div class="participant-list">
        ${participants.map((p, i) => `
          <div class="participant-row">
            <span class="participant-name">${escapeHtml(p.name)}</span>
            <span class="participant-count-field">
              <input type="number" min="1" inputmode="numeric" class="participant-count-input" data-index="${i}" value="${p.count}">명
            </span>
            <button type="button" class="participant-remove-btn" data-index="${i}" aria-label="삭제">✕</button>
          </div>
        `).join('')}
      </div>
    ` : '<p class="field-hint" style="margin:0 0 12px">아직 참여자가 없어요.</p>'}

    <label class="field-label" for="input-new-participant">이름 추가</label>
    <input type="text" id="input-new-participant" placeholder="예: 규현" autocomplete="off">
    <label class="field-label" for="input-new-participant-count">인원수</label>
    <input type="number" min="1" inputmode="numeric" id="input-new-participant-count" value="1">
    <button type="button" class="btn-primary" id="btn-add-participant">추가</button>
  `;
}
