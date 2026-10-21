import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const OWNERS: Record<string,{name:string;lane:string}> = {
  'jessegaethle10@gmail.com': { name:'Jesse Gaethle', lane:'Technical / Product Operations' },
  'paola.verjan@gmail.com': { name:'Paola Verjan', lane:'Commercial / Project Operations' },
  'daryl.wright0811@gmail.com': { name:'Daryl Wright', lane:'Sales / Business Development' },
  'mckaylastucker@gmail.com': { name:'McKayla Stucker', lane:'Brand / Design / Web' },
  'by_romas@icloud.com': { name:'Roman Kilinkaridis', lane:'Owner' },
  'jochoa5111@gmail.com': { name:'Jess Ochoa', lane:'Owner' },
};

function clean(v: unknown){ return String(v ?? '').trim(); }

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ ok:false, error:'POST required' }, { status:405 });
    const base44 = createClientFromRequest(req);
    const user:any = await base44.auth.me().catch(() => null);
    if (!user?.id || !user?.email) return Response.json({ ok:false, allowed:false, error:'Authentication required' }, { status:401 });

    const email = clean(user.email).toLowerCase();
    const owner = OWNERS[email];
    if (!owner) {
      return Response.json({ ok:true, allowed:false, email }, { status:403 });
    }

    await base44.asServiceRole.entities.User.update(user.id, {
      rivet_owner: true,
      rivet_owner_name: owner.name,
      rivet_lane: owner.lane,
    });

    return Response.json({ ok:true, allowed:true, email, name:owner.name, lane:owner.lane });
  } catch (e) {
    console.error('RIVET owner access check failed', e);
    return Response.json({ ok:false, allowed:false, error:'RIVET could not verify owner access right now.' }, { status:500 });
  }
});