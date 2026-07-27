function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
  if (name === 'schedule') renderScheduleScreen();
  if (name === 'packing') renderPackingScreen();
  if (name === 'documents') renderDocumentsScreen();
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
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const tripStartDate = document.getElementById('input-trip-start').value;
    const tripEndDate = document.getElementById('input-trip-end').value;
    const message = document.getElementById('settings-message');
    if (!tripStartDate || !tripEndDate) {
      message.textContent = '여행 기간을 선택해주세요.';
      message.classList.add('banner-error');
      message.style.display = 'block';
      return;
    }
    const settings = {
      ...(getSettings() || {}),
      tripName: document.getElementById('input-trip-name').value.trim(),
      totalBudget: parseMoneyInput(document.getElementById('input-total-budget').value),
      thbRate: parseMoneyInput(document.getElementById('input-thb-rate').value),
      usdRate: parseMoneyInput(document.getElementById('input-usd-rate').value),
      tripStartDate,
      tripEndDate
    };
    saveSettings(settings);
    showScreen('dashboard');
  });

  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('input-money')) formatMoneyInput(e.target);
  });

  container.addEventListener('click', async (e) => {
    if (e.target.closest('#btn-open-daterange')) {
      openDateRangeSheet();
      return;
    }

    if (e.target.id === 'btn-start-sharing') {
      e.target.disabled = true;
      e.target.textContent = '공유 링크 만드는 중...';
      try {
        await enableSharingForCurrentData();
        renderSettingsScreen();
      } catch (err) {
        alert('공유 링크를 만들지 못했습니다. 네트워크 연결을 확인해주세요.');
        e.target.disabled = false;
        e.target.textContent = '이 여행 공유하기';
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

    if (e.target.id === 'btn-stop-sharing') {
      if (!confirm('공유를 중지하고 이 기기에만 로컬로 저장할까요? 다른 사람과의 실시간 공유가 끊어집니다.')) return;
      disableSharing();
      renderSettingsScreen();
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
    const memo = document.getElementById('input-expense-memo').value;
    const spender = document.getElementById('input-expense-spender').value || SPENDER_UNKNOWN_LABEL;
    const krwAmount = toKRW(amount, currency, settings);
    const messageEl = document.getElementById('expense-form-message');
    if (krwAmount === null) {
      messageEl.textContent = '환율이 설정되지 않았습니다. 설정 화면에서 환율을 입력해주세요.';
      messageEl.style.display = 'block';
      return;
    }
    const expenseData = { date, currency, amount, krwAmount, category, memo, spender };
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

    if (e.target.id === 'btn-scan-receipt') {
      document.getElementById('input-receipt-photo').click();
    }
  });

  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('input-money')) formatMoneyInput(e.target);
  });

  container.addEventListener('change', async (e) => {
    if (e.target.id !== 'input-receipt-photo') return;
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('ocr-status');
    statusEl.style.display = 'block';
    statusEl.textContent = '영수증 인식 준비 중...';
    try {
      const text = await recognizeReceiptImage(file, (pct) => {
        statusEl.textContent = `영수증 인식 중... ${pct}%`;
      });
      const guessedAmount = guessAmountFromText(text);
      const guessedMemo = guessMemoFromText(text);
      const guessedCategory = guessCategoryFromText(text);

      if (guessedAmount !== null) {
        const amountEl = document.getElementById('input-expense-amount');
        amountEl.value = guessedAmount;
        formatMoneyInput(amountEl);
      }
      if (guessedMemo) {
        document.getElementById('input-expense-memo').value = guessedMemo;
      }
      setActiveCategory(guessedCategory);
      statusEl.textContent = '인식 완료! 내용을 확인하고 저장해주세요.';
    } catch (err) {
      statusEl.textContent = '영수증 인식에 실패했습니다. 직접 입력해주세요.';
    } finally {
      e.target.value = '';
    }
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

function bindDashboardCategoryFilter() {
  document.getElementById('screen-dashboard').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    dashboardCategoryFilter = tab.dataset.value;
    renderDashboardScreen();
  });
}

function bindExpenseList() {
  document.getElementById('screen-expense-list').addEventListener('click', (e) => {
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
    const data = { settings: getSettings(), expenses: getExpenses(), scheduleItems: getScheduleItems(), packingItems: getPackingItems(), documents: getDocuments() };
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
        saveScheduleItems(Array.isArray(data.scheduleItems) ? data.scheduleItems : []);
        savePackingItems(Array.isArray(data.packingItems) ? data.packingItems : []);
        saveDocuments(Array.isArray(data.documents) ? data.documents : []);
        renderSettingsScreen();
        renderDashboardScreen();
        renderScheduleScreen();
        renderPackingScreen();
        renderDocumentsScreen();
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

function bindResetButton() {
  document.getElementById('screen-settings').addEventListener('click', (e) => {
    if (e.target.id !== 'btn-reset-data') return;
    if (!confirm('예산과 지출 기록을 모두 삭제하고 처음부터 다시 시작합니다. 계속할까요?')) return;
    resetAllData();
    showScreen('settings');
  });
}

function bindScheduleScreen() {
  document.getElementById('screen-schedule').addEventListener('click', (e) => {
    const dayTab = e.target.closest('.schedule-day-tab');
    if (dayTab) {
      scheduleSelectedDate = dayTab.dataset.date;
      renderScheduleScreen();
      return;
    }

    const addRow = e.target.closest('.schedule-add-row');
    if (addRow) {
      openScheduleAddSheet(addRow.dataset.date, Number(addRow.dataset.hour));
      return;
    }

    const mapBtn = e.target.closest('.schedule-map-btn');
    if (mapBtn) {
      window.open(mapBtn.dataset.url, '_blank', 'noopener');
      return;
    }

    const editBtn = e.target.closest('.schedule-edit-btn');
    if (editBtn) {
      const item = getScheduleItems().find(i => i.id === editBtn.dataset.id);
      if (item) openScheduleAddSheet(item.date, item.hour, item.id);
    }
  });
}

let scheduleAddState = null;
let scheduleSearchDebounceTimer = null;

function openScheduleAddSheet(date, hour, existingId = null) {
  const existing = existingId ? getScheduleItems().find(i => i.id === existingId) : null;
  scheduleAddState = existing
    ? {
        id: existing.id, date, hour,
        name: existing.name, memo: existing.memo,
        selectedPlace: existing.address ? { name: existing.name, address: existing.address, lat: existing.lat, lng: existing.lng, placeUrl: existing.placeUrl } : null,
        searchResults: null,
        documentIds: [...(existing.documentIds || [])],
        inlineUpload: null
      }
    : { id: null, date, hour, name: '', memo: '', selectedPlace: null, searchResults: null, documentIds: [], inlineUpload: null };
  renderScheduleAddSheetBody(scheduleAddState);
  document.getElementById('schedule-add-sheet').style.display = 'flex';
}

function closeScheduleAddSheet() {
  document.getElementById('schedule-add-sheet').style.display = 'none';
  scheduleAddState = null;
}

// Shared by the 문서함 upload sheet and the inline "새 문서 업로드" flow inside
// the schedule sheet: compresses/reads the file, runs OCR-based category
// guessing for images (skipped for PDFs, which Tesseract can't read), and
// rejects files that would still be too large for a Firestore document.
async function processDocumentFile(file, onProgress) {
  const isImage = file.type.startsWith('image/');
  let dataUrl;
  let category = 'other';
  if (isImage) {
    onProgress?.('이미지 압축 중...');
    dataUrl = await compressImageToDataUrl(file);
    try {
      onProgress?.('문서 내용 인식 중...');
      const text = await recognizeReceiptImage(file, (pct) => onProgress?.(`문서 내용 인식 중... ${pct}%`));
      category = guessDocumentCategoryFromText(text);
    } catch (err) {
      category = 'other';
    }
  } else {
    onProgress?.('파일 읽는 중...');
    dataUrl = await fileToDataUrl(file);
  }
  if (dataUrl.length > 900 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }
  return { fileName: file.name, mimeType: file.type, dataUrl, category };
}

function bindScheduleAddSheet() {
  const overlay = document.getElementById('schedule-add-sheet');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'schedule-add-close') {
      closeScheduleAddSheet();
      return;
    }

    const resultBtn = e.target.closest('.schedule-search-result');
    if (resultBtn && scheduleAddState) {
      scheduleAddState.selectedPlace = scheduleAddState.searchResults[Number(resultBtn.dataset.index)];
      renderScheduleAddSheetBody(scheduleAddState);
      return;
    }

    const docChip = e.target.closest('.schedule-doc-chip');
    if (docChip && scheduleAddState) {
      const id = docChip.dataset.id;
      const idx = scheduleAddState.documentIds.indexOf(id);
      if (idx === -1) scheduleAddState.documentIds.push(id);
      else scheduleAddState.documentIds.splice(idx, 1);
      renderScheduleAddSheetBody(scheduleAddState);
      return;
    }

    if (e.target.id === 'btn-schedule-upload-doc') {
      document.getElementById('input-schedule-doc-file').click();
      return;
    }

    const inlineCategoryChip = e.target.closest('.doc-inline-category-chip');
    if (inlineCategoryChip && scheduleAddState?.inlineUpload) {
      scheduleAddState.inlineUpload.category = inlineCategoryChip.dataset.id;
      renderScheduleAddSheetBody(scheduleAddState);
      return;
    }

    if (e.target.id === 'btn-confirm-inline-doc' && scheduleAddState?.inlineUpload) {
      const u = scheduleAddState.inlineUpload;
      const newDoc = addDocument({
        fileName: u.fileName,
        mimeType: u.mimeType,
        dataUrl: u.dataUrl,
        category: u.category,
        uploadedBy: getUserName(),
        createdAt: Date.now()
      });
      scheduleAddState.documentIds.push(newDoc.id);
      scheduleAddState.inlineUpload = null;
      renderScheduleAddSheetBody(scheduleAddState);
      return;
    }

    if (e.target.id === 'btn-save-schedule') {
      const name = document.getElementById('input-schedule-name').value.trim();
      if (!name) {
        alert('이름을 입력해주세요.');
        return;
      }
      const memo = document.getElementById('input-schedule-memo').value.trim();
      const place = scheduleAddState.selectedPlace;
      const fields = {
        date: scheduleAddState.date,
        hour: scheduleAddState.hour,
        name,
        memo,
        address: place?.address || '',
        placeUrl: place?.placeUrl || '',
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        documentIds: scheduleAddState.documentIds
      };
      if (scheduleAddState.id) {
        updateScheduleItem(scheduleAddState.id, fields);
      } else {
        addScheduleItem({ ...fields, createdBy: getUserName() });
      }
      closeScheduleAddSheet();
      renderScheduleScreen();
      return;
    }

    if (e.target.id === 'btn-delete-schedule') {
      if (!confirm('이 일정을 삭제할까요?')) return;
      deleteScheduleItem(scheduleAddState.id);
      closeScheduleAddSheet();
      renderScheduleScreen();
    }
  });

  overlay.addEventListener('input', (e) => {
    if (e.target.id !== 'input-schedule-search') return;
    const keyword = e.target.value.trim();
    clearTimeout(scheduleSearchDebounceTimer);
    const resultsEl = document.getElementById('schedule-search-results');
    if (!keyword) {
      scheduleAddState.searchResults = null;
      resultsEl.innerHTML = '';
      return;
    }
    scheduleSearchDebounceTimer = setTimeout(async () => {
      try {
        const results = await searchGooglePlaces(keyword);
        scheduleAddState.searchResults = results;
        resultsEl.innerHTML = scheduleSearchResultsHtml(results);
      } catch (err) {
        resultsEl.innerHTML = '<p class="field-hint" style="margin:6px 0 0">검색을 사용할 수 없어요. 이름을 직접 입력해주세요.</p>';
      }
    }, 400);
  });

  overlay.addEventListener('change', async (e) => {
    if (e.target.id !== 'input-schedule-doc-file') return;
    const file = e.target.files[0];
    if (!file) return;
    scheduleAddState.inlineUpload = { status: 'processing', message: '문서 처리 중...' };
    renderScheduleAddSheetBody(scheduleAddState);
    try {
      const processed = await processDocumentFile(file, (msg) => {
        if (scheduleAddState.inlineUpload) {
          scheduleAddState.inlineUpload.message = msg;
        }
      });
      scheduleAddState.inlineUpload = { status: 'ready', ...processed };
    } catch (err) {
      alert(err.message === 'FILE_TOO_LARGE' ? '파일이 너무 커요. 더 작은 파일로 다시 시도해주세요.' : '문서를 처리하지 못했습니다. 다시 시도해주세요.');
      scheduleAddState.inlineUpload = null;
    } finally {
      e.target.value = '';
      renderScheduleAddSheetBody(scheduleAddState);
    }
  });
}

function bindDocumentsScreen() {
  document.getElementById('screen-documents').addEventListener('click', (e) => {
    if (e.target.closest('#btn-add-document')) {
      openDocumentUploadSheet();
      return;
    }

    const tab = e.target.closest('.document-category-tab');
    if (tab) {
      documentCategoryFilter = tab.dataset.id;
      renderDocumentsScreen();
      return;
    }

    const openBtn = e.target.closest('.doc-card-open-btn');
    if (openBtn) {
      const doc = getDocumentById(openBtn.dataset.id);
      if (doc) window.open(doc.dataUrl, '_blank', 'noopener');
      return;
    }

    const deleteBtn = e.target.closest('.doc-card-delete-btn');
    if (deleteBtn) {
      if (!confirm('이 문서를 삭제할까요?')) return;
      deleteDocument(deleteBtn.dataset.id);
      renderDocumentsScreen();
    }
  });
}

let documentUploadState = null;

function openDocumentUploadSheet() {
  documentUploadState = { file: null, status: null, message: '', fileName: '', category: 'other', mimeType: '', dataUrl: '', autoClassified: false };
  renderDocumentUploadSheetBody(documentUploadState);
  document.getElementById('document-upload-sheet').style.display = 'flex';
}

function closeDocumentUploadSheet() {
  document.getElementById('document-upload-sheet').style.display = 'none';
  documentUploadState = null;
  renderDocumentsScreen();
}

function bindDocumentUploadSheet() {
  const overlay = document.getElementById('document-upload-sheet');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'document-upload-close') {
      closeDocumentUploadSheet();
      return;
    }

    const categoryChip = e.target.closest('.document-category-chip');
    if (categoryChip && documentUploadState) {
      documentUploadState.category = categoryChip.dataset.id;
      documentUploadState.autoClassified = false;
      renderDocumentUploadSheetBody(documentUploadState);
      return;
    }

    if (e.target.id === 'btn-save-document') {
      const fileName = document.getElementById('input-document-name').value.trim();
      if (!fileName) {
        alert('파일명을 입력해주세요.');
        return;
      }
      addDocument({
        fileName,
        mimeType: documentUploadState.mimeType,
        dataUrl: documentUploadState.dataUrl,
        category: documentUploadState.category,
        uploadedBy: getUserName(),
        createdAt: Date.now()
      });
      closeDocumentUploadSheet();
    }
  });

  overlay.addEventListener('change', async (e) => {
    if (e.target.id !== 'input-document-file') return;
    const file = e.target.files[0];
    if (!file) return;
    documentUploadState.file = file;
    documentUploadState.status = 'processing';
    documentUploadState.message = '문서 처리 중...';
    renderDocumentUploadSheetBody(documentUploadState);
    try {
      const processed = await processDocumentFile(file, (msg) => {
        documentUploadState.message = msg;
        renderDocumentUploadSheetBody(documentUploadState);
      });
      documentUploadState.status = 'ready';
      documentUploadState.fileName = processed.fileName;
      documentUploadState.mimeType = processed.mimeType;
      documentUploadState.dataUrl = processed.dataUrl;
      documentUploadState.category = processed.category;
      documentUploadState.autoClassified = true;
    } catch (err) {
      alert(err.message === 'FILE_TOO_LARGE' ? '파일이 너무 커요. 더 작은 파일로 다시 시도해주세요.' : '문서를 처리하지 못했습니다. 다시 시도해주세요.');
      documentUploadState.file = null;
      documentUploadState.status = null;
    }
    renderDocumentUploadSheetBody(documentUploadState);
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

function openParticipantSheet() {
  renderParticipantSheetBody();
  document.getElementById('participant-sheet').style.display = 'flex';
}

function closeParticipantSheet() {
  document.getElementById('participant-sheet').style.display = 'none';
  renderPackingScreen();
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
      const participants = [...(settings.packingParticipants || [])];
      const [removed] = participants.splice(Number(removeBtn.dataset.index), 1);
      saveSettings({ ...settings, packingParticipants: participants });
      // reassign that person's items to unassigned so nothing silently vanishes
      getPackingItems().filter(i => i.assignee === removed).forEach(i => updatePackingItem(i.id, { assignee: null }));
      renderParticipantSheetBody();
      return;
    }

    if (e.target.id === 'btn-add-participant') {
      const input = document.getElementById('input-new-participant');
      const name = input.value.trim();
      if (!name) return;
      const settings = getSettings();
      const participants = [...(settings.packingParticipants || [])];
      if (participants.includes(name)) {
        input.value = '';
        return;
      }
      participants.push(name);
      saveSettings({ ...settings, packingParticipants: participants });
      renderParticipantSheetBody();
    }
  });
}

bindSettingsForm();
bindExpenseForm();
bindExpenseList();
bindAddExpenseButtons();
bindDashboardCategoryFilter();
bindBackupButtons();
bindResetButton();
bindDateRangeSheet();
bindScheduleScreen();
bindScheduleAddSheet();
bindPackingScreen();
bindPackingAddSheet();
bindParticipantSheet();
bindDocumentsScreen();
bindDocumentUploadSheet();

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
  if (initSharedModeFromUrl()) {
    document.getElementById('sync-loading').style.display = 'flex';
    startSharedSync(
      () => {
        document.getElementById('sync-loading').style.display = 'none';
        showScreen(getSettings() ? 'dashboard' : 'settings');
      },
      () => {
        renderDashboardScreen();
        renderExpenseListScreen();
        renderScheduleScreen();
        renderPackingScreen();
        renderDocumentsScreen();
      }
    );
    return;
  }
  showScreen(getSettings() ? 'dashboard' : 'settings');
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
