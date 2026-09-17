/**
 * Módulo 3 — Staff, custos e salários do bar.
 *
 * Custo de mão de obra do bar (POS). Não se confunde com o custo
 * operacional da JBM Drinks, que continua vindo de `compras`.
 */

export const TIPOS_PAGAMENTO = ['mensal', 'diaria', 'hora']

export const CARGOS = ['Bartender', 'Garçom', 'Caixa', 'Segurança', 'Limpeza', 'Gerente', 'DJ']

function num(value) {
  const n = +value
  return Number.isFinite(n) ? n : 0
}

/** Horas de um turno, tratando turno que atravessa a meia-noite. */
export function shiftHours(turno) {
  const inicio = num(turno?.hora_inicio)
  const fim = num(turno?.hora_fim)
  const bruto = fim - inicio
  return bruto > 0 ? bruto : bruto + 24
}

export function turnoHorasNoMes(turnos, staffId, mes) {
  return (turnos || [])
    .filter(t => t.staff_id === staffId)
    .filter(t => (t.status || 'escalado') !== 'falta')
    .filter(t => !mes || String(t.data || '').startsWith(mes))
    .reduce((a, t) => a + shiftHours(t), 0)
}

export function turnoDiasNoMes(turnos, staffId, mes) {
  return (turnos || [])
    .filter(t => t.staff_id === staffId)
    .filter(t => (t.status || 'escalado') !== 'falta')
    .filter(t => !mes || String(t.data || '').startsWith(mes))
    .length
}

/**
 * Custo fixo de um funcionário no mês.
 * - mensal: salário cheio, independente dos turnos.
 * - diaria: salário × dias escalados.
 * - hora: salário × horas escaladas.
 */
export function staffFixedCost(member, { horas = 0, dias = 0 } = {}) {
  const base = num(member?.salario_base)
  switch (member?.tipo_pagamento) {
    case 'diaria': return Math.round(base * dias)
    case 'hora': return Math.round(base * horas)
    default: return Math.round(base)
  }
}

/**
 * Folha do mês por funcionário: custo fixo + comissão sobre as vendas
 * atribuídas a ele no POS.
 */
export function monthlyPayroll(staff, turnos, vendas, options = {}) {
  const { mes = null } = options
  const vendasPorStaff = new Map()

  ;(vendas || []).forEach(v => {
    if (!v?.staff_id) return
    if (mes && !String(v.data || v.criado_em || '').startsWith(mes)) return
    const row = vendasPorStaff.get(v.staff_id) || { total: 0, count: 0 }
    row.total += Math.max(0, num(v.total))
    row.count += 1
    vendasPorStaff.set(v.staff_id, row)
  })

  return (staff || []).map(m => {
    const horas = turnoHorasNoMes(turnos, m.id, mes)
    const dias = turnoDiasNoMes(turnos, m.id, mes)
    const fixo = staffFixedCost(m, { horas, dias })
    const vendaRow = vendasPorStaff.get(m.id) || { total: 0, count: 0 }
    const comissao = Math.round((vendaRow.total * num(m.comissao_pct)) / 100)
    return {
      id: m.id,
      nome: m.nome,
      cargo: m.cargo || '—',
      tipo_pagamento: m.tipo_pagamento || 'mensal',
      ativo: m.ativo !== false,
      horas,
      dias,
      custoFixo: fixo,
      vendasAtribuidas: vendaRow.total,
      vendasCount: vendaRow.count,
      comissao,
      custoTotal: fixo + comissao,
      custoHora: horas > 0 ? Math.round((fixo + comissao) / horas) : null,
    }
  }).sort((a, b) => b.custoTotal - a.custoTotal)
}

export function payrollSummary(rows, faturamento = 0) {
  const list = rows || []
  const custoTotal = list.reduce((a, r) => a + r.custoTotal, 0)
  const fat = Math.max(0, num(faturamento))
  return {
    funcionarios: list.filter(r => r.ativo).length,
    horas: list.reduce((a, r) => a + r.horas, 0),
    custoFixo: list.reduce((a, r) => a + r.custoFixo, 0),
    comissoes: list.reduce((a, r) => a + r.comissao, 0),
    custoTotal,
    faturamento: fat,
    custoPct: fat > 0 ? Math.round((custoTotal / fat) * 100) : 0,
    resultado: fat - custoTotal,
  }
}

/**
 * Cobertura da escala por hora de operação: quantas pessoas estão
 * escaladas em cada hora e onde falta gente no horário de pico.
 */
export function shiftCoverage(turnos, hours) {
  const horas = hours || []
  const cobertura = new Map(horas.map(h => [h, 0]))

  ;(turnos || [])
    .filter(t => (t.status || 'escalado') !== 'falta')
    .forEach(t => {
      const inicio = num(t.hora_inicio)
      const total = shiftHours(t)
      for (let i = 0; i < total; i++) {
        const h = (inicio + i) % 24
        if (cobertura.has(h)) cobertura.set(h, cobertura.get(h) + 1)
      }
    })

  return horas.map(h => ({ hora: h, staff: cobertura.get(h) || 0 }))
}

/**
 * Cruza pico de faturamento com escala: hora que fatura muito e tem
 * pouca gente é gargalo; hora ociosa com muita gente é custo jogado fora.
 */
export function coverageAlerts(coverage, buckets, options = {}) {
  const { minStaffPico = 2 } = options
  const byHour = new Map((buckets || []).map(b => [b.hora, b]))
  const ativos = (buckets || []).filter(b => b.faturamento > 0)
  const media = ativos.length > 0
    ? ativos.reduce((a, b) => a + b.faturamento, 0) / ativos.length
    : 0

  const alerts = []
  ;(coverage || []).forEach(c => {
    const bucket = byHour.get(c.hora)
    const faturamento = bucket?.faturamento || 0
    if (faturamento > media && media > 0 && c.staff < minStaffPico) {
      alerts.push({ hora: c.hora, tipo: 'falta_staff', staff: c.staff, faturamento })
    }
    if (faturamento < media * 0.3 && c.staff > minStaffPico) {
      alerts.push({ hora: c.hora, tipo: 'staff_ocioso', staff: c.staff, faturamento })
    }
  })
  return alerts
}
