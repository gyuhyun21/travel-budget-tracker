function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelector('.nav-bar').style.display = name === 'events' ? 'none' : 'flex';
  if (name === 'events') renderEventsScreen();
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
  if (name === 'packing') renderPackingScreen();
}

function openEventById(id) {
  const shared = enterEvent(id);
  if (shared) {
    document.getElementById('sync-loading').style.display = 'flex';
    startSharedSync(
      () => {
        document.getElementById('sync-loading').style.display = 'none';
        showScreen('dashboard');
      },
      () => {
        renderDashboardScreen();
        renderExpenseListScreen();
        renderPackingScreen();
      }
    );
    return;
  }
  showScreen('dashboard');
}

function bindEventsScreen() {
  document.getElementById('screen-events').addEventListener('click', (e) => {
    if (e.target.closest('#btn-share-list')) {
      openListShareSheet();
      return;
    }

    if (e.target.closest('#btn-create-event')) {
      openEventCreateSheet();
      return;
    }

    const filterTab = e.target.closest('.event-filter-tab');
    if (filterTab) {
      eventsFilter = filterTab.dataset.value;
      renderEventsScreen();
      return;
    }

    const card = e.target.closest('.event-card');
    if (card) {
      openEventById(card.dataset.id);
    }
  });
}

function openEventCreateSheet() {
  renderEventCreateSheetBody();
  document.getElementById('event-create-sheet').style.display = 'flex';
  document.getElementById('input-new-event-title').focus();
}

function closeEventCreateSheet() {
  document.getElementById('event-create-sheet').style.display = 'none';
}

function openListShareSheet() {
  renderListShareSheetBody();
  document.getElementById('list-share-sheet').style.display = 'flex';
}

function closeListShareSheet() {
  document.getElementById('list-share-sheet').style.display = 'none';
}

// Races a Firestore-touching promise against a timeout, so a blocked or
// offline Firebase SDK (window.firebaseReady never resolving) can't hang
// a UI flow forever behind a disabled button. Mirrors the escape hatch
// bindSyncLoadingCancel() already provides for the sync-loading overlay.
function withFirebaseTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('firebase-timeout')), ms))
  ]);
}

function bindListShareSheet() {
  const overlay = document.getElementById('list-share-sheet');
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.id === 'list-share-close') {
      closeListShareSheet();
      return;
    }

    if (e.target.id === 'btn-start-list-sharing') {
      e.target.disabled = true;
      e.target.textContent = '공유 링크 만드는 중...';
      try {
        await withFirebaseTimeout(shareEventsList());
        openListShareSheet();
        renderEventsScreen();
      } catch (err) {
        alert('공유 링크를 만들지 못했습니다. 네트워크 연결을 확인해주세요.');
        e.target.disabled = false;
        e.target.textContent = '목록 공유하기';
      }
      return;
    }

    if (e.target.id === 'btn-copy-share-link') {
      const link = e.target.dataset.link;
      const title = e.target.dataset.title;
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} 같이 보기`, url: link });
        } catch (err) {
          // user closed the share sheet without picking anything — not an error
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        const original = e.target.textContent;
        e.target.textContent = '복사됨!';
        setTimeout(() => { e.target.textContent = original; }, 1500);
      } catch (err) {
        prompt('아래 링크를 복사하세요:', link);
      }
      return;
    }

    if (e.target.id === 'btn-stop-list-sharing') {
      if (!confirm('공유를 중지하고 이 기기에만 로컬로 저장할까요? 다른 사람과의 실시간 공유가 끊어집니다.')) return;
      e.target.disabled = true;
      try {
        await withFirebaseTimeout(stopSharingEventsList());
      } catch (err) {
        // Best-effort refresh may have timed out, but stopSharingEventsList
        // clears every tripId synchronously before doing any network I/O,
        // so local state is already consistent either way.
      }
      closeListShareSheet();
      renderEventsScreen();
    }

    if (e.target.id === 'btn-join-list-link') {
      const input = document.getElementById('input-join-list-link');
      const listId = extractListId(input.value);
      if (!listId) { input.focus(); return; }
      e.target.disabled = true;
      e.target.textContent = '참가하는 중...';
      try {
        const joined = await withFirebaseTimeout(joinSharedList(listId));
        if (!joined) {
          alert('공유 링크가 유효하지 않습니다. 링크를 다시 확인해주세요.');
          e.target.disabled = false;
          e.target.textContent = '참가하기';
          return;
        }
        openListShareSheet();
        renderEventsScreen();
      } catch (err) {
        alert('참가하지 못했습니다. 네트워크 연결을 확인해주세요.');
        e.target.disabled = false;
        e.target.textContent = '참가하기';
      }
    }
  });
}

function bindEventCreateSheet() {
  const overlay = document.getElementById('event-create-sheet');
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.id === 'event-create-close') {
      closeEventCreateSheet();
      return;
    }
    if (e.target.id === 'btn-confirm-create-event') {
      const input = document.getElementById('input-new-event-title');
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      const listId = getSharedListId();
      if (listId) {
        e.target.disabled = true;
        e.target.textContent = '만드는 중...';
        const id = createEvent(title);
        try {
          await withFirebaseTimeout(ensureEventIsShared(id));
          await withFirebaseTimeout(fsAddListEvent(listId, id));
          // Nothing was written to this event in the gap above (the sheet
          // stayed open and blocked input the whole time), so promoting it
          // now safely picks up the tripId that ensureEventIsShared just
          // set and starts live sync for it — no data to lose.
          promoteActiveEventToShared(id);
        } catch (err) {
          // ensureEventIsShared may have already set tripId before
          // fsAddListEvent failed — undo it so the event stays honestly
          // local instead of silently entering shared mode (with only its
          // near-empty initial snapshot) the next time it's opened, which
          // would wipe out anything entered after this failure.
          updateEventMeta(id, { tripId: null });
          alert('모임을 만들었지만 공유 목록에 등록하지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.');
        }
      } else {
        createEvent(title);
      }
      closeEventCreateSheet();
      // New event, nobody added yet — walk straight into participant entry
      // before landing on the dashboard, so N빵 has someone to split with.
      openParticipantSheet('create');
    }
  });
}

// Lets the user bail out of the "불러오는 중" overlay if window.firebaseReady
// never resolves (network down, Firebase SDK blocked) — otherwise the
// overlay hides the nav bar and there's no way back to the events list.
function bindSyncLoadingCancel() {
  document.getElementById('btn-cancel-sync-loading').addEventListener('click', () => {
    leaveEvent();
    document.getElementById('sync-loading').style.display = 'none';
    showScreen('events');
  });
}

function bindSettingsForm() {
  const container = document.getElementById('screen-settings');

  container.addEventListener('submit', (e) => {
    if (e.target.id === 'username-form') {
      e.preventDefault();
      const name = document.getElementById('input-settings-user-name').value.trim();
      if (!name) return;
      setUserName(name);
      renderSettingsScreen();
      return;
    }
    if (e.target.id === 'settings-form') {
      e.preventDefault();
      const tripStartDate = document.getElementById('input-trip-start').value;
      const tripEndDate = document.getElementById('input-trip-end').value;
      const settings = {
        ...(getSettings() || {}),
        tripName: document.getElementById('input-trip-name').value.trim(),
        tripStartDate: tripStartDate || undefined,
        tripEndDate: tripEndDate || undefined
      };
      saveSettings(settings);
      showScreen('dashboard');
      return;
    }
    if (e.target.id === 'currency-rate-form') {
      e.preventDefault();
      const settings = { ...(getSettings() || {}) };
      document.querySelectorAll('.currency-rate-input').forEach(input => {
        const field = input.dataset.currency === 'THB' ? 'thbRate' : 'usdRate';
        settings[field] = parseMoneyInput(input.value);
      });
      saveSettings(settings);
      renderSettingsScreen();
    }
  });

  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('input-money')) formatMoneyInput(e.target);
  });

  container.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-open-daterange')) {
      openDateRangeSheet();
      return;
    }

    const addCurrencyChip = e.target.closest('.currency-add-chip');
    if (addCurrencyChip) {
      const settings = getSettings() || {};
      const currency = addCurrencyChip.dataset.currency;
      const field = currency === 'THB' ? 'thbRate' : 'usdRate';
      const defaultRate = currency === 'THB' ? DEFAULT_THB_RATE : DEFAULT_USD_RATE;
      saveSettings({ ...settings, [field]: defaultRate });
      renderSettingsScreen();
      return;
    }

    const removeCurrencyBtn = e.target.closest('.currency-remove-btn');
    if (removeCurrencyBtn) {
      const settings = { ...(getSettings() || {}) };
      const field = removeCurrencyBtn.dataset.currency === 'THB' ? 'thbRate' : 'usdRate';
      delete settings[field];
      saveSettings(settings);
      renderSettingsScreen();
      return;
    }
  });
}

let dpState = null;

function openDateRangeSheet() {
  const existingStart = document.getElementById('input-trip-start').value;
  const existingEnd = document.getElementById('input-trip-end').value;
  const base = existingStart ? dpParseYmd(existingStart) : { year: new Date().getFullYear(), month: new Date().getMonth() };
  dpState = { year: base.year, month: base.month, start: existingStart || null, end: existingEnd || null };
  renderDateRangeSheet(dpState);
  document.getElementById('daterange-sheet').style.display = 'flex';
}

function closeDateRangeSheet() {
  document.getElementById('daterange-sheet').style.display = 'none';
}

function bindDateRangeSheet() {
  const overlay = document.getElementById('daterange-sheet');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'dp-close') {
      closeDateRangeSheet();
      return;
    }

    if (e.target.closest('#dp-prev')) {
      dpState.month -= 1;
      if (dpState.month < 0) { dpState.month = 11; dpState.year -= 1; }
      renderDateRangeSheet(dpState);
      return;
    }

    if (e.target.closest('#dp-next')) {
      dpState.month += 1;
      if (dpState.month > 11) { dpState.month = 0; dpState.year += 1; }
      renderDateRangeSheet(dpState);
      return;
    }

    const dayBtn = e.target.closest('.dp-day');
    if (dayBtn) {
      const dateStr = dayBtn.dataset.date;
      if (!dpState.start || dpState.end) {
        dpState.start = dateStr;
        dpState.end = null;
      } else if (dateStr < dpState.start) {
        dpState.start = dateStr;
        dpState.end = null;
      } else {
        dpState.end = dateStr;
      }
      renderDateRangeSheet(dpState);
      return;
    }

    if (e.target.id === 'dp-confirm') {
      if (!dpState.start || !dpState.end) return;
      document.getElementById('input-trip-start').value = dpState.start;
      document.getElementById('input-trip-end').value = dpState.end;
      document.getElementById('date-range-display').textContent = dpFormatRange(dpState.start, dpState.end);
      closeDateRangeSheet();
    }
  });
}

function setActiveCurrency(value) {
  const group = document.getElementById('currency-segmented');
  const buttons = [...group.querySelectorAll('.currency-btn')];
  const index = Math.max(0, buttons.findIndex(b => b.dataset.value === value));
  buttons.forEach((b, i) => b.classList.toggle('active', i === index));
  group.querySelector('.ios-segment-thumb').style.setProperty('--index', index);
  document.getElementById('input-expense-currency').value = value;
}

function setActiveCategory(value) {
  const group = document.getElementById('category-segmented');
  group.querySelectorAll('.category-btn').forEach(btn => {
    const isActive = btn.dataset.value === value;
    btn.classList.toggle('active', isActive);
    const cat = getCategoryById(btn.dataset.value);
    btn.querySelector('.chip-dot').style.background = isActive ? '#fff' : cat.color;
  });
  document.getElementById('input-expense-category').value = value;
}

function setActiveSpenderChip(value) {
  const group = document.getElementById('spender-chip-row');
  if (group) {
    group.querySelectorAll('.spender-chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }
  document.getElementById('input-expense-spender').value = value;
}

function bindExpenseForm() {
  const container = document.getElementById('screen-add-expense');

  container.addEventListener('submit', (e) => {
    if (e.target.id !== 'expense-form') return;
    e.preventDefault();
    const settings = getSettings();
    const id = document.getElementById('input-expense-id').value;
    const date = document.getElementById('input-expense-date').value;
    const currency = document.getElementById('input-expense-currency').value;
    const amount = parseMoneyInput(document.getElementById('input-expense-amount').value);
    const category = document.getElementById('input-expense-category').value;
    const memo = document.getElementById('input-expense-memo').value.trim();
    const spender = document.getElementById('input-expense-spender').value;
    const hasParticipants = getParticipants().length > 0;
    const krwAmount = toKRW(amount, currency, settings);
    const messageEl = document.getElementById('expense-form-message');
    if (krwAmount === null) {
      messageEl.textContent = '환율이 설정되지 않았습니다. 설정 화면에서 환율을 입력해주세요.';
      messageEl.style.display = 'block';
      return;
    }
    if (hasParticipants && !spender) {
      messageEl.textContent = '지출한 사람을 선택해주세요.';
      messageEl.style.display = 'block';
      return;
    }
    if (!memo) {
      messageEl.textContent = '메모를 입력해주세요.';
      messageEl.style.display = 'block';
      return;
    }
    const expenseData = { date, currency, amount, krwAmount, category, memo, spender: spender || SPENDER_UNKNOWN_LABEL };
    if (id) {
      updateExpense(id, expenseData);
    } else {
      addExpense(expenseData);
    }
    showScreen('dashboard');
  });

  container.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-delete-expense') {
      const id = document.getElementById('input-expense-id').value;
      deleteExpense(id);
      showScreen('dashboard');
      return;
    }

    if (e.target.id === 'btn-close-expense-form') {
      showScreen('dashboard');
      return;
    }

    const currencyBtn = e.target.closest('.currency-btn');
    if (currencyBtn) {
      setActiveCurrency(currencyBtn.dataset.value);
      return;
    }

    const categoryBtn = e.target.closest('.category-btn');
    if (categoryBtn) {
      setActiveCategory(categoryBtn.dataset.value);
      return;
    }

    const spenderBtn = e.target.closest('.spender-chip-btn');
    if (spenderBtn) {
      const isActive = spenderBtn.classList.contains('active');
      setActiveSpenderChip(isActive ? '' : spenderBtn.dataset.value);
      return;
    }
  });

  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('input-money')) formatMoneyInput(e.target);
  });
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

function bindAddExpenseButtons() {
  ['screen-dashboard', 'screen-expense-list'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.closest('#btn-add-expense')) showScreen('add-expense');
    });
  });
}

function bindDashboardScreen() {
  document.getElementById('screen-dashboard').addEventListener('click', (e) => {
    if (e.target.closest('#btn-back-to-events')) {
      leaveEvent();
      showScreen('events');
      return;
    }
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    dashboardCategoryFilter = tab.dataset.value;
    renderDashboardScreen();
  });
}

function bindExpenseList() {
  document.getElementById('screen-expense-list').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.expense-list-view-btn');
    if (viewBtn) {
      expenseListView = viewBtn.dataset.value;
      renderExpenseListScreen();
      return;
    }

    const btn = e.target.closest('.expense-item');
    if (!btn) return;
    showScreen('add-expense');
    renderExpenseFormScreen(btn.dataset.id);
  });
}

function bindBackupButtons() {
  const container = document.getElementById('screen-settings');

  container.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-export') return;
    const data = { settings: getSettings(), expenses: getExpenses(), packingItems: getPackingItems() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (data.settings?.tripName || 'budget').trim().replace(/[^\p{L}\p{N}]+/gu, '-');
    a.download = `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  container.addEventListener('change', (e) => {
    if (e.target.id !== 'input-import') return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const message = document.getElementById('settings-message');
      try {
        const data = JSON.parse(reader.result);
        if (!data.settings || !Array.isArray(data.expenses)) {
          throw new Error('invalid format');
        }
        if (!confirm('기존 데이터를 덮어씁니다. 계속할까요?')) return;
        saveSettings(data.settings);
        saveExpenses(data.expenses);
        savePackingItems(Array.isArray(data.packingItems) ? data.packingItems : []);
        renderSettingsScreen();
        renderDashboardScreen();
        renderPackingScreen();
        const restored = document.getElementById('settings-message');
        restored.textContent = '복원되었습니다.';
        restored.style.display = 'block';
      } catch (err) {
        alert('올바르지 않은 백업 파일입니다.');
      } finally {
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert('파일을 읽는 중 오류가 발생했습니다.');
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

function bindEventStatusButtons() {
  document.getElementById('screen-settings').addEventListener('click', (e) => {
    if (e.target.id === 'btn-toggle-event-status') {
      const id = getActiveEventId();
      const meta = getEvents().find(ev => ev.id === id);
      const nextStatus = meta?.status === 'completed' ? 'active' : 'completed';
      updateEventMeta(id, { status: nextStatus });
      renderSettingsScreen();
      return;
    }
    if (e.target.id === 'btn-delete-event') {
      if (!confirm('이 모임의 모든 기록을 완전히 삭제합니다. 되돌릴 수 없어요. 계속할까요?')) return;
      deleteEvent(getActiveEventId());
      showScreen('events');
    }
  });
}

function bindPackingScreen() {
  document.getElementById('screen-packing').addEventListener('click', (e) => {
    if (e.target.closest('#btn-manage-participants')) {
      openParticipantSheet();
      return;
    }

    if (e.target.closest('#btn-add-packing-item')) {
      openPackingAddSheet();
      return;
    }

    const cell = e.target.closest('.packing-cell');
    if (cell) {
      const item = getPackingItemById(cell.dataset.id);
      if (!item) return;
      const column = cell.dataset.assignee;
      const currentAssignee = item.assignee || UNASSIGNED_LABEL;
      if (currentAssignee === column) {
        // Tapping the cell that's already assigned toggles it prepared/not.
        updatePackingItem(item.id, { checked: !item.checked });
      } else {
        // Tapping a different cell reassigns to that column (fresh item
        // isn't prepared yet under its new owner).
        updatePackingItem(item.id, { assignee: column === UNASSIGNED_LABEL ? null : column, checked: false });
      }
      renderPackingScreen();
      return;
    }

    const rowHeader = e.target.closest('.packing-row-header');
    if (rowHeader) {
      openPackingAddSheet(rowHeader.dataset.id);
    }
  });
}

let packingAddState = null;

function openPackingAddSheet(id = null) {
  const existing = id ? getPackingItemById(id) : null;
  packingAddState = existing
    ? { id: existing.id, name: existing.name, memo: existing.memo }
    : { id: null, name: '', memo: '' };
  renderPackingAddSheetBody(packingAddState);
  document.getElementById('packing-add-sheet').style.display = 'flex';
  document.getElementById('input-packing-name').focus();
}

function closePackingAddSheet() {
  document.getElementById('packing-add-sheet').style.display = 'none';
  packingAddState = null;
}

function bindPackingAddSheet() {
  const overlay = document.getElementById('packing-add-sheet');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'packing-add-close') {
      closePackingAddSheet();
      return;
    }

    if (e.target.id === 'btn-save-packing-item') {
      const name = document.getElementById('input-packing-name').value.trim();
      if (!name) {
        alert('준비물 이름을 입력해주세요.');
        return;
      }
      const memo = document.getElementById('input-packing-memo').value.trim();
      if (packingAddState.id) {
        updatePackingItem(packingAddState.id, { name, memo });
      } else {
        addPackingItem({ name, memo, assignee: null });
      }
      closePackingAddSheet();
      renderPackingScreen();
      return;
    }

    if (e.target.id === 'btn-delete-packing-item') {
      if (!confirm('이 준비물을 삭제할까요?')) return;
      deletePackingItem(packingAddState.id);
      closePackingAddSheet();
      renderPackingScreen();
    }
  });
}

// Where closing the participant sheet should leave the user: back on the
// 준비물 tab (normal case), or into the freshly-created event's dashboard
// (when opened as the last step of creating a new event).
let participantSheetReturnTo = 'packing';

function openParticipantSheet(returnTo = 'packing') {
  participantSheetReturnTo = returnTo;
  renderParticipantSheetBody();
  document.getElementById('participant-sheet').style.display = 'flex';
}

function closeParticipantSheet() {
  if (participantSheetReturnTo === 'create' && getParticipants().length === 0) {
    alert('지출한 사람을 기록하려면 참여자가 1명 이상 필요해요. 먼저 등록해주세요.');
    return;
  }
  document.getElementById('participant-sheet').style.display = 'none';
  if (participantSheetReturnTo === 'create') {
    showScreen('dashboard');
  } else {
    renderPackingScreen();
  }
}

function bindParticipantSheet() {
  const overlay = document.getElementById('participant-sheet');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'participant-sheet-close') {
      closeParticipantSheet();
      return;
    }

    const removeBtn = e.target.closest('.participant-remove-btn');
    if (removeBtn) {
      const settings = getSettings();
      const participants = getParticipants();
      const [removed] = participants.splice(Number(removeBtn.dataset.index), 1);
      saveSettings({ ...settings, packingParticipants: participants });
      // reassign that person's items to unassigned so nothing silently vanishes
      getPackingItems().filter(i => i.assignee === removed.name).forEach(i => updatePackingItem(i.id, { assignee: null }));
      renderParticipantSheetBody();
      return;
    }

    if (e.target.id === 'btn-add-participant') {
      const nameInput = document.getElementById('input-new-participant');
      const countInput = document.getElementById('input-new-participant-count');
      const name = nameInput.value.trim();
      if (!name) return;
      const settings = getSettings();
      const participants = getParticipants();
      if (participants.some(p => p.name === name)) {
        nameInput.value = '';
        return;
      }
      const count = Math.max(1, parseInt(countInput.value, 10) || 1);
      participants.push({ name, count });
      saveSettings({ ...settings, packingParticipants: participants });
      renderParticipantSheetBody();
    }
  });

  overlay.addEventListener('change', (e) => {
    const countInput = e.target.closest('.participant-count-input');
    if (!countInput) return;
    const settings = getSettings();
    const participants = getParticipants();
    const index = Number(countInput.dataset.index);
    participants[index] = { ...participants[index], count: Math.max(1, parseInt(countInput.value, 10) || 1) };
    saveSettings({ ...settings, packingParticipants: participants });
    renderParticipantSheetBody();
  });
}

bindEventsScreen();
bindEventCreateSheet();
bindListShareSheet();
bindSyncLoadingCancel();
bindSettingsForm();
bindExpenseForm();
bindExpenseList();
bindAddExpenseButtons();
bindDashboardScreen();
bindBackupButtons();
bindEventStatusButtons();
bindDateRangeSheet();
bindPackingScreen();
bindPackingAddSheet();
bindParticipantSheet();

function showUsernamePrompt(onDone) {
  const overlay = document.getElementById('username-sheet');
  const input = document.getElementById('input-user-name');
  const btn = document.getElementById('btn-save-username');
  overlay.style.display = 'flex';
  const submit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    setUserName(name);
    overlay.style.display = 'none';
    btn.removeEventListener('click', submit);
    input.removeEventListener('keydown', onKeydown);
    onDone();
  };
  const onKeydown = (e) => { if (e.key === 'Enter') submit(); };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', onKeydown);
  input.focus();
}

function boot() {
  resumeOrJoinSharedList();
  showScreen('events');
}

if (!getUserName()) {
  showUsernamePrompt(boot);
} else {
  boot();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
