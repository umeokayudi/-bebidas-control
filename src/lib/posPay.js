/** Till payment helpers. Record method + cash tender only — no card/PayPay gateway. */

export const CASH_CHIPS = [1000, 2000, 5000, 10000]

export function isCashMethod(method) {
  return /cash|現金/i.test(String(method || 'Cash'))
}

/** Empty tendered = exact. Short cash must block Charge. */
export function cashChange(total, tendered) {
  const due = Math.round(+total || 0)
  if (tendered === '' || tendered == null) {
    return { due, tendered: due, change: 0, exact: true, short: false }
  }
  const paid = Math.round(+tendered || 0)
  return {
    due,
    tendered: paid,
    change: paid - due,
    exact: paid === due,
    short: paid < due,
  }
}

export function payRecordNote({ method = 'Cash', total = 0, tendered } = {}) {
  if (isCashMethod(method)) {
    const cash = cashChange(total, tendered)
    if (cash.exact) return `Pay: Cash exact ${cash.tendered}`
    return `Pay: Cash tendered ${cash.tendered} change ${Math.max(0, cash.change)}`
  }
  return `Pay: ${method} record-only`
}
