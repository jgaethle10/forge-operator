import type { EvidenceState } from './visual-stage.js';

export interface VisualThemePalette {
  background:string;
  surface:string;
  surfaceRaised:string;
  textPrimary:string;
  textSecondary:string;
  titanium:string;
  accentGold:string;
  accentIce:string;
  grid:string;
  routeObserved:string;
  routeModeled:string;
  point:string;
  timelineRail:string;
  timelinePlayhead:string;
}

export interface VisualTheme {
  schema:'evercraft.fallen.visual-theme.v1';
  id:string;
  fontFamily:string;
  displayFontFamily?:string;
  palette:VisualThemePalette;
  evidence:Record<EvidenceState,string>;
}

export const EVERCRAFT_VISUAL_THEME_V1:VisualTheme={
  schema:'evercraft.fallen.visual-theme.v1',
  id:'evercraft-core-v1',
  fontFamily:'Montserrat, Arial, sans-serif',
  displayFontFamily:'Montserrat, Arial, sans-serif',
  palette:{
    background:'#080B0B',
    surface:'#111719',
    surfaceRaised:'#182024',
    textPrimary:'#F5F5F2',
    textSecondary:'#B7BDC5',
    titanium:'#B7BDC5',
    accentGold:'#B79A56',
    accentIce:'#4FB8FF',
    grid:'rgba(183,189,197,.14)',
    routeObserved:'#4FB8FF',
    routeModeled:'#B79A56',
    point:'#F5F5F2',
    timelineRail:'rgba(183,189,197,.28)',
    timelinePlayhead:'#4FB8FF'
  },
  evidence:{
    observed:'#F5F5F2',
    public_source:'#4FB8FF',
    licensed:'#B7BDC5',
    modeled:'#B79A56',
    inferred:'#B79A56',
    synthetic_visualization:'#B79A56'
  }
};

export const NEUTRAL_VISUAL_THEME:VisualTheme={
  schema:'evercraft.fallen.visual-theme.v1',
  id:'fallen-neutral-v1',
  fontFamily:'Arial, sans-serif',
  palette:{
    background:'#080b0b',
    surface:'#111719',
    surfaceRaised:'#1a2024',
    textPrimary:'#ffffff',
    textSecondary:'#b9bec3',
    titanium:'#b9bec3',
    accentGold:'#d0a85c',
    accentIce:'#65bfff',
    grid:'rgba(255,255,255,.08)',
    routeObserved:'rgba(255,255,255,.9)',
    routeModeled:'#d0a85c',
    point:'#ffffff',
    timelineRail:'rgba(255,255,255,.28)',
    timelinePlayhead:'#ffffff'
  },
  evidence:{
    observed:'#ffffff',
    public_source:'#65bfff',
    licensed:'#b9bec3',
    modeled:'#d0a85c',
    inferred:'#d0a85c',
    synthetic_visualization:'#d0a85c'
  }
};

export function resolveVisualTheme(theme:VisualTheme|undefined){
  return theme??NEUTRAL_VISUAL_THEME;
}
