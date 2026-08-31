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

const SHARED_LIST_KEY = 'cmb_shared_list_id';

function getSharedListId() {
  return localStorage.getItem(SHARED_LIST_KEY);
}

function setSharedListId(id) {
  if (id) localStorage.setItem(SHARED_LIST_KEY, id);
  else localStorage.removeItem(SHARED_LIST_KEY);
}

// Date.now() has only millisecond resolution, so two events created or
// touched in rapid synchronous succession can tie — which breaks "most
// recently updated first" sorting on the events list. These timestamps are
// never shown as wall-clock dates anywhere in the UI (grep confirms), only
// used as a sort key, so guaranteeing strict monotonic increase matters
// more here than real-time accuracy.
let lastEventTimestamp = 0;
function nextEventTimestamp() {
  lastEventTimestamp = Math.max(Date.now(), lastEventTimestamp + 1);
  return lastEventTimestamp;
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
  updateEventMeta(id, { updatedAt: nextEventTimestamp() });
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

function readEventPackingItems(id) {
  const raw = localStorage.getItem(eventKey(id, 'packing'));
  return raw ? JSON.parse(raw) : [];
}

// Writes a one-time-fetched trip snapshot (from fsFetchTripOnce) into an
// event's local cache. `data.settings` can be null (trip doc didn't
// exist, e.g. a race with the trip being created) — in that case leave
// whatever settings are already cached rather than overwriting with
// nothing.
function writeEventSnapshot(id, data) {
  if (data.settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(data.settings));
  localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(data.expenses));
  localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(data.packingItems));
}

function createEvent(title) {
  const events = getEvents();
  const id = generateShortId();
  const now = nextEventTimestamp();
  events.push({ id, status: 'active', tripId: null, createdAt: now, updatedAt: now });
  saveEventsList(events);
  localStorage.setItem(eventKey(id, 'settings'), JSON.stringify({ tripName: title }));
  enterEvent(id);
  return id;
}

function deleteEvent(id) {
  const meta = getEvents().find(e => e.id === id);
  if (getActiveEventId() === id && isSharedMode()) disableSharing();
  if (meta?.tripId && getSharedListId()) {
    fsRemoveListEvent(getSharedListId(), meta.tripId);
  }
  const events = getEvents().filter(e => e.id !== id);
  saveEventsList(events);
  localStorage.removeItem(eventKey(id, 'settings'));
  localStorage.removeItem(eventKey(id, 'expenses'));
  localStorage.removeItem(eventKey(id, 'packing'));
  if (getActiveEventId() === id) leaveEvent();
}

// Tears down any live Firestore subscription and clears the in-memory
// shared-mode caches. Shared by enterEvent()/leaveEvent() so switching or
// leaving an event always starts from the same clean slate.
function resetSharedState() {
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  cachedSettings = null;
  cachedExpenses = [];
  cachedPackingItems = [];
}

// Switches the active event. Always tears down any previous Firestore
// listener first (a stale listener from the last event must never deliver
// updates into the newly-opened one). Returns true if the event being
// entered is shared, in which case the caller is responsible for calling
// startSharedSync (mirrors today's initSharedModeFromUrl/boot() pattern).
function enterEvent(id) {
  resetSharedState();
  setActiveEventId(id);
  const meta = getEvents().find(e => e.id === id);
  if (meta && meta.tripId) {
    sharedTripId = meta.tripId;
    return true;
  }
  return false;
}

function leaveEvent() {
  resetSharedState();
  setActiveEventId(null);
  const url = new URL(window.location.href);
  url.searchParams.delete('trip');
  window.history.replaceState({}, '', url);
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

// Fires whenever the shared list's membership changes (including the
// very first snapshot). Registers any event id this device doesn't
// already know about, fetching a one-time snapshot of its data so the
// events list can show a real title/total for it before the user ever
// opens it (opening it later starts the normal live subscription via
// enterEvent/startSharedSync, unrelated to this one-time fetch).
function startListSync() {
  const listId = getSharedListId();
  if (!listId) return;
  subscribeToList(listId, (eventIds) => {
    const events = getEvents();
    const knownIds = new Set(events.map(e => e.id));
    const newIds = eventIds.filter(eid => !knownIds.has(eid));
    if (newIds.length === 0) return;
    for (const eventId of newIds) {
      const now = nextEventTimestamp();
      events.push({ id: eventId, status: 'active', tripId: eventId, createdAt: now, updatedAt: now });
    }
    saveEventsList(events);
    const rerenderIfOnEventsScreen = () => {
      if (document.getElementById('screen-events')?.classList.contains('active')) renderEventsScreen();
    };
    for (const eventId of newIds) {
      fsFetchTripOnce(eventId)
        .then(data => writeEventSnapshot(eventId, data))
        .catch(() => {})
        .finally(rerenderIfOnEventsScreen);
    }
    rerenderIfOnEventsScreen();
  });
}

// Call once at startup. If the page was opened with ?list=ID, binds this
// device to that shared list (switching away from whatever list it was
// previously in, if different). Otherwise, if this device was already in
// a shared list from a previous session, resumes watching it. Returns
// true if this device ends up in shared-list mode either way.
function resumeOrJoinSharedList() {
  const urlListId = getListIdFromUrl();
  const storedListId = getSharedListId();
  const listId = urlListId || storedListId;
  if (!listId) return false;
  if (urlListId && urlListId !== storedListId) {
    setSharedListId(urlListId);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('list', listId);
  window.history.replaceState({}, '', url);
  startListSync();
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
      if (getActiveEventId() !== id) return;
      cachedSettings = settings;
      if (settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
      touchActiveEvent();
      settingsSeen = true;
      maybeReady();
    },
    onExpenses: (expenses) => {
      if (getActiveEventId() !== id) return;
      cachedExpenses = expenses;
      localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
      touchActiveEvent();
      expensesSeen = true;
      maybeReady();
    },
    onPackingItems: (items) => {
      if (getActiveEventId() !== id) return;
      cachedPackingItems = items;
      localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(items));
      touchActiveEvent();
      packingSeen = true;
      maybeReady();
    }
  });
}

// Uploads one event to Firestore if it isn't already shared, keyed by its
// own id (a shared event's tripId always equals its local id). Does not
// touch this device's active-event/shared-mode state — callers decide
// separately whether to also enter/watch it live.
async function ensureEventIsShared(id) {
  const meta = getEvents().find(e => e.id === id);
  if (meta && meta.tripId) return;
  const settings = readEventSettings(id);
  const expenses = readEventExpenses(id);
  const packingItems = readEventPackingItems(id);
  await fsCreateTrip(id, settings, expenses, packingItems);
  updateEventMeta(id, { tripId: id });
}

// Turns this device's whole local 모임 목록 into a shared, live-updating
// group: every event gets uploaded to Firestore (if not already shared)
// and registered in a brand-new list document, then this device starts
// watching that list for events anyone adds from now on. Returns the
// link others can open to join the whole list.
async function shareEventsList() {
  const listId = generateShortId();
  await fsCreateList(listId);
  for (const ev of getEvents()) {
    await ensureEventIsShared(ev.id);
    await fsAddListEvent(listId, ev.id);
  }
  setSharedListId(listId);
  const url = new URL(window.location.href);
  url.searchParams.set('list', listId);
  window.history.replaceState({}, '', url);
  startListSync();
  return shareUrlForList(listId);
}

// Promotes the currently-active event to shared mode right after
// ensureEventIsShared() has given it a tripId. Safe to call only when
// nothing has been written to this event since it was created in this
// same synchronous flow — this device already knows its exact current
// data (readEventSettings/readEventExpenses/readEventPackingItems), so
// enterEvent()'s cache reset can be filled back in immediately instead of
// waiting on a Firestore round-trip. Used when a brand-new event is
// created while this device is already sharing its whole list.
function promoteActiveEventToShared(id) {
  const settings = readEventSettings(id);
  const expenses = readEventExpenses(id);
  const packingItems = readEventPackingItems(id);
  enterEvent(id);
  cachedSettings = settings;
  cachedExpenses = expenses;
  cachedPackingItems = packingItems;
  startSharedSync(() => {}, () => {
    renderDashboardScreen();
    renderExpenseListScreen();
    renderPackingScreen();
  });
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
  const url = new URL(window.location.href);
  url.searchParams.delete('trip');
  window.history.replaceState({}, '', url);
}

// Stops watching the shared list and converts every event this device
// currently holds into a fully local copy, clearing each one's tripId —
// see the design note on why this must happen unconditionally for every
// event, not just the ones "from" the list: a leftover tripId would make
// enterEvent() wrongly resume live sync the next time that event opens.
async function stopSharingEventsList() {
  unsubscribeFromList();
  setSharedListId(null);
  const url = new URL(window.location.href);
  url.searchParams.delete('list');
  window.history.replaceState({}, '', url);
  for (const ev of getEvents()) {
    if (!ev.tripId) continue;
    if (ev.id === getActiveEventId() && isSharedMode()) {
      disableSharing();
      continue;
    }
    try {
      const data = await fsFetchTripOnce(ev.tripId);
      writeEventSnapshot(ev.id, data);
    } catch (err) {
      // Firestore unreachable — keep whatever local snapshot already exists
    }
    updateEventMeta(ev.id, { tripId: null });
  }
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
