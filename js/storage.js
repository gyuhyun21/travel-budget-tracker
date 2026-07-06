const STORAGE_KEYS = {
  SETTINGS: 'cmb_settings',
  EXPENSES: 'cmb_expenses',
  MEALS: 'cmb_meals',
  PACKING_ITEMS: 'cmb_packing_items',
  TRIP_ID: 'cmb_shared_trip_id'
};

// This device's display name. Deliberately outside STORAGE_KEYS/resetAllData
// — it identifies the person using this browser, not the trip's data, so it
// should survive resets and switching between trips.
const USER_NAME_KEY = 'cmb_user_name';

function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, name);
}

// When a trip is shared, all reads/writes below route to these in-memory
// caches (kept live by Firestore's onSnapshot listeners in sync.js) instead
// of localStorage. See startSharedSync().
let sharedTripId = null;
let cachedSettings = null;
let cachedExpenses = [];
let cachedMeals = [];
let cachedPackingItems = [];

function isSharedMode() {
  return !!sharedTripId;
}

function getSharedTripId() {
  return sharedTripId;
}

// Call once at startup. Binds this browser to a shared trip if the page was
// opened with ?trip=ID, or if it was already bound to one on a previous
// visit. Returns true if shared mode is active.
function initSharedModeFromUrl() {
  const urlTripId = getTripIdFromUrl();
  const storedTripId = localStorage.getItem(STORAGE_KEYS.TRIP_ID);
  const tripId = urlTripId || storedTripId;
  if (!tripId) return false;
  sharedTripId = tripId;
  localStorage.setItem(STORAGE_KEYS.TRIP_ID, tripId);
  if (!urlTripId) {
    const url = new URL(window.location.href);
    url.searchParams.set('trip', tripId);
    window.history.replaceState({}, '', url);
  }
  return true;
}

let initialSyncDone = false;

// Subscribes to the shared trip's live data. onReady fires once both the
// settings doc and the expenses collection have delivered their first
// snapshot; onUpdate fires on every snapshot after that (including ones
// caused by our own writes, which is harmless since renders are idempotent).
function startSharedSync(onReady, onUpdate) {
  let settingsSeen = false;
  let expensesSeen = false;
  let mealsSeen = false;
  let packingSeen = false;
  const maybeReady = () => {
    if (initialSyncDone) { onUpdate(); return; }
    if (settingsSeen && expensesSeen && mealsSeen && packingSeen) { initialSyncDone = true; onReady(); }
  };
  subscribeToTrip(sharedTripId, {
    onSettings: (settings) => { cachedSettings = settings; settingsSeen = true; maybeReady(); },
    onExpenses: (expenses) => { cachedExpenses = expenses; expensesSeen = true; maybeReady(); },
    onMeals: (meals) => { cachedMeals = meals; mealsSeen = true; maybeReady(); },
    onPackingItems: (items) => { cachedPackingItems = items; packingSeen = true; maybeReady(); }
  });
}

// Turns the current local trip into a shared one: copies today's settings
// and expenses into a fresh Firestore document, binds this browser to it,
// and returns the link others can open to join.
async function enableSharingForCurrentData() {
  const settings = getSettings();
  const expenses = getExpenses();
  const meals = getMeals();
  const packingItems = getPackingItems();
  const tripId = await fsCreateTrip(settings, expenses, meals, packingItems);
  sharedTripId = tripId;
  initialSyncDone = true;
  localStorage.setItem(STORAGE_KEYS.TRIP_ID, tripId);
  const url = new URL(window.location.href);
  url.searchParams.set('trip', tripId);
  window.history.replaceState({}, '', url);
  cachedSettings = settings;
  cachedExpenses = expenses;
  cachedMeals = meals;
  cachedPackingItems = packingItems;
  startSharedSync(() => {}, () => {
    renderDashboardScreen();
    renderExpenseListScreen();
    renderMealPlanScreen();
    renderPackingScreen();
  });
  return shareUrlForTrip(tripId);
}

// Copies the current shared data back into localStorage and detaches this
// browser from the shared trip, so it goes back to being a private local
// copy. Other participants keep collaborating on the shared trip as before.
function disableSharing() {
  const settings = cachedSettings;
  const expenses = cachedExpenses;
  const meals = cachedMeals;
  const packingItems = cachedPackingItems;
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  localStorage.removeItem(STORAGE_KEYS.TRIP_ID);
  if (settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(meals));
  localStorage.setItem(STORAGE_KEYS.PACKING_ITEMS, JSON.stringify(packingItems));
}

function getSettings() {
  if (isSharedMode()) return cachedSettings;
  const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  if (isSharedMode()) {
    cachedSettings = settings;
    fsSaveSettings(sharedTripId, settings);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function getExpenses() {
  if (isSharedMode()) return cachedExpenses;
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
  const newExpense = { ...expense, id: generateId() };
  if (isSharedMode()) {
    cachedExpenses = [...cachedExpenses, newExpense];
    fsSetExpense(sharedTripId, newExpense.id, expense);
    return newExpense;
  }
  const expenses = getExpenses();
  expenses.push(newExpense);
  saveExpenses(expenses);
  return newExpense;
}

function updateExpense(id, updatedFields) {
  if (isSharedMode()) {
    const index = cachedExpenses.findIndex(e => e.id === id);
    if (index === -1) return null;
    const updated = { ...cachedExpenses[index], ...updatedFields };
    cachedExpenses = [...cachedExpenses.slice(0, index), updated, ...cachedExpenses.slice(index + 1)];
    fsUpdateExpense(sharedTripId, id, updatedFields);
    return updated;
  }
  const expenses = getExpenses();
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return null;
  expenses[index] = { ...expenses[index], ...updatedFields };
  saveExpenses(expenses);
  return expenses[index];
}

function deleteExpense(id) {
  if (isSharedMode()) {
    cachedExpenses = cachedExpenses.filter(e => e.id !== id);
    fsDeleteExpense(sharedTripId, id);
    return;
  }
  const expenses = getExpenses().filter(e => e.id !== id);
  saveExpenses(expenses);
}

function getExpenseById(id) {
  return getExpenses().find(e => e.id === id) || null;
}

function getMeals() {
  if (isSharedMode()) return cachedMeals;
  const raw = localStorage.getItem(STORAGE_KEYS.MEALS);
  return raw ? JSON.parse(raw) : [];
}

function saveMeals(meals) {
  localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(meals));
}

function addMeal(meal) {
  const newMeal = { ...meal, id: generateId() };
  if (isSharedMode()) {
    cachedMeals = [...cachedMeals, newMeal];
    fsSetMeal(sharedTripId, newMeal.id, meal);
    return newMeal;
  }
  const meals = getMeals();
  meals.push(newMeal);
  saveMeals(meals);
  return newMeal;
}

function deleteMeal(id) {
  if (isSharedMode()) {
    cachedMeals = cachedMeals.filter(m => m.id !== id);
    fsDeleteMeal(sharedTripId, id);
    return;
  }
  const meals = getMeals().filter(m => m.id !== id);
  saveMeals(meals);
}

function getPackingItems() {
  if (isSharedMode()) return cachedPackingItems;
  const raw = localStorage.getItem(STORAGE_KEYS.PACKING_ITEMS);
  return raw ? JSON.parse(raw) : [];
}

function savePackingItems(items) {
  localStorage.setItem(STORAGE_KEYS.PACKING_ITEMS, JSON.stringify(items));
}

function addPackingItem(item) {
  const newItem = { checked: false, ...item, id: generateId() };
  if (isSharedMode()) {
    cachedPackingItems = [...cachedPackingItems, newItem];
    const { id, ...data } = newItem;
    fsSetPackingItem(sharedTripId, id, data);
    return newItem;
  }
  const items = getPackingItems();
  items.push(newItem);
  savePackingItems(items);
  return newItem;
}

function updatePackingItem(id, updatedFields) {
  if (isSharedMode()) {
    const index = cachedPackingItems.findIndex(i => i.id === id);
    if (index === -1) return null;
    const updated = { ...cachedPackingItems[index], ...updatedFields };
    cachedPackingItems = [...cachedPackingItems.slice(0, index), updated, ...cachedPackingItems.slice(index + 1)];
    fsUpdatePackingItem(sharedTripId, id, updatedFields);
    return updated;
  }
  const items = getPackingItems();
  const index = items.findIndex(i => i.id === id);
  if (index === -1) return null;
  items[index] = { ...items[index], ...updatedFields };
  savePackingItems(items);
  return items[index];
}

function deletePackingItem(id) {
  if (isSharedMode()) {
    cachedPackingItems = cachedPackingItems.filter(i => i.id !== id);
    fsDeletePackingItem(sharedTripId, id);
    return;
  }
  const items = getPackingItems().filter(i => i.id !== id);
  savePackingItems(items);
}

function getPackingItemById(id) {
  return getPackingItems().find(i => i.id === id) || null;
}

function resetAllData() {
  if (isSharedMode()) disableSharing();
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.EXPENSES);
  localStorage.removeItem(STORAGE_KEYS.MEALS);
  localStorage.removeItem(STORAGE_KEYS.PACKING_ITEMS);
}
