const STORAGE_KEYS = {
  SETTINGS: 'cmb_settings',
  EXPENSES: 'cmb_expenses'
};

function getSettings() {
  const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function getExpenses() {
  const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  return raw ? JSON.parse(raw) : [];
}

function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
}

function generateId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addExpense(expense) {
  const expenses = getExpenses();
  const newExpense = { ...expense, id: generateId() };
  expenses.push(newExpense);
  saveExpenses(expenses);
  return newExpense;
}

function updateExpense(id, updatedFields) {
  const expenses = getExpenses();
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return null;
  expenses[index] = { ...expenses[index], ...updatedFields };
  saveExpenses(expenses);
  return expenses[index];
}

function deleteExpense(id) {
  const expenses = getExpenses().filter(e => e.id !== id);
  saveExpenses(expenses);
}

function getExpenseById(id) {
  return getExpenses().find(e => e.id === id) || null;
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.EXPENSES);
}
