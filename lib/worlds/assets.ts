/** Identical source assets are used by hosting and the portable offline edition. */
declare const __WORLDS_ASSETS__: Record<string, string> | undefined;
// The portable file installs this dictionary before the game module runs.
// Hosted builds leave it absent and load the exact same files independently.
const embeddedAssets = typeof __WORLDS_ASSETS__ === 'undefined' ? undefined : __WORLDS_ASSETS__;

export function getWorldAsset(file: string): string {
  const clean = file.replace(/^\/+/, '');
  if (embeddedAssets?.[clean]) {
    return embeddedAssets[clean];
  }
  // Keep server and client markup identical. The browser resolves this path
  // against its base URL; the portable edition uses the embedded dictionary.
  return clean;
}

export const WORLD_IDENTITIES = [
  {id:'boucles', number:'I', name:'Les Boucles', material:'L’encre s’éveille',
    promise:'Un peu d’encre. Beaucoup d’entraide.', description:'Répartis la troupe, trouve le bon équilibre et invente un passage.',
    color:'#182f58', paper:'#f4e6cb', accent:'#d67050', asset:'worlds/boucles-art.png'},
  {id:'plis', number:'II', name:'Petits Plis', material:'Le papier prend vie',
    promise:'Le vent a plus d’un tour dans ses plis.', description:'Apprivoise le souffle du moulin pour guider tes petits compagnons.',
    color:'#513f32', paper:'#ece0cc', accent:'#b56e46', asset:'worlds/plis-art.png'},
  {id:'veilleurs', number:'III', name:'Les Veilleurs', material:'L’atelier s’illumine',
    promise:'Douze petites lumières attendent ta main.', description:'Accorde les mécanismes, observe leur rythme et éclaire le chemin.',
    color:'#f4dfb4', paper:'#1b1820', accent:'#e7ba6c', asset:'worlds/veilleurs-art.png'},
] as const;

export type WorldIdentity = typeof WORLD_IDENTITIES[number];
