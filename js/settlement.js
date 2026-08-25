// Splits every expense with a known spender equally by "unit" (a
// participant's family/group headcount), then works out the minimum set of
// transfers that settles everyone up.
//
// participants: [{ name, count }]
// expenses: same shape as storage.js expenses (uses krwAmount + spender)
function calculateSettlement(expenses, participants) {
  const totalUnits = participants.reduce((sum, p) => sum + (p.count || 1), 0);
  const paidByName = {};
  for (const p of participants) paidByName[p.name] = 0;

  let totalSpent = 0;
  for (const e of expenses) {
    if (!e.spender || !(e.spender in paidByName)) continue;
    const amount = e.krwAmount || 0;
    paidByName[e.spender] += amount;
    totalSpent += amount;
  }

  if (totalUnits === 0 || totalSpent === 0) {
    return { totalSpent, perUnit: 0, totalUnits, balances: [], transfers: [] };
  }

  const perUnit = Math.round(totalSpent / totalUnits);
  const balances = participants.map(p => ({
    name: p.name,
    count: p.count || 1,
    paid: paidByName[p.name] || 0,
    share: perUnit * (p.count || 1)
  }));

  // Rounding perUnit can leave the shares a few won short of/over
  // totalSpent; dump that remainder on whoever represents the most people,
  // since their share absorbs a 1-won difference least noticeably.
  const shareSum = balances.reduce((sum, b) => sum + b.share, 0);
  const remainder = totalSpent - shareSum;
  if (remainder !== 0 && balances.length) {
    let largest = 0;
    for (let i = 1; i < balances.length; i++) {
      if (balances[i].count > balances[largest].count) largest = i;
    }
    balances[largest].share += remainder;
  }

  balances.forEach(b => { b.balance = b.paid - b.share; });

  return { totalSpent, perUnit, totalUnits, balances, transfers: minimizeTransfers(balances) };
}

// Greedy debt simplification: repeatedly match the biggest creditor with the
// biggest debtor. Minimizes the number of transfers in the common case.
function minimizeTransfers(balances) {
  const creditors = balances
    .filter(b => b.balance > 0)
    .map(b => ({ name: b.name, amount: b.balance }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter(b => b.balance < 0)
    .map(b => ({ name: b.name, amount: -b.balance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0) transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount });
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }
  return transfers;
}
