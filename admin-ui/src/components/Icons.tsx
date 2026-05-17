import React from 'react';

type P = React.SVGProps<SVGSVGElement>;
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconGrid(p: P)        { return <svg viewBox="0 0 24 24" {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>; }
export function IconFolder(p: P)      { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
export function IconZap(p: P)         { return <svg viewBox="0 0 24 24" {...base} {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>; }
export function IconBriefcase(p: P)   { return <svg viewBox="0 0 24 24" {...base} {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12.01" y2="12"/><path d="M2 12h20"/></svg>; }
export function IconAward(p: P)       { return <svg viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="9" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>; }
export function IconMessage(p: P)     { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
export function IconUser(p: P)        { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
export function IconCpu(p: P)         { return <svg viewBox="0 0 24 24" {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M9 4V2M15 4V2M9 22v-2M15 22v-2M4 9H2M4 15H2M22 9h-2M22 15h-2"/></svg>; }
export function IconLayers(p: P)      { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m2 12 8.58 3.91a2 2 0 0 0 1.66 0L20.8 12"/><path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L20.8 17"/></svg>; }
export function IconLogOut(p: P)      { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
export function IconArrow(p: P)       { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>; }
export function IconSparkles(p: P)    { return <svg viewBox="0 0 24 24" {...base} {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>; }
