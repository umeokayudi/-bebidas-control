/** Three money books. Never add POS till into JBM vendas/faturas. */

export function splitCostBooks({ posMonthTotal = 0, jbmMonthBill = 0, staffMonthPay = 0 } = {}) {
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
  }
}

export function booksAreSeparate(books) {
  return books?.pos?.kind === 'till' && books?.jbm?.kind === 'bill' && books?.staff?.kind === 'wages'
}
