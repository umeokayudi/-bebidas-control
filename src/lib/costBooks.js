/** Four money books. Never add POS till, JBM bill, wages or rent together. */

export function splitCostBooks({
  posMonthTotal = 0,
  jbmMonthBill = 0,
  staffMonthPay = 0,
  rentMonth = 0,
} = {}) {
  return {
    pos: {
      id: 'pos',
      kind: 'till',
      amount: Math.round(+posMonthTotal || 0),
    },
    jbm: {
      id: 'jbm',
      kind: 'bill',
      amount: Math.round(+jbmMonthBill || 0),
    },
    staff: {
      id: 'staff',
      kind: 'wages',
      amount: Math.round(+staffMonthPay || 0),
    },
    rent: {
      id: 'rent',
      kind: 'overhead',
      amount: Math.round(+rentMonth || 0),
    },
  }
}

export function booksAreSeparate(books) {
  return (
    books?.pos?.kind === 'till'
    && books?.jbm?.kind === 'bill'
    && books?.staff?.kind === 'wages'
    && books?.rent?.kind === 'overhead'
  )
}

export function booksGrandTotal(books) {
  return null
}

export function rentForMonth(rows = [], monthKey) {
  const match = (rows || []).find(r => r.kind === 'rent' && r.month_key === monthKey)
  return Math.round(+match?.amount || 0)
}
