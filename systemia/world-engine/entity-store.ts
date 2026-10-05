import type { RuntimeEntity, WorldEntity } from './engine.js';

export type EntityComponentKey =
  | 'transform'
  | 'rigidBody'
  | 'collider'
  | 'behaviors'
  | 'animation'
  | 'navigationAgent'
  | 'renderable'
  | 'light'
  | 'camera'
  | 'audioEmitter'
  | 'audioListener'
  | 'assetRefs'
  | 'tags'
  | 'properties';

export interface EntityQuery {
  allTags?:string[];
  anyTags?:string[];
  components?:EntityComponentKey[];
}

function clone<T>(value:T):T{
  return structuredClone(value);
}

function hasComponent(entity:WorldEntity,key:EntityComponentKey){
  if(key==='transform') return Boolean(entity.transform);
  const value=(entity as Record<string,unknown>)[key];
  if(Array.isArray(value)) return value.length>0;
  return value!==undefined && value!==null;
}

export class WorldEntityStore<T extends WorldEntity=RuntimeEntity>{
  private readonly byId=new Map<string,T>();
  private readonly tagIndex=new Map<string,Set<string>>();
  private readonly componentIndex=new Map<EntityComponentKey,Set<string>>();

  constructor(entities:T[]){
    const ordered=[...entities].sort((a,b)=>a.id.localeCompare(b.id));
    for(const entity of ordered){
      if(!entity.id) throw new Error('entity_store_id_missing');
      if(this.byId.has(entity.id)) throw new Error(`entity_store_duplicate:${entity.id}`);
      this.byId.set(entity.id,entity);

      for(const tag of [...new Set(entity.tags || [])].sort()){
        if(!this.tagIndex.has(tag)) this.tagIndex.set(tag,new Set());
        this.tagIndex.get(tag)!.add(entity.id);
      }

      const keys:EntityComponentKey[]=[
        'transform','rigidBody','collider','behaviors','animation','navigationAgent','renderable','light','camera','audioEmitter','audioListener','assetRefs','tags','properties'
      ];
      for(const key of keys){
        if(!hasComponent(entity,key)) continue;
        if(!this.componentIndex.has(key)) this.componentIndex.set(key,new Set());
        this.componentIndex.get(key)!.add(entity.id);
      }
    }
  }

  ids(){
    return [...this.byId.keys()].sort();
  }

  has(id:string){
    return this.byId.has(id);
  }

  get(id:string){
    const entity=this.byId.get(id);
    return entity?clone(entity):null;
  }

  query(query:EntityQuery={}){
    const allTags=[...new Set(query.allTags || [])].sort();
    const anyTags=[...new Set(query.anyTags || [])].sort();
    const components=[...new Set(query.components || [])].sort();

    const matches:string[]=[];
    for(const id of this.ids()){
      const entity=this.byId.get(id)!;
      if(allTags.some(tag=>!entity.tags?.includes(tag))) continue;
      if(anyTags.length && !anyTags.some(tag=>entity.tags?.includes(tag))) continue;
      if(components.some(component=>!hasComponent(entity,component))) continue;
      matches.push(id);
    }
    return matches.map(id=>clone(this.byId.get(id)!));
  }

  idsForTag(tag:string){
    return [...(this.tagIndex.get(tag) || [])].sort();
  }

  idsForComponent(component:EntityComponentKey){
    return [...(this.componentIndex.get(component) || [])].sort();
  }
}
