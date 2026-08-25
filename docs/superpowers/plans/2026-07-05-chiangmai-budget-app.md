# 치앙마이 여행 예산/지출 관리 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 치앙마이 여행 중 예산 대비 실제 지출을 혼자 기록/조회할 수 있는, 설치 가능한(PWA) 바닐라 JS 웹앱을 만든다.

**Architecture:** 빌드 도구 없는 단일 페이지 앱. `index.html` 하나에 4개의 화면(대시보드/지출추가/지출목록/설정)을 `<section>`으로 두고 JS로 보이기/숨기기를 전환한다. 데이터는 `localStorage`에 저장하고, 서버/로그인은 없다. `manifest.json` + `sw.js`로 홈 화면 설치와 오프라인 사용을 지원한다.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript (ES6+), Web Storage API (`localStorage`), Service Worker API. 빌드 도구나 프레임워크 없음.

## Global Constraints

- 서버, 데이터베이스, 로그인/계정 기능 없음 (본인 1인, 단일 기기 사용 전제)
- 자동화 테스트 프레임워크 사용하지 않음 — 각 작업은 브라우저/devtools 콘솔에서 직접 실행하는 수동 검증으로 대체한다 (스펙에 명시된 결정)
- 데이터는 `localStorage` 키 `cmb_settings`(객체), `cmb_expenses`(배열)에 저장한다
- 환율(THB→KRW, USD→KRW)은 설정 화면에서 사용자가 직접 입력하는 고정값이며, 외부 API 호출은 하지 않는다
- UI 문구는 전부 한국어로 작성한다
- 앱은 PWA로 홈 화면에 설치 가능해야 하고 오프라인에서도 열려야 한다
- 실행/검증은 `python3 -m http.server`로 로컬 정적 서버를 띄워서 진행한다 (Service Worker는 `file://`에서 등록되지 않음)

---

### Task 1: 프로젝트 뼈대 (index.html + style.css + 화면 전환 로직)

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`

**Interfaces:**
- Produces: `showScreen(name: string): void` — 이후 모든 작업에서 화면 전환에 사용. `name`은 `'dashboard' | 'add-expense' | 'expense-list' | 'settings'` 중 하나이며, 대응하는 `#screen-{name}` 엘리먼트와 `.nav-btn[data-screen="{name}"]` 버튼에 `active` 클래스를 토글한다.

- [ ] **Step 1: `index.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>치앙마이 여행 가계부</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
  <nav class="nav-bar">
    <button data-screen="dashboard" class="nav-btn active">대시보드</button>
    <button data-screen="add-expense" class="nav-btn">지출추가</button>
    <button data-screen="expense-list" class="nav-btn">지출목록</button>
    <button data-screen="settings" class="nav-btn">설정</button>
  </nav>

  <main>
    <section id="screen-dashboard" class="screen active">
      <h2>대시보드</h2>
    </section>
    <section id="screen-add-expense" class="screen">
      <h2>지출 추가</h2>
    </section>
    <section id="screen-expense-list" class="screen">
      <h2>지출 목록</h2>
    </section>
    <section id="screen-settings" class="screen">
      <h2>설정</h2>
    </section>
  </main>

  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `css/style.css` 작성**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  background: #f7f7f5;
  color: #222;
}
.nav-bar {
  display: flex;
  position: sticky;
  top: 0;
  background: #ffffff;
  border-bottom: 1px solid #ddd;
  z-index: 10;
}
.nav-btn {
  flex: 1;
  padding: 14px 4px;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  color: #666;
}
.nav-btn.active {
  color: #2d6a4f;
  font-weight: bold;
  border-bottom: 2px solid #2d6a4f;
}
main {
  padding: 16px;
  max-width: 480px;
  margin: 0 auto;
}
.screen { display: none; }
.screen.active { display: block; }
form label {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
}
form input, form select {
  display: block;
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  font-size: 16px;
}
button[type="submit"], .nav-btn, #btn-export, #btn-delete-expense {
  border-radius: 6px;
}
button[type="submit"] {
  background: #2d6a4f;
  color: white;
  border: none;
  padding: 10px 16px;
  font-size: 15px;
  cursor: pointer;
}
.progress-bar {
  background: #eee;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}
.progress-fill {
  background: #2d6a4f;
  height: 100%;
}
ul { list-style: none; padding: 0; }
li { padding: 8px 0; border-bottom: 1px solid #eee; }
.expense-item {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  font-size: 14px;
  padding: 8px 0;
  cursor: pointer;
}
```

- [ ] **Step 3: `js/app.js` 작성 (화면 전환 로직만)**

```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

showScreen('dashboard');
```

- [ ] **Step 4: 수동 검증**

Run:
```bash
cd "/Users/gyuhyunpark/Library/Mobile Documents/com~apple~CloudDocs/PRIVATE/조화로운/치앙마이여행" && python3 -m http.server 8080
```
브라우저에서 `http://localhost:8080/index.html` 접속.

Expected:
- "대시보드" 탭이 처음에 활성화(초록색 밑줄) 상태로 보인다
- "지출목록" 탭 클릭 시 "지출 목록" 제목이 보이고 다른 화면은 사라진다
- 4개 탭을 각각 클릭하며 정상적으로 전환되는지 확인한다

- [ ] **Step 5: 커밋**

```bash
git add index.html css/style.css js/app.js
git commit -m "feat: add app shell with screen navigation"
```

---

### Task 2: 데이터 저장 레이어 (js/storage.js)

**Files:**
- Create: `js/storage.js`
- Modify: `index.html` (script 태그 추가)

**Interfaces:**
- Consumes: 없음 (최하위 레이어)
- Produces:
  - `getSettings(): object | null`
  - `saveSettings(settings: object): void`
  - `getExpenses(): Array<object>`
  - `saveExpenses(expenses: Array<object>): void`
  - `generateId(): string`
  - `addExpense(expense: object): object` — id가 부여된 최종 expense 객체 반환
  - `updateExpense(id: string, updatedFields: object): object | null`
  - `deleteExpense(id: string): void`
  - `getExpenseById(id: string): object | null`

- [ ] **Step 1: `js/storage.js` 작성**

```javascript
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
```

- [ ] **Step 2: `index.html`의 `<script src="js/app.js">` 위에 storage.js 추가**

`index.html`에서 다음 줄을:
```html
  <script src="js/app.js"></script>
```
다음으로 교체:
```html
  <script src="js/storage.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 3: 수동 검증 (브라우저 콘솔)**

`http://localhost:8080/index.html` 새로고침 후 devtools 콘솔에서 순서대로 실행:

```javascript
localStorage.clear();
console.log(getSettings()); // 기대값: null
saveSettings({ totalBudget: 1000000, thbRate: 40, usdRate: 1350, tripStartDate: '2026-07-10', tripEndDate: '2026-07-15' });
console.log(getSettings()); // 기대값: 위에서 저장한 객체 그대로
addExpense({ date: '2026-07-10', amount: 500, currency: 'THB', krwAmount: 20000, memo: '점심' });
console.log(getExpenses().length); // 기대값: 1
const id = getExpenses()[0].id;
console.log(typeof id); // 기대값: "string"
updateExpense(id, { memo: '저녁으로 수정' });
console.log(getExpenses()[0].memo); // 기대값: "저녁으로 수정"
deleteExpense(id);
console.log(getExpenses()); // 기대값: []
```

모든 `console.log` 출력이 위 기대값과 일치하면 통과.

- [ ] **Step 4: 커밋**

```bash
git add js/storage.js index.html
git commit -m "feat: add localStorage data layer"
```

---

### Task 3: 환율 변환 로직 (js/currency.js)

**Files:**
- Create: `js/currency.js`
- Modify: `index.html` (script 태그 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `toKRW(amount: number, currency: 'THB' | 'USD' | 'KRW', settings: object | null): number | null` — 환율 미설정 시 `null` 반환 (지출 추가 화면에서 이 `null`을 감지해 안내 메시지를 띄우는 데 사용됨, Task 6 참고)

- [ ] **Step 1: `js/currency.js` 작성**

```javascript
function toKRW(amount, currency, settings) {
  if (currency === 'KRW') return amount;
  if (currency === 'THB') {
    if (!settings || !settings.thbRate) return null;
    return amount * settings.thbRate;
  }
  if (currency === 'USD') {
    if (!settings || !settings.usdRate) return null;
    return amount * settings.usdRate;
  }
  return null;
}
```

- [ ] **Step 2: `index.html`에서 storage.js 다음 줄에 currency.js 추가**

`index.html`에서 다음 줄을:
```html
  <script src="js/storage.js"></script>
  <script src="js/app.js"></script>
```
다음으로 교체:
```html
  <script src="js/storage.js"></script>
  <script src="js/currency.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 3: 수동 검증 (브라우저 콘솔)**

페이지 새로고침 후 콘솔에서:

```javascript
console.log(toKRW(100, 'KRW', {})); // 기대값: 100
console.log(toKRW(100, 'THB', { thbRate: 40 })); // 기대값: 4000
console.log(toKRW(100, 'USD', { usdRate: 1350 })); // 기대값: 135000
console.log(toKRW(100, 'THB', {})); // 기대값: null
console.log(toKRW(100, 'USD', null)); // 기대값: null
```

- [ ] **Step 4: 커밋**

```bash
git add js/currency.js index.html
git commit -m "feat: add currency conversion helper"
```

---

### Task 4: 여행 진행률 로직 (js/trip.js)

**Files:**
- Create: `js/trip.js`
- Modify: `index.html` (script 태그 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `tripStatusLabel(settings: object | null, today?: Date): string` — Task 5(대시보드)에서 사용

- [ ] **Step 1: `js/trip.js` 작성**

```javascript
function tripStatusLabel(settings, today = new Date()) {
  if (!settings || !settings.tripStartDate || !settings.tripEndDate) {
    return '여행 일정 미설정';
  }
  const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const start = toDateOnly(new Date(settings.tripStartDate));
  const end = toDateOnly(new Date(settings.tripEndDate));
  const now = toDateOnly(today);
  const MS_PER_DAY = 86400000;

  if (now < start) {
    const days = Math.round((start - now) / MS_PER_DAY);
    return `여행 D-${days}`;
  }
  if (now > end) {
    return '여행 종료';
  }
  const dayNum = Math.round((now - start) / MS_PER_DAY) + 1;
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1;
  return `여행 ${dayNum}일차 / 총 ${totalDays}일`;
}
```

- [ ] **Step 2: `index.html`에서 currency.js 다음 줄에 trip.js 추가**

`index.html`에서 다음 줄을:
```html
  <script src="js/currency.js"></script>
  <script src="js/app.js"></script>
```
다음으로 교체:
```html
  <script src="js/currency.js"></script>
  <script src="js/trip.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 3: 수동 검증 (브라우저 콘솔)**

```javascript
console.log(tripStatusLabel({ tripStartDate: '2026-07-10', tripEndDate: '2026-07-15' }, new Date('2026-07-08')));
// 기대값: "여행 D-2"
console.log(tripStatusLabel({ tripStartDate: '2026-07-10', tripEndDate: '2026-07-15' }, new Date('2026-07-12')));
// 기대값: "여행 3일차 / 총 6일"
console.log(tripStatusLabel({ tripStartDate: '2026-07-10', tripEndDate: '2026-07-15' }, new Date('2026-07-20')));
// 기대값: "여행 종료"
console.log(tripStatusLabel(null));
// 기대값: "여행 일정 미설정"
```

- [ ] **Step 4: 커밋**

```bash
git add js/trip.js index.html
git commit -m "feat: add trip progress label helper"
```

---

### Task 5: 설정 화면 (예산/환율/여행일자 입력 + 최초 실행 유도)

**Files:**
- Create: `js/render.js`
- Modify: `js/app.js` (전체 교체)

**Interfaces:**
- Consumes: `getSettings`, `saveSettings` (Task 2), `showScreen` (Task 1)
- Produces:
  - `renderSettingsScreen(): void`
  - `bindSettingsForm(): void` (한 번만 호출, 이벤트 위임 사용)

- [ ] **Step 1: `js/render.js` 작성 (설정 화면 렌더 함수)**

```javascript
function renderSettingsScreen() {
  const settings = getSettings() || {};
  const isFirstRun = Object.keys(settings).length === 0;
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <h2>설정</h2>
    <form id="settings-form">
      <label>총 예산 (원)
        <input type="number" id="input-total-budget" value="${settings.totalBudget ?? ''}" required>
      </label>
      <label>1바트(THB) = ? 원
        <input type="number" id="input-thb-rate" value="${settings.thbRate ?? ''}" required>
      </label>
      <label>1달러(USD) = ? 원
        <input type="number" id="input-usd-rate" value="${settings.usdRate ?? ''}" required>
      </label>
      <label>여행 시작일
        <input type="date" id="input-trip-start" value="${settings.tripStartDate ?? ''}" required>
      </label>
      <label>여행 종료일
        <input type="date" id="input-trip-end" value="${settings.tripEndDate ?? ''}" required>
      </label>
      <button type="submit">저장</button>
    </form>
    <hr>
    <h3>데이터 백업</h3>
    <button id="btn-export" type="button">JSON으로 내보내기</button>
    <label>JSON 불러오기
      <input type="file" id="input-import" accept="application/json">
    </label>
    <p id="settings-message">${isFirstRun ? '최초 실행: 예산과 환율을 설정해주세요.' : ''}</p>
  `;
}
```

- [ ] **Step 2: `js/app.js` 전체를 아래 내용으로 교체**

```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
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

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

bindSettingsForm();

if (!getSettings()) {
  showScreen('settings');
} else {
  showScreen('dashboard');
}
```

- [ ] **Step 3: `index.html`에서 trip.js 다음 줄에 render.js 추가**

`index.html`에서 다음 줄을:
```html
  <script src="js/trip.js"></script>
  <script src="js/app.js"></script>
```
다음으로 교체:
```html
  <script src="js/trip.js"></script>
  <script src="js/render.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 4: 수동 검증**

콘솔에서 `localStorage.clear();` 실행 후 페이지 새로고침.

Expected:
- 설정 화면으로 자동 이동하고 "최초 실행: 예산과 환율을 설정해주세요." 메시지가 보인다
- 총예산 1000000, THB환율 40, USD환율 1350, 여행시작일/종료일 입력 후 "저장" 클릭
- "저장되었습니다." 메시지로 바뀐다
- 콘솔에서 `getSettings()` 실행 시 입력한 값이 정확히 반환된다
- 페이지 새로고침 후 설정 화면에 입력했던 값들이 그대로 채워져 보인다 (자동으로 대시보드로 이동)

- [ ] **Step 5: 커밋**

```bash
git add js/render.js js/app.js index.html
git commit -m "feat: add settings screen with first-run redirect"
```

---

### Task 6: 대시보드 화면

**Files:**
- Modify: `js/render.js` (함수 추가)
- Modify: `js/app.js` (showScreen에 분기 추가)

**Interfaces:**
- Consumes: `getSettings`, `getExpenses` (Task 2), `tripStatusLabel` (Task 4)
- Produces: `renderDashboardScreen(): void`

- [ ] **Step 1: `js/render.js` 끝에 대시보드 렌더 함수 추가**

```javascript
function renderDashboardScreen() {
  const settings = getSettings();
  const container = document.getElementById('screen-dashboard');
  if (!settings) {
    container.innerHTML = `<h2>대시보드</h2><p>먼저 설정 화면에서 예산과 환율을 입력해주세요.</p>`;
    return;
  }
  const expenses = getExpenses();
  const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
  const remaining = settings.totalBudget - totalSpent;
  const percent = settings.totalBudget > 0
    ? Math.min(100, Math.round((totalSpent / settings.totalBudget) * 100))
    : 0;
  const tripLabel = tripStatusLabel(settings);
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  container.innerHTML = `
    <h2>대시보드</h2>
    <p class="trip-status">${tripLabel}</p>
    <p>총 예산: ${settings.totalBudget.toLocaleString()}원</p>
    <p>총 지출: ${totalSpent.toLocaleString()}원</p>
    <p>남은 예산: ${remaining.toLocaleString()}원</p>
    <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
    <p>${percent}% 사용</p>
    <h3>최근 지출</h3>
    <ul id="recent-expense-list">
      ${recent.length
        ? recent.map(e => `<li>${e.date} · ${e.amount.toLocaleString()} ${e.currency} (${Math.round(e.krwAmount).toLocaleString()}원) - ${e.memo || ''}</li>`).join('')
        : '<li>지출 내역이 없습니다.</li>'}
    </ul>
  `;
}
```

- [ ] **Step 2: `js/app.js`의 `showScreen` 함수를 아래로 교체**

`js/app.js`에서 다음 부분을:
```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
}
```
다음으로 교체:
```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
}
```

- [ ] **Step 3: 수동 검증 (브라우저 콘솔 + UI)**

설정이 이미 저장된 상태에서 콘솔 실행:

```javascript
addExpense({ date: '2026-07-10', amount: 1000, currency: 'THB', krwAmount: toKRW(1000, 'THB', getSettings()), memo: '테스트 식사' });
showScreen('dashboard');
```

Expected:
- 대시보드에 "총 지출: 40,000원" (THB환율 40 기준), "남은 예산" 이 총예산에서 40,000원 뺀 값으로 표시
- 진행률 바가 해당 퍼센트만큼 채워져 있다
- "최근 지출" 목록에 "2026-07-10 · 1,000 THB (40,000원) - 테스트 식사" 항목이 보인다
- 여행 시작일 이전 날짜라면 "여행 D-N", 기간 중이면 "N일차 / 총 M일"이 상단에 보인다

- [ ] **Step 4: 커밋**

```bash
git add js/render.js js/app.js
git commit -m "feat: add dashboard screen with budget summary"
```

---

### Task 7: 지출 추가/수정 화면

**Files:**
- Modify: `js/render.js` (함수 추가)
- Modify: `js/app.js` (전체 교체)

**Interfaces:**
- Consumes: `getSettings`, `getExpenseById`, `addExpense`, `updateExpense`, `deleteExpense` (Task 2), `toKRW` (Task 3), `renderDashboardScreen` (Task 6)
- Produces: `renderExpenseFormScreen(editId?: string): void`

- [ ] **Step 1: `js/render.js` 끝에 지출 입력 폼 렌더 함수 추가**

```javascript
function renderExpenseFormScreen(editId = null) {
  const container = document.getElementById('screen-add-expense');
  const existing = editId ? getExpenseById(editId) : null;
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = `
    <h2>${existing ? '지출 수정' : '지출 추가'}</h2>
    <form id="expense-form">
      <input type="hidden" id="input-expense-id" value="${existing ? existing.id : ''}">
      <label>날짜
        <input type="date" id="input-expense-date" value="${existing ? existing.date : today}" required>
      </label>
      <label>통화
        <select id="input-expense-currency">
          <option value="THB" ${existing?.currency === 'THB' ? 'selected' : ''}>THB (바트)</option>
          <option value="USD" ${existing?.currency === 'USD' ? 'selected' : ''}>USD (달러)</option>
          <option value="KRW" ${existing?.currency === 'KRW' ? 'selected' : ''}>KRW (원)</option>
        </select>
      </label>
      <label>금액
        <input type="number" id="input-expense-amount" value="${existing ? existing.amount : ''}" required>
      </label>
      <label>메모
        <input type="text" id="input-expense-memo" value="${existing ? (existing.memo || '') : ''}">
      </label>
      <button type="submit">저장</button>
      ${existing ? '<button type="button" id="btn-delete-expense">삭제</button>' : ''}
    </form>
    <p id="expense-form-message"></p>
  `;
}
```

- [ ] **Step 2: `js/app.js` 전체를 아래 내용으로 교체**

```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
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

bindSettingsForm();
bindExpenseForm();

if (!getSettings()) {
  showScreen('settings');
} else {
  showScreen('dashboard');
}
```

- [ ] **Step 3: 수동 검증**

브라우저에서:
1. "지출추가" 탭 클릭 → 오늘 날짜가 기본으로 채워진 빈 폼이 보인다
2. 통화 "THB", 금액 500, 메모 "저녁" 입력 후 저장 → 대시보드로 이동하고 총 지출/남은예산이 갱신된다
3. 콘솔에서 `getExpenses()` 실행 → 방금 입력한 항목이 `krwAmount = 500 * thbRate`로 정확히 계산되어 있는지 확인
4. 콘솔에서 `renderExpenseFormScreen(getExpenses()[0].id); showScreen('add-expense');` 실행 → 폼에 기존 값이 채워져 있고 "삭제" 버튼이 보인다
5. 메모를 "저녁(수정)"으로 바꾸고 저장 → 대시보드 최근 지출 목록에 수정된 메모가 반영된다
6. 다시 수정 화면 진입 후 "삭제" 클릭 → 대시보드로 이동하고 해당 항목이 목록에서 사라진다
7. 설정 화면에서 THB 환율을 지우고(빈 값) 지출추가에서 THB로 저장 시도 → "환율이 설정되지 않았습니다..." 메시지가 뜨고 저장되지 않는다 (환율 재설정 후 원복해둘 것)

- [ ] **Step 4: 커밋**

```bash
git add js/render.js js/app.js
git commit -m "feat: add expense add/edit/delete form"
```

---

### Task 8: 지출 목록 화면

**Files:**
- Modify: `js/render.js` (함수 추가)
- Modify: `js/app.js` (showScreen 분기 + 바인딩 추가)

**Interfaces:**
- Consumes: `getExpenses` (Task 2), `renderExpenseFormScreen`, `showScreen` (Task 7)
- Produces: `renderExpenseListScreen(): void`

- [ ] **Step 1: `js/render.js` 끝에 지출 목록 렌더 함수 추가**

```javascript
function renderExpenseListScreen() {
  const expenses = [...getExpenses()].sort((a, b) => b.date.localeCompare(a.date));
  const container = document.getElementById('screen-expense-list');
  container.innerHTML = `
    <h2>지출 목록</h2>
    <ul id="expense-list">
      ${expenses.length
        ? expenses.map(e => `
          <li>
            <button class="expense-item" type="button" data-id="${e.id}">
              ${e.date} · ${e.amount.toLocaleString()} ${e.currency} (${Math.round(e.krwAmount).toLocaleString()}원) - ${e.memo || ''}
            </button>
          </li>
        `).join('')
        : '<li>지출 내역이 없습니다.</li>'}
    </ul>
  `;
}
```

- [ ] **Step 2: `js/app.js`의 `showScreen` 함수에 분기 추가**

`js/app.js`에서 다음 줄을:
```javascript
  if (name === 'add-expense') renderExpenseFormScreen();
}
```
다음으로 교체:
```javascript
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
}
```

- [ ] **Step 3: `js/app.js`에 목록 클릭 바인딩 함수 추가 및 호출**

`js/app.js`에서 다음 줄을:
```javascript
bindSettingsForm();
bindExpenseForm();
```
다음으로 교체:
```javascript
function bindExpenseList() {
  document.getElementById('screen-expense-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.expense-item');
    if (!btn) return;
    renderExpenseFormScreen(btn.dataset.id);
    showScreen('add-expense');
  });
}

bindSettingsForm();
bindExpenseForm();
bindExpenseList();
```

- [ ] **Step 4: 수동 검증**

브라우저에서 지출을 2~3건 추가한 뒤:
1. "지출목록" 탭 클릭 → 날짜 최신순으로 모든 지출이 목록에 보인다
2. 특정 항목 클릭 → "지출 수정" 화면으로 이동하며 해당 항목 값이 채워져 있다
3. 지출 내역이 하나도 없는 상태(전부 삭제)에서 "지출목록" 탭 클릭 → "지출 내역이 없습니다." 문구가 보인다

- [ ] **Step 5: 커밋**

```bash
git add js/render.js js/app.js
git commit -m "feat: add expense list screen with edit navigation"
```

---

### Task 9: JSON 백업 내보내기/불러오기

**Files:**
- Modify: `js/app.js` (바인딩 함수 추가 및 호출)

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `getExpenses`, `saveExpenses` (Task 2), `renderSettingsScreen` (Task 5), `renderDashboardScreen` (Task 6)
- Produces: 없음 (UI 이벤트 바인딩만)

- [ ] **Step 1: `js/app.js`에 백업 바인딩 함수 추가 및 호출**

`js/app.js`에서 다음 줄을:
```javascript
bindSettingsForm();
bindExpenseForm();
bindExpenseList();
```
다음으로 교체:
```javascript
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
```

- [ ] **Step 2: 수동 검증**

1. 설정 화면에서 "JSON으로 내보내기" 클릭 → `chiangmai-budget-backup-YYYY-MM-DD.json` 파일이 다운로드된다. 파일을 열어 `settings`와 `expenses` 필드가 현재 데이터와 일치하는지 확인
2. 콘솔에서 `localStorage.clear();` 실행 후 새로고침 → 설정 화면(최초 실행 문구)으로 이동
3. 설정 화면에서 "JSON 불러오기"로 방금 받은 백업 파일 선택 → 확인 대화상자에서 "확인" 클릭 → "복원되었습니다." 메시지 표시
4. 콘솔에서 `getSettings()`, `getExpenses()` 실행 → 백업 이전 데이터와 동일하게 복원되었는지 확인
5. 형식이 잘못된 JSON 파일(예: `{"foo": 1}` 내용의 텍스트 파일)을 불러오기 시도 → "올바르지 않은 백업 파일입니다." 알림이 뜨고 기존 데이터는 그대로 유지된다

- [ ] **Step 3: 커밋**

```bash
git add js/app.js
git commit -m "feat: add JSON backup export/import"
```

---

### Task 10: PWA 설치 지원 (manifest, 아이콘, 서비스워커)

**Files:**
- Create: `manifest.json`
- Create: `icons/icon.svg`
- Create: `sw.js`
- Modify: `index.html` (manifest 링크 추가)
- Modify: `js/app.js` (서비스워커 등록 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (브라우저 설치/캐싱 동작)

- [ ] **Step 1: `icons/icon.svg` 작성**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="32" fill="#2d6a4f"/>
  <text x="100" y="130" font-size="90" text-anchor="middle" fill="#ffffff" font-family="sans-serif">฿</text>
</svg>
```

- [ ] **Step 2: `manifest.json` 작성**

```json
{
  "name": "치앙마이 여행 가계부",
  "short_name": "치앙마이가계부",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f7f7f5",
  "theme_color": "#2d6a4f",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 3: `sw.js` 작성**

```javascript
const CACHE_NAME = 'cmb-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/currency.js',
  './js/trip.js',
  './js/render.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

- [ ] **Step 4: `index.html`의 `<head>`에 manifest 링크 추가**

`index.html`에서 다음 줄을:
```html
<link rel="stylesheet" href="css/style.css">
```
다음으로 교체:
```html
<link rel="stylesheet" href="css/style.css">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon.svg">
```

- [ ] **Step 5: `js/app.js` 맨 끝에 서비스워커 등록 추가**

`js/app.js` 파일 맨 마지막 줄 (`if (!getSettings()) { ... }` 블록) 다음에 추가:
```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
```

- [ ] **Step 6: 수동 검증**

서버가 실행 중인 상태에서 (`python3 -m http.server 8080`) 크롬 devtools 열고:
1. Application 탭 > Manifest → 이름/아이콘이 정상적으로 표시되고 에러가 없다
2. Application 탭 > Service Workers → 상태가 "activated and is running"으로 보인다
3. Network 탭에서 "Offline" 체크 후 페이지 새로고침 → 앱이 정상적으로 로드된다 (오프라인 캐시 확인)
4. 모바일 크롬에서 실제 접속 시 "홈 화면에 추가" 메뉴가 나타나는지 확인 (데스크톱에서는 주소창 옆 설치 아이콘으로 확인 가능)

- [ ] **Step 7: 커밋**

```bash
git add manifest.json icons/icon.svg sw.js index.html js/app.js
git commit -m "feat: add PWA manifest, service worker, and icon"
```

---

### Task 11: 전체 흐름 최종 검증 + 실행 안내 문서

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (문서 + 최종 수동 QA)

- [ ] **Step 1: `README.md` 작성**

```markdown
# 치앙마이 여행 가계부

혼자 쓰는 여행 예산/지출 관리 웹앱입니다. 서버나 로그인 없이 브라우저 `localStorage`에 데이터를 저장합니다.

## 실행 방법

\`\`\`bash
cd "이 폴더 경로"
python3 -m http.server 8080
\`\`\`

브라우저에서 `http://localhost:8080/index.html` 접속. 모바일 크롬/사파리에서는 "홈 화면에 추가"로 설치해서 앱처럼 쓸 수 있습니다.

## 데이터 백업

설정 화면에서 "JSON으로 내보내기"로 백업 파일을 받아두세요. 브라우저 캐시를 지우면 데이터가 사라질 수 있습니다.
```

- [ ] **Step 2: 전체 시나리오 수동 검증**

`localStorage.clear()` 후 새로고침부터 시작해서 아래를 순서대로 확인:

1. 최초 실행 시 설정 화면으로 자동 유도되는지
2. 예산/환율/여행일자 설정 후 대시보드에 정상 반영되는지
3. THB/USD/KRW 세 통화로 각각 지출을 추가했을 때 원화 환산이 올바른지
4. 지출 수정/삭제가 목록과 대시보드 합계에 정상 반영되는지
5. 여행 시작 전/기간 중/종료 후 각각 D-day, N일차, "여행 종료" 표시가 올바른지 (콘솔에서 `tripStatusLabel`에 다른 `today` 값을 넣어 확인)
6. JSON 내보내기 후 데이터 초기화, 불러오기로 정상 복원되는지
7. 오프라인 상태에서도 앱이 열리는지 (Task 10 Step 6 참고)

7가지 모두 통과하면 MVP 완료.

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: add setup instructions and finalize MVP"
```
