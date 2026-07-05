function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
}

function bindSettingsForm() {
  document.getElementById('screen-settings').addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const settings = {
      totalBudget: Number(document.getElementById('input-total-budget').value),
      thbRate: Number(document.getElementById('input-thb-rate').value),
      usdRate: Number(document.getElementById('input-usd-rate').value),
      tripStartDate: document.getElementById('input-trip-start').value,
      tripEndDate: document.getElementById('input-trip-end').value
    };
    saveSettings(settings);
    document.getElementById('settings-message').textContent = '저장되었습니다.';
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
    const amount = Number(document.getElementById('input-expense-amount').value);
    const memo = document.getElementById('input-expense-memo').value;
    const krwAmount = toKRW(amount, currency, settings);
    if (krwAmount === null) {
      document.getElementById('expense-form-message').textContent = '환율이 설정되지 않았습니다. 설정 화면에서 환율을 입력해주세요.';
      return;
    }
    const expenseData = { date, currency, amount, krwAmount, memo };
    if (id) {
      updateExpense(id, expenseData);
    } else {
      addExpense(expenseData);
    }
    showScreen('dashboard');
  });

  container.addEventListener('click', (e) => {
    if (e.target.id === 'btn-delete-expense') {
      const id = document.getElementById('input-expense-id').value;
      deleteExpense(id);
      showScreen('dashboard');
    }
  });
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

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
        document.getElementById('settings-message').textContent = '복원되었습니다.';
      } catch (err) {
        alert('올바르지 않은 백업 파일입니다.');
      }
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
