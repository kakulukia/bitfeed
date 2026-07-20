<script>
import { onMount } from 'svelte'
import config from '../config.js'
import analytics from '../utils/analytics.js'

import SidebarTab from '../components/SidebarTab.svelte'
import Icon from '../components/Icon.svelte'

import Settings from '../components/Settings.svelte'
import cogIcon from '../assets/icon/cil-cog.svg'
import DevTools from '../components/DevTools.svelte'
import codeIcon from '../assets/icon/cil-code.svg'
import questionIcon from '../assets/icon/help-circle.svg'
import infoIcon from '../assets/icon/info.svg'
import atIcon from '../assets/icon/cil-at.svg'
import gridIcon from '../assets/icon/grid-icon.svg'
import peopleIcon from '../assets/icon/cil-people.svg'
import giftIcon from '../assets/icon/cil-gift.svg'
import bookmarkIcon from '../assets/icon/cil-bookmark.svg'
import fullscreenIcon from '../assets/icon/cil-fullscreen.svg'
import fullscreenExitIcon from '../assets/icon/cil-fullscreen-exit.svg'
import replayIcon from '../assets/icon/cil-reload.svg'
import MempoolLegend from '../components/MempoolLegend.svelte'
import ContactTab from '../components/ContactTab.svelte'
import SearchTab from '../components/SearchTab.svelte'

import { sidebarToggle, overlay, currentBlock, latestBlockHeight, blockVisible, replayBlockTrigger, haveSupporters, freezeResize, fullscreenActive } from '../stores.js'

let searchTabComponent
let fullscreen = false
let fullscreenTarget = null
let showFullscreenExit = false
let fullscreenExitTimer
let sidebarIdleHidden = false
let sidebarIdleTimer
const sidebarIdleMs = 21000

let blockHidden = false
$: blockHidden = ($currentBlock && !$blockVisible)
$: canReplayBlock = ($currentBlock && $currentBlock.height == $latestBlockHeight)
$: if ($sidebarToggle) sidebarIdleHidden = false

onMount(() => {
  syncFullscreen()
  scheduleSidebarIdleHide()
  document.addEventListener('fullscreenchange', syncFullscreen)
  return () => {
    document.removeEventListener('fullscreenchange', syncFullscreen)
    showCursor()
    if (sidebarIdleTimer) clearTimeout(sidebarIdleTimer)
  }
})

function settings (tab) {
  recordActivity()
  if ($sidebarToggle) analytics.trackEvent('sidebar', $sidebarToggle, 'close')
  if ($sidebarToggle === tab) {
    sidebarToggle.set(null)
  } else {
    analytics.trackEvent('sidebar', tab, 'open')
    sidebarToggle.set(tab)
  }
}

function openOverlay (key) {
  recordActivity()
  $overlay = key
}

function showBlock () {
  recordActivity()
  analytics.trackEvent('viz', 'block', 'show')
  $blockVisible = true
}

function replayBlock () {
  recordActivity()
  analytics.trackEvent('viz', 'block', 'replay')
  replayBlockTrigger.increment()
}

function syncFullscreen () {
  const actualFullscreen = !!document.fullscreenElement
  if (fullscreenTarget != null && actualFullscreen !== fullscreenTarget) return

  fullscreenTarget = null
  fullscreen = actualFullscreen
  fullscreenActive.set(actualFullscreen)
  if (actualFullscreen) revealFullscreenExit()
  else hideFullscreenExit()
}

async function toggleFullscreen () {
  const targetFullscreen = !fullscreen
  fullscreenTarget = targetFullscreen
  fullscreen = targetFullscreen

  try {
    if (targetFullscreen) {
      await document.documentElement.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
    syncFullscreen()
    analytics.trackEvent('viz', 'fullscreen', fullscreen ? 'enter' : 'exit')
  } catch (e) {
    fullscreenTarget = null
    syncFullscreen()
    console.warn('fullscreen unavailable', e)
  }
}

function revealFullscreenExit () {
  if (!fullscreen) return
  showFullscreenExit = true
  if (fullscreenExitTimer) clearTimeout(fullscreenExitTimer)
  fullscreenExitTimer = setTimeout(hideFullscreenExit, 2400)
}

function hideFullscreenExit () {
  showFullscreenExit = false
  if (fullscreenExitTimer) clearTimeout(fullscreenExitTimer)
  fullscreenExitTimer = null
}

function recordActivity () {
  showCursor()
  sidebarIdleHidden = false
  revealFullscreenExit()
  scheduleSidebarIdleHide()
}

function showCursor () {
  document.documentElement.classList.remove('cursor-hidden')
}

function scheduleSidebarIdleHide () {
  if (sidebarIdleTimer) clearTimeout(sidebarIdleTimer)
  sidebarIdleTimer = setTimeout(() => {
    document.documentElement.classList.add('cursor-hidden')
    if (!$sidebarToggle && !$fullscreenActive) sidebarIdleHidden = true
  }, sidebarIdleMs)
}
</script>

<style type="text/scss">
  .sidebar {
    position: fixed;
    top: 20%;
    left: 100%;
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-start;
    align-items: flex-start;

    @media (max-width: 480px) and (max-height: 480px) {
      &:not(.frozen) {
        display: none;
      }
    }

    &.ambient-mode {
      opacity: 0;
      pointer-events: none;
    }

    &.idle-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateX(3rem);
    }

    transition: opacity 350ms, transform 450ms;
  }

  .fullscreen-exit-button {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 20;
    padding: 5px;
    margin: 0;
    border: none;
    border-radius: 5px;
    background: var(--palette-c);
    color: var(--palette-x);
    font-size: 1.5rem;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 300ms, background 300ms;

    &.visible {
      opacity: 0.9;
      pointer-events: all;
    }

    &:hover {
      background: var(--palette-d);
      opacity: 1;
    }
  }

  :global(html.cursor-hidden),
  :global(html.cursor-hidden *) {
    cursor: none !important;
  }
</style>

<svelte:window on:pointermove={recordActivity} on:pointerdown={recordActivity} on:keydown={recordActivity} />

<div class="sidebar" class:frozen={$freezeResize} class:ambient-mode={$fullscreenActive} class:idle-hidden={sidebarIdleHidden}>
  <!-- displayed in reverse order, to preserve proper z-index layering -->
  {#if canReplayBlock}
    <SidebarTab on:click={replayBlock} tooltip="Replay Latest Block">
      <span slot="tab" title="Replay Latest Block">
        <Icon icon={replayIcon} color="var(--bold-a)" />
      </span>
    </SidebarTab>
  {/if}
  {#if blockHidden }
    <SidebarTab  on:click={() => showBlock()} tooltip="Show Latest Block">
      <span slot="tab">
        <Icon icon={gridIcon} color="var(--bold-a)" />
      </span>
      <div slot="content">
        <MempoolLegend />
      </div>
    </SidebarTab>
  {/if}
  {#if config.dev && config.debug}
    <SidebarTab open={$sidebarToggle === 'dev'} on:click={() => {settings('dev')}} tooltip="Debug">
      <span slot="tab">
        <Icon icon={codeIcon} color="var(--bold-a)" />
      </span>
      <div slot="content">
        <DevTools />
      </div>
    </SidebarTab>
  {/if}
  {#if config.donationsEnabled }
    <SidebarTab on:click={() => openOverlay('donation')} tooltip="Donate">
      <span slot="tab">
        <Icon icon={giftIcon} color="var(--bold-a)" />
      </span>
    </SidebarTab>
  {/if}
  {#if $haveSupporters }
    <SidebarTab on:click={() => openOverlay('supporters')} tooltip="Supporters">
      <span slot="tab">
        <Icon icon={peopleIcon} color="var(--bold-a)" />
      </span>
    </SidebarTab>
  {/if}
  <SidebarTab on:click={() => openOverlay('about')} tooltip="About">
    <span slot="tab">
      <Icon icon={questionIcon} color="var(--bold-a)" />
    </span>
  </SidebarTab>
  <SidebarTab open={$sidebarToggle === 'contact'} on:click={() => {settings('contact')}} tooltip="Contact">
    <span slot="tab">
      <Icon icon={atIcon} color="var(--bold-a)" />
    </span>
    <div slot="content">
      <ContactTab />
    </div>
  </SidebarTab>
  <SidebarTab open={$sidebarToggle === 'legend'} on:click={() => {settings('legend')}} tooltip="Key">
    <span slot="tab">
      <Icon icon={infoIcon} color="var(--bold-a)" />
    </span>
    <div slot="content">
      <MempoolLegend />
    </div>
  </SidebarTab>
  <SidebarTab open={$sidebarToggle === 'search'} on:click={() => {settings('search')}} tooltip="Search & Highlight" bind:this={searchTabComponent}>
    <span slot="tab" title="Search & Highlight">
      <Icon icon={bookmarkIcon} color="var(--bold-a)" />
    </span>
    <div slot="content">
      <SearchTab tab={searchTabComponent} />
    </div>
  </SidebarTab>
  <SidebarTab on:click={toggleFullscreen} tooltip={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
    <span slot="tab" title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
      <Icon icon={fullscreen ? fullscreenExitIcon : fullscreenIcon} color="var(--bold-a)" />
    </span>
  </SidebarTab>
  <SidebarTab open={$sidebarToggle === 'settings'} on:click={() => {settings('settings')}} tooltip="Settings">
    <span slot="tab" title="Settings">
      <Icon icon={cogIcon} color="var(--bold-a)" />
    </span>
    <div slot="content">
      <Settings />
    </div>
  </SidebarTab>
</div>

{#if $fullscreenActive}
  <button class="fullscreen-exit-button" class:visible={showFullscreenExit} on:click={toggleFullscreen} title="Exit Fullscreen" aria-label="Exit Fullscreen">
    <Icon icon={fullscreenExitIcon} color="var(--bold-a)" />
  </button>
{/if}
