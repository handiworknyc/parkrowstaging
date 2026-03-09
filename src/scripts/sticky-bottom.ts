// /src/scripts/sticky-bottom.ts
// GSAP ScrollTrigger for mobile bottom bar
// Install: npm install gsap

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const DEBUG = false;
const MOBILE_MEDIA_QUERY = '(max-width: 699px)';

function dbg(...args: any[]) {
  if (DEBUG) console.log('[StickyBottom]', ...args);
}

type StickyBottomState = {
  installed: boolean;
  mobileMediaQuery?: MediaQueryList;
  pendingFrame: number | null;
  scrollTriggerInstance: ScrollTrigger | null;
};

declare global {
  interface Window {
    __stickyBottomState?: StickyBottomState;
  }
}

function getState(): StickyBottomState {
  return (window.__stickyBottomState ??= {
    installed: false,
    pendingFrame: null,
    scrollTriggerInstance: null,
  });
}

function getMobileMediaQuery(state = getState()) {
  return (state.mobileMediaQuery ??= window.matchMedia(MOBILE_MEDIA_QUERY));
}

function getBar() {
  return document.querySelector<HTMLElement>('.mob-bottom-bar');
}

function setBarUnstuck(unstuck: boolean) {
  getBar()?.classList.toggle('mob-bar-unstuck', unstuck);
}

function resetStickyBottom() {
  setBarUnstuck(false);
}

function cleanupScrollTrigger(state = getState()) {
  state.scrollTriggerInstance?.kill();
  state.scrollTriggerInstance = null;
}

function syncStickyBottom(bar: HTMLElement, footer: HTMLElement) {
  const shouldUnstick = footer.getBoundingClientRect().top <= window.innerHeight;
  bar.classList.toggle('mob-bar-unstuck', shouldUnstick);
  dbg('sync', { shouldUnstick });
}

function scheduleInit(reason: string) {
  const state = getState();

  if (state.pendingFrame !== null) {
    cancelAnimationFrame(state.pendingFrame);
  }

  state.pendingFrame = requestAnimationFrame(() => {
    state.pendingFrame = null;
    dbg('scheduled init', reason);
    initStickyBottom();
  });
}

// ------------------------------------
// STICKY BOTTOM SCROLLTRIGGER
// ------------------------------------
function initStickyBottom() {
  const state = getState();
  const MOB_MQ = getMobileMediaQuery(state);

  cleanupScrollTrigger(state);

  if (!MOB_MQ.matches) {
    dbg('Desktop - skipping');
    resetStickyBottom();
    return;
  }

  const bar = getBar();
  const footer = document.querySelector<HTMLElement>('#footer');

  if (!bar || !footer) {
    dbg('Elements not found');
    resetStickyBottom();
    return;
  }

  dbg('Creating ScrollTrigger');
  resetStickyBottom();
  syncStickyBottom(bar, footer);

  // Create ScrollTrigger
  state.scrollTriggerInstance = ScrollTrigger.create({
    trigger: footer,
    start: 'top bottom', // When footer top hits viewport bottom
    end: 'top bottom',   // Same point (toggle, not range)

    onEnter: () => {
      dbg('→ ENTERING footer - unstick bar');
      setBarUnstuck(true);
    },

    onLeaveBack: () => {
      dbg('← EXITING footer - re-stick bar');
      setBarUnstuck(false);
    },

    onRefresh: () => {
      syncStickyBottom(bar, footer);
    },

    invalidateOnRefresh: true,
    markers: DEBUG, // Visual markers when debugging
  });

  requestAnimationFrame(() => {
    state.scrollTriggerInstance?.refresh();
    syncStickyBottom(bar, footer);
  });

  dbg('ScrollTrigger created');
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
function init() {
  dbg('Init');

  const state = getState();
  if (state.installed) {
    scheduleInit('reinstall');
    return;
  }

  state.installed = true;

  // Run on first paint
  scheduleInit('initial');

  // Reset stale footer state before Astro swaps the document.
  document.addEventListener('astro:before-preparation', () => {
    dbg('astro:before-preparation - reset');
    cleanupScrollTrigger();
    resetStickyBottom();
  });

  // Re-sync as soon as the new DOM is available.
  document.addEventListener('astro:after-swap', () => {
    dbg('astro:after-swap - reinit');
    scheduleInit('astro:after-swap');
  });

  // Re-sync once page scripts/content have settled.
  document.addEventListener('astro:page-load', () => {
    dbg('astro:page-load - reinit');
    scheduleInit('astro:page-load');
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    dbg('pageshow - reinit');
    scheduleInit('pageshow');
  });

  // Handle media query changes
  const MOB_MQ = getMobileMediaQuery(state);
  MOB_MQ.addEventListener('change', (e) => {
    dbg('Media query changed:', e.matches);
    if (e.matches) {
      scheduleInit('media query match');
    } else {
      cleanupScrollTrigger();
      resetStickyBottom();
    }
  });
}

// Auto-init
init();

export { initStickyBottom };
