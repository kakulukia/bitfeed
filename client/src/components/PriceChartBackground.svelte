<script>
import { settings } from '../stores.js'

const chartWidth = 1000
const chartHeight = 320
const padding = 20

let loadedKey = null
let points = []
let path = ''
let chartTrend = 'good'

$: currency = ($settings.currency || 'USD').toLowerCase()
$: mode = $settings.priceChartMode || '30d'
$: loadKey = `${currency}:${mode}`
$: if (mode !== 'none' && loadedKey !== loadKey) loadPrices(currency, mode, loadKey)
$: updateChart(points)

async function loadPrices (targetCurrency, targetMode, targetKey) {
  loadedKey = targetKey
  points = []

  try {
    const params = new URLSearchParams({
      vs_currency: targetCurrency,
      days: targetMode === '1d' ? '1' : '30'
    })
    if (targetMode === '30d') params.set('interval', 'daily')

    const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    if (targetKey !== loadKey) return

    points = (data.prices || [])
      .map(([time, price]) => ({ time, price }))
      .filter(point => Number.isFinite(point.price))
  } catch (error) {
    if (targetKey === loadKey) console.log('error loading price chart: ', error)
  }
}

function updateChart (data) {
  if (data.length < 2) {
    path = ''
    chartTrend = 'good'
    return
  }

  chartTrend = data[data.length - 1].price >= data[0].price ? 'good' : 'bad'

  const prices = data.map(point => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const xStep = (chartWidth - padding * 2) / (data.length - 1)
  const coords = data.map((point, index) => {
    const x = padding + index * xStep
    const y = chartHeight - padding - ((point.price - min) / range) * (chartHeight - padding * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  path = `M${coords.join(' L')}`
}
</script>

<style type="text/scss">
  .price-chart-background {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.55;
  }

  svg {
    width: 112vw;
    height: 58vh;
    transform: translateX(-6vw);
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  path.good {
    stroke: var(--palette-good);
  }

  path.bad {
    stroke: var(--palette-bad);
  }

  .glow {
    stroke-width: 44;
    opacity: 0.4;
    filter: blur(20px);
  }
</style>

{#if mode !== 'none' && path}
  <div class="price-chart-background" data-points={points.length} aria-hidden="true">
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      <path class="glow {chartTrend}" d={path} />
    </svg>
  </div>
{/if}
