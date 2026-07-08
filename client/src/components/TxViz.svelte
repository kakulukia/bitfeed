<script>
  import { onMount } from 'svelte'
  import TxController from '../controllers/TxController.js'
  import TxRender from './TxRender.svelte'
  import getTxStream from '../controllers/TxStream.js'
  import { settings, overlay, serverConnected, serverDelay, txCount, mempoolCount,
           mempoolScreenHeight, mempoolScreenLeft, blockVisible, tinyScreen,
           compactScreen, currentBlock, latestBlockHeight, selectedTx, blockAreaSize,
           replayBlockTrigger, devEvents, devSettings, pageWidth, pageHeight, loading, freezeResize, fullscreenActive } from '../stores.js'
  import BlockInfo from '../components/BlockInfo.svelte'
  import SearchBar from '../components/SearchBar.svelte'
  import TxInfo from '../components/TxInfo.svelte'
  import Sidebar from '../components/Sidebar.svelte'
  import TransactionOverlay from '../components/TransactionOverlay.svelte'
  import AboutOverlay from '../components/AboutOverlay.svelte'
  import PriceChartBackground from '../components/PriceChartBackground.svelte'
  import DonationOverlay from '../components/DonationOverlay.svelte'
  import SupportersOverlay from '../components/SupportersOverlay.svelte'
  import LoadingAnimation from '../components/util/LoadingAnimation.svelte'
  import Alerts from '../components/alert/Alerts.svelte'
  import { formatMempoolBlockEstimate, numberFormat } from '../utils/format.js'
  import { exchangeRates, lastBlockId, haveSupporters } from '../stores.js'
  import { formatCurrency } from '../utils/fx.js'
  import { fade } from 'svelte/transition'
  import config from '../config.js'

  let width = window.innerWidth - 20
  let height = window.innerHeight - 20
  let txController
  let blockCount = 0
  let running = false

  let lastFrameUpdate = 0
  const blockFullOpacityMs = 21000
  const blockFreshStartDelayMs = 6900
  const blockFreshDurationMs = (blockFullOpacityMs - blockFreshStartDelayMs) / 3
  const blockDimOpacity = 0.21
  let blockOpacityTimeout
  let blockFreshTimeout
  let blockFreshEndTimeout
  let blockOpacityBlockId
  let blockFullOpacityUntil = 0
  let blockFresh = false
  let blockHover = false
  let blockDisplayOpacity = blockDimOpacity
  let lastReplayBlockTrigger = 0
  let roundedMempoolCount = 0
  let mempoolVbytes = 0
  let mempoolBlockEstimate = null

  $: roundedMempoolCount = Math.round($mempoolCount)
  $: mempoolBlockEstimate = formatMempoolBlockEstimate(mempoolVbytes)

  let txStream
  if (!config.noTxFeed || !config.noBlockFeed) txStream = getTxStream()

  $: {
    if ($blockVisible) {
      if (txController) txController.showBlock()
    } else {
      if (txController) txController.hideBlock()
    }
  }

  $: {
    if (txController && $currentBlock && $currentBlock.id !== blockOpacityBlockId) {
      showNewBlockAtFullOpacity($currentBlock)
    }
  }

  $: {
    if (txController && $replayBlockTrigger > lastReplayBlockTrigger) {
      lastReplayBlockTrigger = $replayBlockTrigger
      replayBlock()
    }
  }

  let modeLoaded = false
  let currentMode
  $: {
    if ($settings && currentMode != $settings.vbytes) {
      if (!modeLoaded) modeLoaded = true
      else changedMode($settings.vbytes)
      currentMode = $settings.vbytes
    }
  }

  let canvasWidth = '100%'
  let canvasHeight = '100%'
  $: {
    if ($freezeResize) {
      canvasWidth = `${window.innerWidth}px`
      canvasHeight = `${window.innerHeight}px`
    } else {
      canvasWidth = '100%'
      canvasHeight = '100%'
      resize()
    }
  }

  onMount(() => {
    txController = new TxController({ width, height })

    if (!config.noTxFeed) {
      txStream.subscribe('tx', tx => {
        txController.addTx(tx)
      })
      txStream.subscribe('drop_tx', txid => {
        txController.dropTx(txid)
      })
    }
    if (!config.noBlockFeed) {
      txStream.subscribe('block', ({block, realtime}) => {
        if (block) {
          const added = txController.addBlock(block, realtime)
          if (added && added.id) $lastBlockId = added.id
        }
      })
    }
    if (!config.noTxFeed || !config.noBlockFeed) {
      txStream.subscribe('mempool_count', mempool => {
        if (typeof mempool === 'number') {
          $mempoolCount = mempool
          mempoolVbytes = 0
        } else {
          $mempoolCount = mempool.count
          mempoolVbytes = mempool.vbytes || 0
        }
      })
    }

    $devEvents.addOneCallback = fakeTx
    $devEvents.addManyCallback = fakeTxs
    $devEvents.addBlockCallback = fakeBlock
  })

  function resize () {
    $pageWidth = window.innerWidth
    $pageHeight = window.innerHeight
    if ((width !== window.innerWidth - 20 || height !== window.innerHeight - 20) && !$freezeResize) {
      // don't force resize unless the viewport has actually changed
      width = window.innerWidth - 20
      height = window.innerHeight - 20
      txController.resize({
        width,
        height
      })
    }
  }

  function changedMode () {
    if (txController) {
      txController.redoLayout({
        width,
        height
      })
    }
  }

  function hideBlock () {
    $blockVisible = false
  }

  function quitExploring () {
    if (txController) txController.resumeLatest()
  }

  function showNewBlockAtFullOpacity (block) {
    if (blockOpacityTimeout) clearTimeout(blockOpacityTimeout)
    blockOpacityBlockId = block.id
    blockFullOpacityUntil = Date.now() + blockFullOpacityMs
    scheduleFreshBlockAura(block)

    if (!blockHover) setBlockOpacity(Date.now() < blockFullOpacityUntil ? 1 : blockDimOpacity, 250)
    if (Date.now() < blockFullOpacityUntil) {
      blockOpacityTimeout = setTimeout(() => {
        if ($currentBlock && $currentBlock.id === block.id && !blockHover) {
          setBlockOpacity(blockDimOpacity, 1200)
        }
        if ($currentBlock && $currentBlock.id === block.id) blockFresh = false
      }, blockFullOpacityUntil - Date.now())
    }
  }

  function scheduleFreshBlockAura (block) {
    if (blockFreshTimeout) clearTimeout(blockFreshTimeout)
    if (blockFreshEndTimeout) clearTimeout(blockFreshEndTimeout)
    blockFresh = false

    blockFreshTimeout = setTimeout(() => {
      if ($currentBlock && $currentBlock.id === block.id && block.height === $latestBlockHeight) {
        blockFresh = true
        blockFreshEndTimeout = setTimeout(() => {
          if ($currentBlock && $currentBlock.id === block.id) blockFresh = false
        }, blockFreshDurationMs)
      }
    }, blockFreshStartDelayMs)
  }

  function setBlockOpacity (opacity, duration=250) {
    blockDisplayOpacity = opacity
    if (txController) txController.setBlockOpacity(opacity, duration)
  }

  function restoreBlockOpacity () {
    setBlockOpacity(Date.now() < blockFullOpacityUntil ? 1 : blockDimOpacity, 250)
  }

  function replayBlock () {
    if (txController) txController.replayLatestBlock()
    if ($currentBlock) showNewBlockAtFullOpacity($currentBlock)
  }

  function focusBlock () {
    blockHover = true
    setBlockOpacity(1, 250)
  }

  function dimBlock () {
    blockHover = false
    restoreBlockOpacity()
  }

  function fakeBlock () {
    const block = txController.simulateBlock()
    // txController.addBlock(new BitcoinBlock({
    //   version: 'fake',
    //   id: Math.random(),
    //   value: 10000,
    //   prev_block: 'also_fake',
    //   merkle_root: 'merkle',
    //   timestamp: performance.now(),
    //   bits: 'none',
    //   txn_count: 20,
    //   txns: (new Array(100)).fill(0).map((x, i) => {
    //     return {
    //       version: 'fictional',
    //       value: Math.floor(Math.random() * 1000000) + 1,
    //       id: `fake_tx_${i}_${Math.random()}`
    //     }
    //   })
    // }))
  }

  function fakeTx (value) {
    txController.simulateDumpTx(1, value)
  }

  function fakeTxs () {
    txController.simulateDumpTx(200)
  }

  $: connectionColor = ($serverConnected && $serverDelay < 5000) ? ($serverDelay < 500 ? 'good' : 'ok') : 'bad'
  $: connectionTitle = ($serverConnected && $serverDelay < 5000) ? ($serverDelay < 500 ? 'Streaming live transactions' : 'Unstable connection') : 'Disconnected'

  const fxColor = 'good'
  const priceChartModes = ['none', '1d', '30d']
  let fxLabel = ''
  let priceChartLabel = ''
  let priceChartFocused = false
  $: {
    const rate = $exchangeRates[$settings.currency]
    if (rate && rate.last)
    fxLabel = formatCurrency($settings.currency, rate.last)
  }
  $: priceChartLabel = ($settings.priceChartMode || '30d').toUpperCase()

  function togglePriceChart () {
    const current = $settings.priceChartMode || '30d'
    const next = priceChartModes[(priceChartModes.indexOf(current) + 1) % priceChartModes.length]
    settings.set({ ...$settings, priceChartMode: next })
  }

	const debounce = v => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			val = v;
		}, 750);
	}

  let mousePosition = { x: 0, y: 0 }

  function onClick (e) {
    mousePosition = {
      x: e.clientX,
      y: e.clientY
    }
    const position = {
      x: e.clientX,
      y: window.innerHeight - e.clientY
    }
    if (txController) txController.mouseClick(position)
  }

  function pointerMove (e) {
    if (!txController.selectionLocked) {
      mousePosition = {
        x: e.clientX,
        y: e.clientY
      }
      const position = {
        x: e.clientX,
        y: window.innerHeight - e.clientY
      }
      if (txController) txController.mouseMove(position)
    }
  }

  function pointerLeave (e) {
    const position = {
      x: null,
      y: null
    }
    if (txController) txController.mouseMove(position)
  }
</script>

<style type="text/scss">
  .tx-area {
    position: fixed;
    width: 100%;
    height: 100%;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
    background: var(--palette-a);
    transition: background 500ms;
  }

  .canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .mempool-height {
    position: absolute;
    z-index: 2;
    bottom: calc(25% + 10px);
    left: 0;
    right: 0;
    margin: auto;
    padding: 0;
    transition: bottom 1000ms;

    .mempool-count {
      position: absolute;
      bottom: .5em;
      left: var(--mempool-left);
      font-size: 0.9rem;
      color: var(--palette-x);
    }

    .mempool-info {
      position: absolute;
      bottom: .5em;
      left: var(--mempool-left);
      right: 0.5em;
      font-size: 0.9rem;
      color: var(--palette-x);
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
    }

    .height-bar {
      position: relative;
      width: 100%;
      height: 1px;
      opacity: 0.85;
      transform: translateY(-2px);

      &::before,
      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        pointer-events: none;
      }

      &::before {
        top: -7px;
        height: 18px;
        background:
          linear-gradient(90deg, transparent 0%, rgba(18, 245, 214, 0.26) 50%, transparent 100%),
          linear-gradient(90deg, transparent 0%, rgba(18, 245, 214, 0.22) 50%, transparent 100%),
          linear-gradient(90deg, transparent 0%, rgba(18, 245, 214, 0.3) 50%, transparent 100%),
          linear-gradient(90deg, transparent 0%, rgba(18, 245, 214, 0.18) 50%, transparent 100%);
        background-size: 15rem 100%, 22rem 100%, 31rem 100%, 18rem 100%;
        filter: blur(5px);
        opacity: 0.6;
        z-index: 1;
        animation: mempool-tide-fancy 18s linear infinite;
      }

      &::after {
        top: 1px;
        height: 2px;
        background:
          linear-gradient(90deg, transparent 43%, rgba(18, 245, 214, 0.78) 50%, transparent 57%),
          linear-gradient(90deg, transparent 46%, rgba(18, 245, 214, 0.62) 50%, transparent 54%),
          linear-gradient(90deg, transparent 40%, rgba(18, 245, 214, 0.72) 50%, transparent 60%),
          linear-gradient(90deg, transparent 47%, rgba(18, 245, 214, 0.56) 50%, transparent 53%);
        background-size: 15rem 100%, 22rem 100%, 31rem 100%, 18rem 100%;
        opacity: 0.45;
        z-index: 2;
        animation: mempool-tide-fancy 18s linear infinite;
      }
    }
  }

  .mempool-size-label {
    position: absolute;
    top: 30px;
    left: 30px;
    font-size: 20px;
    font-family: monospace;
    font-weight: bold;
    color: var(--palette-x);
    transition: color 500ms;
  }

  .top-bar {
    position: absolute;
    z-index: 3;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;

    .status, .spacer {
      width: 6.25rem;
    }

    .status {
      text-align: left;
      padding: 1rem;
      width: 20em;
      min-width: 7.5em;
      flex-shrink: 3;
      box-sizing: border-box;

      .row {
        margin-bottom: 5px;
      }

      .status-row {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        height: 0.72rem;
      }

      .status-light {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 5px;

        &.bad {
          background: var(--palette-bad);
        }
        &.ok {
          background: var(--palette-ok);
        }
        &.good {
          background: var(--palette-good);
        }
      }

      .stat-counter, .fx-ticker {
        white-space: nowrap;
        cursor: pointer;

        &.bad {
          color: var(--palette-bad);
        }
        &.ok {
          color: var(--palette-ok);
        }
        &.good {
          color: var(--palette-good);
        }
      }

      .block-height {
        margin-bottom: 5px;
        color: white;
      }

      .price-chart-mode {
        color: var(--palette-good);
        display: inline-flex;
        align-items: center;
        font-size: 0.72rem;
        font-weight: bold;
        line-height: 1;
      }

      &.tiny {
        width: 100%;
        .row {
          width: 100%;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }

        .status-row {
          justify-content: flex-start;
        }
      }
    }
  }

  .search-bar-wrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    height: 3.5em;
    flex-grow: 1;
  }

  .alert-bar-wrapper {
    width: 20em;
    flex-shrink: 0;
  }

  .block-area-wrapper {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    pointer-events: none;

    .spacer {
      flex: 1;
    }

    .block-area-outer {
      position: relative;
      flex: 0;
      pointer-events: auto;
      // width: 75vw;
      // max-width: 40vh;
      margin: auto;

      .block-area {
        position: relative;
        z-index: 1;
        padding-top: 100%;
      }

      &.block-fresh {
        --fresh-angle: 0deg;

        &::before,
        &::after {
          content: '';
          display: block;
          position: absolute;
          z-index: 2;
          inset: -0.35rem;
          border-radius: 3px;
          box-sizing: border-box;
          pointer-events: none;
        }

        &::before {
          border: 2px solid rgba(247, 147, 26, 0.35);
          box-shadow: 0 0 18px rgba(247, 147, 26, 0.75), inset 0 0 10px rgba(247, 147, 26, 0.22);
          animation: block-fresh-fade var(--fresh-duration) ease-out 1 forwards;
        }

        &::after {
          border: 2px solid transparent;
          border-image: conic-gradient(from var(--fresh-angle), transparent 0deg 284deg, rgba(247, 147, 26, 0.3) 302deg, #f7931a 326deg, rgba(255, 122, 0, 0.6) 345deg, transparent 360deg) 1;
          animation: block-fresh-spin var(--fresh-duration) linear 1 forwards, block-fresh-fade var(--fresh-duration) ease-out 1 forwards;
        }
      }

      .guide-area {
        background: #00FF00;
        opacity: 25%;
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
      }
    }
  }

  .guide-overlay {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;

    pointer-events: none;

    .guide {
      position: absolute;
      background: #00FF00;
    }

    .v-half {
      top: 0;
      bottom: 0;
      left: calc(50% - 1px);
      width: 1px;
      margin: auto;
    }

    .h-half {
      top: calc(50% - 1px);
      left: 0;
      right: 0;
      height: 1px;
      margin: auto;
    }

    .mempool-height {
      bottom: 25%;
      left: 0;
      right: 0;
      height: 1px;
      margin: auto;
    }
  }

  .loading-overlay {
    position: fixed;
    width: 100%;
    height: 100%;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 999;
    background: rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    .loading-wrapper {
      width: 100px;
    }

    .loading-msg {
      margin: .4em 0 0;
      font-size: 1em;
      font-weight: bold;
      color: white;
      text-shadow: 0 0 10px black;
    }
  }

  @media screen and (max-width: 640px) {
    .search-bar-wrapper {
      position: fixed;
      top: 3.5em;
      left: 0;
      right: 0;
    }
  }

  @media screen and (max-width: 480px) {
    .alert-bar-wrapper {
      font-size: 0.8em;
      width: 18em;
    }
  }

  .tx-area.ambient-mode {
    .top-bar {
      pointer-events: none;

      .search-bar-wrapper,
      .alert-bar-wrapper,
      .block-height,
      .status .row:not(:first-child) {
        opacity: 0;
      }

      .fx-ticker {
        text-shadow: 0 0 8px var(--palette-y);
      }
    }

    .mempool-height {
      .height-bar {
        opacity: 0.35;
      }

      .mempool-count,
      .mempool-info {
        font-size: 1rem;
        text-shadow: 0 0 8px var(--palette-y);
      }
    }
  }

  @property --fresh-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }

  @keyframes block-fresh-spin {
    to {
      --fresh-angle: 720deg;
    }
  }

  @keyframes block-fresh-fade {
    0% {
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    80% {
      opacity: 0.75;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes mempool-tide {
    from {
      background-position-x: 0;
    }
    to {
      background-position-x: 18rem;
    }
  }

  @keyframes mempool-tide-fancy {
    from {
      background-position: 0 0, 0 0, 0 0, 0 0;
    }
    to {
      background-position: 30rem 0, -22rem 0, 62rem 0, -36rem 0;
    }
  }
</style>

<svelte:window on:resize={resize} on:load={resize} on:click={pointerLeave} />
<!-- <svelte:window on:resize={resize} on:click={pointerMove} /> -->

<div class="tx-area" class:light-mode={!$settings.darkMode} class:ambient-mode={$fullscreenActive} style="width: {canvasWidth}; height: {canvasHeight}">
  <div class="canvas-wrapper" on:pointerleave={pointerLeave} on:pointermove={pointerMove} on:click={onClick}>
    <PriceChartBackground focused={priceChartFocused} />
    <TxRender controller={txController} />

    <div class="mempool-height" style="bottom: calc({$mempoolScreenHeight + 20}px); --mempool-left: {$mempoolScreenLeft}px">
      <div class="height-bar" />
      {#if $tinyScreen}
        <div class="mempool-info">
          <span class="left">Mempool</span>
          <span class="right">{ numberFormat.format(roundedMempoolCount) }</span>
        </div>
      {:else}
        <span class="mempool-count">Mempool: { numberFormat.format(roundedMempoolCount) } tx{#if mempoolBlockEstimate}{' / '}{mempoolBlockEstimate}{/if} unconfirmed</span>
      {/if}
    </div>

    <div class="block-area-wrapper">
      <div class="spacer" style="flex: {$pageWidth <= 640 ? '1.5' : '1'}"></div>
      <div class="block-area-outer" class:block-fresh={blockFresh} style="width: {$blockAreaSize}px; height: {$blockAreaSize}px; --block-control-opacity: {blockDisplayOpacity}; --fresh-duration: {blockFreshDurationMs}ms" on:pointerenter={focusBlock} on:pointerleave={dimBlock}>
        <div class="block-area">
          <BlockInfo block={$currentBlock} visible={$blockVisible && !$tinyScreen} on:hideBlock={hideBlock} on:quitExploring={quitExploring} />
        </div>
        {#if config.dev && config.debug && $devSettings.guides }
          <div class="guide-area" />
        {/if}
      </div>
      <div class="spacer"></div>
      <div class="spacer"></div>
    </div>
  </div>

  {#if $selectedTx }
    <TxInfo tx={$selectedTx} position={mousePosition} />
  {/if}

  <div class="top-bar">
    <div class="status" class:tiny={$tinyScreen}>
      <div class="row">
        {#if $settings.showFX && fxLabel }
          <span class="fx-ticker {fxColor}" on:click={togglePriceChart} on:pointerenter={() => priceChartFocused = true} on:pointerleave={() => priceChartFocused = false}>{ fxLabel }</span>
        {/if}
        {#if $tinyScreen && $currentBlock }
          <span class="block-height"><b>Block: </b>{ numberFormat.format($currentBlock.height) }</span>
        {/if}
      </div>
      <div class="row status-row">
        {#if $settings.showNetworkStatus }
          <div class="status-light {connectionColor}" title={connectionTitle}></div>
        {/if}
        {#if $settings.priceChartMode !== 'none' }
          <span class="price-chart-mode">{ priceChartLabel }</span>
        {/if}
      </div>
    </div>
    {#if $settings.showSearch && !$tinyScreen && !$compactScreen }
      <div class="search-bar-wrapper">
        <SearchBar />
      </div>
    {/if}
    {#if !$tinyScreen}
      <div class="alert-bar-wrapper">
        {#if config.messagesEnabled && $settings.showMessages}
          <Alerts />
        {:else}
          <div class="spacer"></div>
        {/if}
      </div>
    {/if}
  </div>

  <Sidebar />

  <TransactionOverlay />
  <AboutOverlay />
  {#if config.donationsEnabled }
    <DonationOverlay />
    {#if $haveSupporters}
      <SupportersOverlay />
    {/if}
  {/if}

  {#if $loading}
    <div class="loading-overlay" in:fade={{ delay: 1000, duration: 500 }} out:fade={{ duration: 200 }}>
      <div class="loading-wrapper">
        <LoadingAnimation />
        <p class="loading-msg">loading</p>
      </div>
    </div>
  {/if}

  {#if config.dev && config.debug && $devSettings.guides }
    <div class="guide-overlay">
      <div class="guide v-half" />
      <div class="guide h-half" />
      <div class="guide mempool-height" />
      <div class="area block-area" />
    </div>
  {/if}
</div>
