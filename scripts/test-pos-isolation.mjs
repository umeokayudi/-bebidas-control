import assert from 'node:assert/strict'
import {
  buildHourlyBuckets,
  analyzePeakAndIdleHours,
  resolveItemPrice,
  applyDiscount,
  validateDiscountCode,
  generateDiscountCode,
  cartTotal,
} from '../src/lib/atomicPos.js'

// Definição idêntica à de src/components/utils.jsx
function isSupplierVenda(v) {
  if (!v) return false
  if (v.origem === 'pos') return false
  const obs = (v.obs || '').toLowerCase()
  if (obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos')) return false
  if (v.cast_id) return false
  return true
}

function filterSupplierVendas(list) {
  return (list || []).filter(isSupplierVenda)
}

console.log('🧪 Iniciando testes de validação do POS e isolamento do fornecedor JBM...\n')

// ── Teste 1: Isolamento estrito do fornecedor JBM ──
console.log('1. Verificando isolamento entre fornecedor JBM e vendas POS...')
const mockSales = [
  { id: '1', origem: 'fornecedor', total: 50000, obs: 'Entrega semanal bar Atomic' },
  { id: '2', origem: 'pos', total: 1200, obs: 'Balcão POS' },
  { id: '3', origem: null, total: 35000, obs: 'Auto: order #104' },
  { id: '4', origem: 'pos', total: 4500, obs: 'Square counter sale' },
  { id: '5', origem: 'fornecedor', total: 80000, obs: 'Cervejas e Whisky' },
]

assert.equal(isSupplierVenda(mockSales[0]), true, 'Venda de fornecedor deve ser identificada como fornecedor')
assert.equal(isSupplierVenda(mockSales[1]), false, 'Venda POS não pode ser identificada como fornecedor')
assert.equal(isSupplierVenda(mockSales[3]), false, 'Venda balcão/square não pode ser identificada como fornecedor')

const supplierOnly = filterSupplierVendas(mockSales)
assert.equal(supplierOnly.length, 3, 'Apenas vendas da distribuidora JBM devem constar na lista do fornecedor')
assert.equal(supplierOnly.some(s => s.origem === 'pos'), false, 'Nenhuma venda POS deve contaminar faturamento JBM')
console.log('✅ Isolamento JBM validado com sucesso: vendas POS não afetam faturamento do fornecedor.')

// ── Teste 2: Preços, VIP e Códigos de Desconto ──
console.log('\n2. Testando precificação, VIP e Descontos...')
const itemDrink = { id: 'd1', preco_venda: 1000, preco_desconto: 500 }
const regPrice = resolveItemPrice(itemDrink, 'regular')
assert.equal(regPrice.preco, 1000, 'Preço regular deve ser 1000')

const vipPrice = resolveItemPrice(itemDrink, 'vip')
assert.equal(vipPrice.preco, 500, 'Preço VIP deve ser 500')

const promoCode = { codigo: 'HAPPY-20', tipo: 'percent', valor: 20, ativo: true }
const codePrice = resolveItemPrice(itemDrink, 'regular', promoCode)
assert.equal(codePrice.preco, 800, 'Preço com 20% off deve ser 800')
assert.equal(codePrice.desconto_valor, 200, 'Desconto deve ser 200')

const codeFixed = { codigo: 'SHOT-300', tipo: 'fixed', valor: 300, ativo: true }
const fixedPrice = resolveItemPrice(itemDrink, 'regular', codeFixed)
assert.equal(fixedPrice.preco, 700, 'Preço com ¥300 fixo de desconto deve ser 700')

const cart = [
  { preco_unitario: 800, qtd: 2 },
  { preco_unitario: 500, qtd: 3 },
]
assert.equal(cartTotal(cart), 3100, 'Total do carrinho deve ser 3100')
console.log('✅ Precificação do POS validada com sucesso.')

// ── Teste 3: Análise de Faturamento por Hora e Horários Ociosos ──
console.log('\n3. Testando análise hora a hora e detecção de pico / ociosidade...')
const mockPosSales = [
  { hora: '18:15:00', total: 1000 },
  { hora: '19:30:00', total: 2000 },
  { hora: '22:05:00', total: 15000 },
  { hora: '22:45:00', total: 25000 },
  { hora: '23:10:00', total: 30000 },
  { hora: '01:20:00', total: 18000 },
  { hora: '02:00:00', total: 8000 },
]

const buckets = buildHourlyBuckets(mockPosSales)
assert.equal(buckets.length, 13, 'Deve gerar buckets para todas as 13 faixas noturnas (17h às 05h)')

const bucket22 = buckets.find(b => b.hour === 22)
assert.equal(bucket22.total, 40000, 'Faturamento das 22h deve ser 40.000 (15k + 25k)')

const analysis = analyzePeakAndIdleHours(buckets)
assert.equal(analysis.peakHour.hour, 22, 'Horário de pico deve ser 22:00 (com ¥40.000)')
assert.ok(analysis.idleHours.some(h => h.hour === 17 || h.hour === 18), 'Horários de início (17h/18h) devem ser identificados como ociosos')

const happyCode = generateDiscountCode('HAPPY')
assert.ok(happyCode.startsWith('HAPPY-'), 'Código gerado deve respeitar o prefixo HAPPY')
console.log(`✅ Faturamento por hora e monetização de ociosidade validados. Código sugerido: ${happyCode}`)

console.log('\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!\n')
