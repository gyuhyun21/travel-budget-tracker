function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
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
