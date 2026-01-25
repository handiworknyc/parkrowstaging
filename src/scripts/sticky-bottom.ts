// /src/scripts/sticky-bottom.ts
// GSAP ScrollTrigger for mobile bottom bar
// Install: npm install gsap

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const DEBUG = false;

function dbg(...args: any[]) {
  if (DEBUG) console.log('[StickyBottom]', ...args);
}

// ------------------------------------
// STATE
// ------------------------------------
let scrollTriggerInstance: ScrollTrigger | null = null;

// ------------------------------------
// STICKY BOTTOM SCROLLTRIGGER
// ------------------------------------
function initStickyBottom() {
  const MOB_MQ = window.matchMedia('(max-width: 699px)');
  
  if (!MOB_MQ.matches) {
    dbg('Desktop - skipping');
    return;
  }

  const bar = document.querySelector<HTMLElement>('.mob-bottom-bar');
  const footer = document.querySelector('#footer');
  
  if (!bar || !footer) {
    dbg('Elements not found');
    return;
  }

  // Kill existing instance
  if (scrollTriggerInstance) {
    scrollTriggerInstance.kill();
  }

  dbg('Creating ScrollTrigger');

  // Create ScrollTrigger
  scrollTriggerInstance = ScrollTrigger.create({
    trigger: footer,
    start: 'top bottom', // When footer top hits viewport bottom
    end: 'top bottom',   // Same point (toggle, not range)
    
    onEnter: () => {
      dbg('→ ENTERING footer - unstick bar');
      bar.classList.add('mob-bar-unstuck');
    },
    
    onLeaveBack: () => {
      dbg('← EXITING footer - re-stick bar');
      bar.classList.remove('mob-bar-unstuck');
    },
    
    markers: DEBUG, // Visual markers when debugging
  });

  dbg('ScrollTrigger created');
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
function init() {
  dbg('Init');
  
  // Run on page load
  initStickyBottom();
  
  // Reinit on Astro navigation
  document.addEventListener('astro:page-load', () => {
    dbg('astro:page-load - reinit');
    initStickyBottom();
  });
  
  // Handle media query changes
  const MOB_MQ = window.matchMedia('(max-width: 699px)');
  MOB_MQ.addEventListener('change', (e) => {
    dbg('Media query changed:', e.matches);
    if (e.matches) {
      initStickyBottom();
    } else {
      if (scrollTriggerInstance) {
        scrollTriggerInstance.kill();
        scrollTriggerInstance = null;
      }
      document.querySelector('.mob-bottom-bar')?.classList.remove('mob-bar-unstuck');
    }
  });
}

// Auto-init
init();

export { initStickyBottom };