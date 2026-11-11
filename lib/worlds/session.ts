export const SESSION_KEY='mondes-du-trait-v2';
export const SHORTCUTS=[
  {id:'pause',label:'Lancer / mettre en pause'},
  {id:'draw',label:'Afficher les appuis du dessin'},
  {id:'undo',label:'Annuler le dernier geste'},
  {id:'speed',label:'Changer la vitesse'},
  {id:'hint',label:'Ouvrir les indices'},
] as const;
export type ShortcutId=typeof SHORTCUTS[number]['id'];
export type ShortcutBindings=Record<ShortcutId,[string|null,string|null]>;
export const defaultBindings=():ShortcutBindings=>({pause:[' ','p'],draw:['d','c'],undo:['z','Backspace'],speed:['f','x'],hint:['h','?']});
export const normalizedKey=(key:string)=>key.length===1?key.toLowerCase():key;
export function keyLabel(key:string|null):string {
  if(!key)return '—';
  return ({' ':'Espace',Backspace:'Retour',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Enter:'Entrée',Delete:'Suppr'} as Record<string,string>)[key]??(key.length===1?key.toUpperCase():key);
}
export function readBindings(raw:unknown):ShortcutBindings {
  const bindings=defaultBindings();
  if(!raw||typeof raw!=='object')return bindings;
  const object=raw as Record<string,unknown>;
  const occupied=new Set<string>();
  for(const {id}of SHORTCUTS){
    const value=object[id];
    if(Array.isArray(value)&&value.length===2){
      bindings[id]=value.map(key=>typeof key==='string'&&key.length>0&&key.length<24&&!['Escape','Tab','Control','Alt','Meta','Shift'].includes(key)?normalizedKey(key):null) as [string|null,string|null];
    }
    bindings[id]=bindings[id].map(key=>{if(!key||occupied.has(key))return null;occupied.add(key);return key;}) as [string|null,string|null];
  }
  return bindings;
}
