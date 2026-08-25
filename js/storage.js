// packingParticipants used to be a plain array of name strings; it's now an
// array of { name, count } so N-way splits can weight by family/group size.
// Old string entries are normalized to count:1 on read.
function getParticipants() {
  const raw = getSettings()?.packingParticipants || [];
  return raw.map(p => typeof p === 'string' ? { name: p, count: 1 } : p);
}

// This device's display name. Deliberately outside event storage/deleteEvent
// — it identifies the person using this browser, not any one event's data,
// so it should survive deleting/switching between events.
const USER_NAME_KEY = 'cmb_user_name';

function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, name);
}

/* ---------- Event index ---------- */

const EVENTS_KEY = 'cmb_events';
const ACTIVE_EVENT_KEY = 'cmb_active_event_id';

function eventKey(id, suffix) {
  return `cmb_event_${id}_${suffix}`;
}

function getEvents() {
  const raw = localStorage.getItem(EVENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEventsList(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function getActiveEventId() {
  return localStorage.getItem(ACTIVE_EVENT_KEY);
}

function setActiveEventId(id) {
  if (id) localStorage.setItem(ACTIVE_EVENT_KEY, id);
  else localStorage.removeItem(ACTIVE_EVENT_KEY);
}

function updateEventMeta(id, fields) {
  const events = getEvents();
  const index = events.findIndex(e => e.id === id);
  if (index === -1) return;
  events[index] = { ...events[index], ...fields };
  saveEventsList(events);
}

// Bumps the active event's updatedAt so the events list can sort by "most
// recently touched". Called at the end of every settings/expense/packing
// write, including ones that arrive via a Firestore snapshot (someone
// else's edit on a shared event still counts as activity on this device).
function touchActiveEvent() {
  const id = getActiveEventId();
  if (!id) return;
  updateEventMeta(id, { updatedAt: Date.now() });
}

// Raw reads used only by the events list screen, which needs to display a
// summary for every event without disturbing whichever one is currently
// active (and without opening a live Firestore connection to each one).
// For a shared event this reflects "as of the last time this device synced
// it", kept fresh by startSharedSync's write-through caching below.
function readEventSettings(id) {
  const raw = localStorage.getItem(eventKey(id, 'settings'));
  return raw ? JSON.parse(raw) : {};
}

function readEventExpenses(id) {
  const raw = localStorage.getItem(eventKey(id, 'expenses'));
  return raw ? JSON.parse(raw) : [];
}

function createEvent(title) {
  const events = getEvents();
  const id = generateShortId();
  const now = Date.now();
  events.push({ id, status: 'active', tripId: null, createdAt: now, updatedAt: now });
  saveEventsList(events);
  localStorage.setItem(eventKey(id, 'settings'), JSON.stringify({ tripName: title }));
  enterEvent(id);
  return id;
}

function deleteEvent(id) {
  if (getActiveEventId() === id && isSharedMode()) disableSharing();
  const events = getEvents().filter(e => e.id !== id);
  saveEventsList(events);
  localStorage.removeItem(eventKey(id, 'settings'));
  localStorage.removeItem(eventKey(id, 'expenses'));
  localStorage.removeItem(eventKey(id, 'packing'));
  if (getActiveEventId() === id) leaveEvent();
}

// Switches the active event. Always tears down any previous Firestore
// listener first (a stale listener from the last event must never deliver
// updates into the newly-opened one). Returns true if the event being
// entered is shared, in which case the caller is responsible for calling
// startSharedSync (mirrors today's initSharedModeFromUrl/boot() pattern).
function enterEvent(id) {
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  cachedSettings = null;
  cachedExpenses = [];
  cachedPackingItems = [];
  setActiveEventId(id);
  const meta = getEvents().find(e => e.id === id);
  if (meta && meta.tripId) {
    sharedTripId = meta.tripId;
    return true;
  }
  return false;
}

function leaveEvent() {
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  cachedSettings = null;
  cachedExpenses = [];
  cachedPackingItems = [];
  setActiveEventId(null);
}

/* ---------- Shared-trip sync state ---------- */

// When the active event is shared, all reads/writes below route to these
// in-memory caches (kept live by Firestore's onSnapshot listeners in
// sync.js) instead of localStorage. See startSharedSync().
let sharedTripId = null;
let cachedSettings = null;
let cachedExpenses = [];
let cachedPackingItems = [];
let initialSyncDone = false;

function isSharedMode() {
  return !!sharedTripId;
}

function getSharedTripId() {
  return sharedTripId;
}

// Call once at startup. If the page was opened with ?trip=ID, binds this
// browser to that event: reuses the matching local event if this device
// has already joined it before, otherwise registers a brand-new event
// entry for it. Returns true if an event was opened this way.
function initSharedModeFromUrl() {
  const urlTripId = getTripIdFromUrl();
  if (!urlTripId) return false;
  const events = getEvents();
  let meta = events.find(e => e.tripId === urlTripId);
  if (!meta) {
    meta = { id: urlTripId, status: 'active', tripId: urlTripId, createdAt: Date.now(), updatedAt: Date.now() };
    events.push(meta);
    saveEventsList(events);
  }
  enterEvent(meta.id);
  return true;
}

// Subscribes to the active event's live data (it must already be shared —
// i.e. enterEvent()/initSharedModeFromUrl() returned true, or
// enableSharingForCurrentData() just ran). onReady fires once settings,
// expenses and packing items have all delivered their first snapshot;
// onUpdate fires on every snapshot after that (including ones caused by
// our own writes, which is harmless since renders are idempotent). Every
// snapshot is also written through to this event's local cache so the
// events list can read a reasonably fresh summary without a live
// connection.
function startSharedSync(onReady, onUpdate) {
  const id = getActiveEventId();
  let settingsSeen = false;
  let expensesSeen = false;
  let packingSeen = false;
  const maybeReady = () => {
    if (initialSyncDone) { onUpdate(); return; }
    if (settingsSeen && expensesSeen && packingSeen) { initialSyncDone = true; onReady(); }
  };
  subscribeToTrip(sharedTripId, {
    onSettings: (settings) => {
      cachedSettings = settings;
      if (settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
      touchActiveEvent();
      settingsSeen = true;
      maybeReady();
    },
    onExpenses: (expenses) => {
      cachedExpenses = expenses;
      localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
      touchActiveEvent();
      expensesSeen = true;
      maybeReady();
    },
    onPackingItems: (items) => {
      cachedPackingItems = items;
      localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(items));
      touchActiveEvent();
      packingSeen = true;
      maybeReady();
    }
  });
}

// Turns the active (local) event into a shared one: copies its current
// settings/expenses/packing into a fresh Firestore document keyed by the
// event's own id (so the event's id never changes, whether or not it's
// shared), and returns the link others can open to join.
async function enableSharingForCurrentData() {
  const id = getActiveEventId();
  const settings = getSettings();
  const expenses = getExpenses();
  const packingItems = getPackingItems();
  await fsCreateTrip(id, settings, expenses, packingItems);
  sharedTripId = id;
  initialSyncDone = true;
  updateEventMeta(id, { tripId: id });
  const url = new URL(window.location.href);
  url.searchParams.set('trip', id);
  window.history.replaceState({}, '', url);
  cachedSettings = settings;
  cachedExpenses = expenses;
  cachedPackingItems = packingItems;
  startSharedSync(() => {}, () => {
    renderDashboardScreen();
    renderExpenseListScreen();
    renderPackingScreen();
  });
  return shareUrlForTrip(id);
}

// Copies the current shared data back into this event's local storage and
// detaches this browser from it, so it goes back to being a private local
// copy. Other participants keep collaborating on the shared event as
// before; only this device's tripId link is cleared.
function disableSharing() {
  const id = getActiveEventId();
  const settings = cachedSettings;
  const expenses = cachedExpenses;
  const packingItems = cachedPackingItems;
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  updateEventMeta(id, { tripId: null });
  if (settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
  localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
  localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(packingItems));
}

/* ---------- Active-event data (settings / expenses / packing) ---------- */

function getSettings() {
  if (isSharedMode()) return cachedSettings;
  const id = getActiveEventId();
  if (!id) return null;
  const raw = localStorage.getItem(eventKey(id, 'settings'));
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  const id = getActiveEventId();
  if (!id) throw new Error('saveSettings called with no active event');
  if (isSharedMode()) {
    cachedSettings = settings;
    fsSaveSettings(sharedTripId, settings);
  }
  localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
  touchActiveEvent();
}

function getExpenses() {
  if (isSharedMode()) return cachedExpenses;
  const id = getActiveEventId();
  if (!id) return [];
  const raw = localStorage.getItem(eventKey(id, 'expenses'));
  return raw ? JSON.parse(raw) : [];
}

function saveExpenses(expenses) {
  const id = getActiveEventId();
  if (!id) throw new Error('saveExpenses called with no active event');
  localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
}

function generateId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addExpense(expense) {
  const newExpense = { ...expense, id: generateId() };
  if (isSharedMode()) {
    cachedExpenses = [...cachedExpenses, newExpense];
    fsSetExpense(sharedTripId, newExpense.id, expense);
  } else {
    const expenses = getExpenses();
    expenses.push(newExpense);
    saveExpenses(expenses);
  }
  touchActiveEvent();
  return newExpense;
}

function updateExpense(id, updatedFields) {
  let result;
  if (isSharedMode()) {
    const index = cachedExpenses.findIndex(e => e.id === id);
    if (index === -1) return null;
    const updated = { ...cachedExpenses[index], ...updatedFields };
    cachedExpenses = [...cachedExpenses.slice(0, index), updated, ...cachedExpenses.slice(index + 1)];
    fsUpdateExpense(sharedTripId, id, updatedFields);
    result = updated;
  } else {
    const expenses = getExpenses();
    const index = expenses.findIndex(e => e.id === id);
    if (index === -1) return null;
    expenses[index] = { ...expenses[index], ...updatedFields };
    saveExpenses(expenses);
    result = expenses[index];
  }
  touchActiveEvent();
  return result;
}

function deleteExpense(id) {
  if (isSharedMode()) {
    cachedExpenses = cachedExpenses.filter(e => e.id !== id);
    fsDeleteExpense(sharedTripId, id);
  } else {
    const expenses = getExpenses().filter(e => e.id !== id);
    saveExpenses(expenses);
  }
  touchActiveEvent();
}

function getExpenseById(id) {
  return getExpenses().find(e => e.id === id) || null;
}

function getPackingItems() {
  if (isSharedMode()) return cachedPackingItems;
  const id = getActiveEventId();
  if (!id) return [];
  const raw = localStorage.getItem(eventKey(id, 'packing'));
  return raw ? JSON.parse(raw) : [];
}

function savePackingItems(items) {
  const id = getActiveEventId();
  if (!id) throw new Error('savePackingItems called with no active event');
  localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(items));
}

function addPackingItem(item) {
  const newItem = { checked: false, ...item, id: generateId() };
  if (isSharedMode()) {
    cachedPackingItems = [...cachedPackingItems, newItem];
    const { id, ...data } = newItem;
    fsSetPackingItem(sharedTripId, id, data);
  } else {
    const items = getPackingItems();
    items.push(newItem);
    savePackingItems(items);
  }
  touchActiveEvent();
  return newItem;
}

function updatePackingItem(id, updatedFields) {
  let result;
  if (isSharedMode()) {
    const index = cachedPackingItems.findIndex(i => i.id === id);
    if (index === -1) return null;
    const updated = { ...cachedPackingItems[index], ...updatedFields };
    cachedPackingItems = [...cachedPackingItems.slice(0, index), updated, ...cachedPackingItems.slice(index + 1)];
    fsUpdatePackingItem(sharedTripId, id, updatedFields);
    result = updated;
  } else {
    const items = getPackingItems();
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updatedFields };
    savePackingItems(items);
    result = items[index];
  }
  touchActiveEvent();
  return result;
}

function deletePackingItem(id) {
  if (isSharedMode()) {
    cachedPackingItems = cachedPackingItems.filter(i => i.id !== id);
    fsDeletePackingItem(sharedTripId, id);
  } else {
    const items = getPackingItems().filter(i => i.id !== id);
    savePackingItems(items);
  }
  touchActiveEvent();
}

function getPackingItemById(id) {
  return getPackingItems().find(i => i.id === id) || null;
}
