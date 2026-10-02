<script>
import config from '../config.js'
import analytics from '../utils/analytics.js'
import SidebarMenuItem from '../components/SidebarMenuItem.svelte'
import { settings, exchangeRates, haveMessages } from '../stores.js'
import { currencies } from '../utils/fx.js'

function toggle(setting) {
  if (settingConfig[setting] != null && settingConfig[setting].valueType === 'bool') {
    onChange(setting, !$settings[setting])
  }
}

function onChange(setting, value) {
  settings.set({ ...$settings, [setting]: value })
  analytics.trackEvent('settings', setting, value)
}

const currencyOptions = Object.keys(currencies).map(code => {
  return {
    value: code,
    label: `${currencies[code].char} ${currencies[code].name}`,
    tags: [code, currencies[code].name, ...currencies[code].countries]
  }
})

const priceChartOptions = [
  { value: 'none', label: 'Off', tags: ['none', 'off'] },
  { value: '1d', label: '1D', tags: ['day', '24h'] },
  { value: '30d', label: '30D', tags: ['month', '30 days'] }
]

let settingConfig = {
  showNetworkStatus: {
    label: 'Network Status',
    valueType: 'bool'
  },
  darkMode: {
    label: 'Dark Mode',
    valueType: 'bool'
  },
  currency: {
    label: 'Fiat Currency',
    type: 'dropdown',
    valueType: 'string',
    options: currencyOptions
  },
  vbytes: {
    label: 'Size by',
    type: 'pill',
    falseLabel: 'value',
    trueLabel: 'vbytes',
    valueType: 'bool'
  },
  colorByFee: {
    label: 'Color by',
    type: 'pill',
    falseLabel: 'age',
    trueLabel: 'fee rate',
    valueType: 'bool'
  },
  showGhostTrails: {
    label: 'Ghost Trails',
    valueType: 'bool'
  },
  showSearch: {
    label: 'Search Bar',
    valueType: 'bool'
  },
  priceChartMode: {
    label: 'Price Chart',
    type: 'dropdown',
    valueType: 'string',
    options: priceChartOptions
  }
}
$: {
  if (config.messagesEnabled && $haveMessages) {
    settingConfig.showMessages = {
      label: 'Message Bar',
      valueType: 'bool'
    }
  }
}

$: {
  const rate = $exchangeRates[$settings.currency]
  if (rate && rate.last) {
    settingConfig.showFX = {
      label: '₿ Price',
      valueType: 'bool'
    }
  } else {
    settingConfig.showFX = false
  }
}


function getSettings(setting) {
  return settingConfig[setting] || {}
}

</script>

{#each Object.keys($settings) as setting (setting) }
  {#if settingConfig[setting]}
    <SidebarMenuItem {...getSettings(setting)} value={$settings[setting]} on:click={() => { toggle(setting) }} on:input={(e) => { onChange(setting, e.detail)}} />
  {/if}
{/each}
