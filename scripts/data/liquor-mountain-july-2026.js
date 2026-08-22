/**
 * Liquor Mountain (リカーマウンテン 六本木DS) — compras julho/2026
 * Preços da nota = 税込 (zeikomi). custo_unitario no sistema = por unidade do catálogo.
 */

export const SUPPLIER_NAME = 'Liquor Mountain'
export const SUPPLIER_ID = '499916d4-75c8-4fa9-b5da-05407739f8c3'

/** Tamanho do pack para converter preço de caixa → unidade */
export const PACK_SIZE = {
  'Asahi Beer 330ml': 30,
  'Heineken 330ml': 24,
  'Guiness Beer': 24,
  'Corona Extra 355ml': 24,
  'Estrella Damm 330ml': 24,
  'Red Bull': 24,
  'Tonic Water': 24,
  'Water 500ml': 24,
  'Water 2L (case 6)': 6,
  'Jasmine Tea (caixa 6)': 6,
  'Green Tea': 6,
  'Uron Tea': 6,
  'Coca Cola 700ml': 20,
}

/** Produtos novos a criar se não existirem */
export const NEW_PRODUCTS = [
  { nome: 'Hakushu', categoria: 'Japanese Whisky', custo: 13000 },
  { nome: 'Estrella Damm 330ml', categoria: 'Beer', custo: 231 },
  { nome: 'Wilkinson Gin 1.8L', categoria: 'Gin', custo: 1880 },
  { nome: 'Suntory Cocktail Lemon', categoria: 'Others', custo: 608 },
]

/**
 * @typedef {{ produto: string, qtd: number, unitPrice: number, isCase?: boolean }} LineItem
 * @typedef {{ date: string, slip: string, total: number, items: LineItem[] }} Purchase
 */

/** @type {Purchase[]} */
export const PURCHASES = [
  {
    date: '2026-07-04',
    slip: '00069423',
    total: 82948,
    items: [
      { produto: 'Baileys', qtd: 3, unitPrice: 1850 },
      { produto: 'Malibu', qtd: 4, unitPrice: 1350 },
      { produto: 'Shochu 4L', qtd: 2, unitPrice: 2350 },
      { produto: 'Asahi Beer 330ml', qtd: 2, unitPrice: 6100, isCase: true },
      { produto: 'Nikka Black 4L', qtd: 1, unitPrice: 3780 },
      { produto: 'Jägermeister', qtd: 3, unitPrice: 1980 },
      { produto: 'Fireball', qtd: 4, unitPrice: 1880 },
      { produto: 'Wilkson Vodka 1800 Ml', qtd: 3, unitPrice: 1880 },
      { produto: 'Red Bull', qtd: 2, unitPrice: 4280, isCase: true },
      { produto: 'Jasmine Tea (caixa 6)', qtd: 2, unitPrice: 1080, isCase: true },
      { produto: 'Chandon Brut', qtd: 6, unitPrice: 2480 },
    ],
  },
  {
    date: '2026-07-09',
    slip: '00069590',
    total: 57569,
    items: [
      { produto: 'Corona Extra 355ml', qtd: 3, unitPrice: 6250, isCase: true },
      { produto: 'Baileys', qtd: 3, unitPrice: 1850 },
      { produto: 'Suntory Lime', qtd: 1, unitPrice: 718 },
      { produto: 'Tonic Water', qtd: 1, unitPrice: 2760, isCase: true },
      { produto: 'Red Bull', qtd: 3, unitPrice: 4280, isCase: true },
      { produto: 'Orange Juice', qtd: 12, unitPrice: 338 },
      { produto: 'Pineapple Juice', qtd: 12, unitPrice: 338 },
      { produto: 'Malibu', qtd: 3, unitPrice: 1350 },
    ],
  },
  {
    date: '2026-07-11',
    slip: '00069675',
    total: 99216,
    items: [
      { produto: 'Heineken 330ml', qtd: 2, unitPrice: 6180, isCase: true },
      { produto: 'Red Bull', qtd: 2, unitPrice: 5900, isCase: true },
      { produto: 'Baileys', qtd: 2, unitPrice: 1850 },
      { produto: 'Jägermeister', qtd: 2, unitPrice: 1980 },
      { produto: 'Yamazaki NV', qtd: 2, unitPrice: 13800 },
      { produto: 'Hakushu', qtd: 2, unitPrice: 13000 },
      { produto: 'Suntory Lime', qtd: 1, unitPrice: 718 },
      { produto: 'Suntory Cocktail Lemon', qtd: 1, unitPrice: 608 },
    ],
  },
  {
    date: '2026-07-18',
    slip: '00069851',
    total: 55218,
    items: [
      { produto: 'Asahi Beer 330ml', qtd: 1, unitPrice: 5900, isCase: true },
      { produto: 'Heineken 330ml', qtd: 2, unitPrice: 6000, isCase: true },
      { produto: 'Guiness Beer', qtd: 1, unitPrice: 6000, isCase: true },
      { produto: 'Baileys', qtd: 3, unitPrice: 1600 },
      { produto: 'Malibu', qtd: 2, unitPrice: 1210 },
      { produto: 'Tonic Water', qtd: 1, unitPrice: 2760, isCase: true },
      { produto: 'Red Bull', qtd: 2, unitPrice: 4280, isCase: true },
      { produto: 'Orange Juice', qtd: 12, unitPrice: 338 },
      { produto: 'Pineapple Juice', qtd: 12, unitPrice: 338 },
    ],
  },
  {
    date: '2026-07-19',
    slip: '00069891',
    total: 32575,
    items: [
      { produto: 'Heineken 330ml', qtd: 1, unitPrice: 6000, isCase: true },
      { produto: 'Uron Tea', qtd: 1, unitPrice: 720, isCase: true },
      { produto: 'Green Tea', qtd: 1, unitPrice: 720, isCase: true },
      { produto: 'Jasmine Tea (caixa 6)', qtd: 1, unitPrice: 720, isCase: true },
      { produto: 'Red Bull', qtd: 2, unitPrice: 4280, isCase: true },
      { produto: 'Water 2L (case 6)', qtd: 1, unitPrice: 600, isCase: true },
      { produto: 'Corona Extra 355ml', qtd: 2, unitPrice: 6250, isCase: true },
    ],
  },
  {
    date: '2026-07-22',
    slip: '00069920',
    total: 2548,
    items: [
      { produto: 'Water 500ml', qtd: 2, unitPrice: 1180, isCase: true },
    ],
  },
  {
    date: '2026-07-23',
    slip: '00069973',
    total: 72629,
    items: [
      { produto: 'Yamazaki NV', qtd: 2, unitPrice: 16000 },
      { produto: 'Estrella Damm 330ml', qtd: 3, unitPrice: 5560, isCase: true },
      { produto: 'Malibu', qtd: 2, unitPrice: 1210 },
      { produto: 'Cranberry Juice', qtd: 6, unitPrice: 498 },
      { produto: 'Soda Water 500ml', qtd: 12, unitPrice: 115 },
      { produto: 'Wilkinson Gin 1.8L', qtd: 2, unitPrice: 1880 },
      { produto: 'Nikka Black 4L', qtd: 1, unitPrice: 3780 },
      { produto: 'Water 500ml', qtd: 2, unitPrice: 1180, isCase: true },
      { produto: 'Mango Juice', qtd: 2, unitPrice: 398 },
    ],
  },
  {
    date: '2026-07-30',
    slip: '00070161',
    total: 85647,
    items: [
      { produto: 'Asahi Beer 330ml', qtd: 2, unitPrice: 5900, isCase: true },
      { produto: 'Heineken 330ml', qtd: 1, unitPrice: 6000, isCase: true },
      { produto: 'Guiness Beer', qtd: 2, unitPrice: 6000, isCase: true },
      { produto: 'Cranberry Juice', qtd: 12, unitPrice: 498 },
      { produto: 'Soda Water 500ml', qtd: 24, unitPrice: 115 },
      { produto: 'Orange Juice', qtd: 24, unitPrice: 338 },
      { produto: 'Baileys', qtd: 2, unitPrice: 1600 },
      { produto: 'Malibu', qtd: 2, unitPrice: 1210 },
      { produto: 'Fireball', qtd: 2, unitPrice: 1880 },
      { produto: 'Mango Juice', qtd: 2, unitPrice: 398 },
      { produto: 'Red Bull', qtd: 3, unitPrice: 4280, isCase: true },
      { produto: 'Coca Cola 700ml', qtd: 1, unitPrice: 2960, isCase: true },
    ],
  },
]
