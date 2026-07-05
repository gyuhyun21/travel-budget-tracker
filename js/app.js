function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.getElementById('fab-add-expense').style.display = (name === 'add-expense' || name === 'settings') ? 'none' : 'flex';
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
}

function bindSettingsForm() {
  const container = document.getElementById('screen-settings');

  container.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const settings = {
      tripName: document.getElementById('input-trip-name').value.trim(),
      totalBudget: parseMoneyInput(document.getElementById('input-total-budget').value),
      thbRate: parseMoneyInput(document.getElementById('input-thb-rate').value),
      usdRate: parseMoneyInput(document.getElementById('input-usd-rate').value),
      tripStartDate: document.getElementById('input-trip-start').value,
      tripEndDate: document.getElementById('input-trip-end').value
    };
    saveSettings(settings);
    const message = document.getElementById('settings-message');
    message.textContent = '저장되었습니다.';
    message.style.display = 'block';
  });

  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('input-money')) formatMoneyInput(e.target);
  });
}

function setActiveSegment(groupEl, hiddenInput, value) {
  hiddenInput.value = value;
  groupEl.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
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
    const krwAmount = toKRW(amount, currency, settings);
    const messageEl = document.getElementById('expense-form-message');
    if (krwAmount === null) {
      messageEl.textContent = '환율이 설정되지 않았습니다. 설정 화면에서 환율을 입력해주세요.';
      messageEl.style.display = 'block';
      return;
    }
    const expenseData = { date, currency, amount, krwAmount, category, memo };
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
      setActiveSegment(
        document.getElementById('currency-segmented'),
        document.getElementById('input-expense-currency'),
        currencyBtn.dataset.value
      );
      return;
    }

    const categoryBtn = e.target.closest('.category-btn');
    if (categoryBtn) {
      setActiveSegment(
        document.getElementById('category-segmented'),
        document.getElementById('input-expense-category'),
        categoryBtn.dataset.value
      );
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
      setActiveSegment(
        document.getElementById('category-segmented'),
        document.getElementById('input-expense-category'),
        guessedCategory
      );
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

document.getElementById('fab-add-expense').addEventListener('click', () => showScreen('add-expense'));

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
    const data = { settings: getSettings(), expenses: getExpenses() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chiangmai-budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        renderSettingsScreen();
        renderDashboardScreen();
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

bindSettingsForm();
bindExpenseForm();
bindExpenseList();
bindBackupButtons();

if (!getSettings()) {
  showScreen('settings');
} else {
  showScreen('dashboard');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
