import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConsensus,
  categoriesForObjective,
  commonGroundHealth,
  normalizeCommonGroundRequest,
  queryQlooProfile,
  runCommonGroundAgent,
} from "./agent.mjs";

function fakeFetch(payloads=[]){
  const calls=[];
  let index=0;
  const fn=async(url,options={})=>{
    calls.push({
      url:String(url),
      method:options.method,
      headers:options.headers,
      body:JSON.parse(options.body||"{}"),
    });
    const payload=payloads[index++]||{success:true,results:{entities:[]}};
    return {
      ok:true,
      status:200,
      async text(){return JSON.stringify(payload);},
    };
  };
  fn.calls=calls;
  return fn;
}

test("objective selects useful cross-domain categories",()=>{
  assert.deepEqual(categoriesForObjective("date night in Seattle"),["place","movie","artist"]);
  assert.deepEqual(categoriesForObjective("weekend trip"),["destination","place","artist"]);
});

test("request normalization is bounded and privacy-safe",()=>{
  const request=normalizeCommonGroundRequest({
    profiles:[
      {label:"A",interests:["Brian Eno","Studio Ghibli"]},
      {label:"B",interests:["Wes Anderson"]},
    ],
    objective:"date night",
    location:"Seattle, WA",
    price_level_max:3,
  });
  assert.equal(request.profiles.length,2);
  assert.equal(request.categories.length,3);
  assert.equal(request.price_level_max,3);
  assert.throws(()=>normalizeCommonGroundRequest({profiles:[{interests:["x"]}]}),/at_least_two_profiles_required/);
});

test("Qloo call keeps the key server-side and requests explainability",async()=>{
  const fetchImpl=fakeFetch([{
    success:true,
    results:{entities:[{
      entity_id:"place-1",
      name:"Common Place",
      type:"urn:entity:place",
      query:{affinity:0.91,explainability:{seed:"Brian Eno"}},
    }]},
  }]);
  const result=await queryQlooProfile({
    interests:["Brian Eno","Studio Ghibli"],
    category:"place",
    location:"Seattle",
    priceLevelMax:3,
    take:5,
  },{
    fetchImpl,
    apiKey:"secret-qloo-key",
    baseUrl:"https://hackathon.api.qloo.com/v2",
  });
  assert.equal(result.entities[0].name,"Common Place");
  assert.equal(fetchImpl.calls.length,1);
  const call=fetchImpl.calls[0];
  assert.equal(call.headers["x-api-key"],"secret-qloo-key");
  assert.equal(call.body["filter.type"],"urn:entity:place");
  assert.deepEqual(call.body["signal.interests.entities.query"],["Brian Eno","Studio Ghibli"]);
  assert.equal(call.body["filter.location.query"],"Seattle");
  assert.equal(call.body["filter.price_level.max"],3);
  assert.equal(call.body["feature.explainability"],true);
});

test("consensus rewards recommendations shared across profiles",()=>{
  const rows=[
    {profile_id:"profile-1",entities:[
      {entity_id:"shared",name:"Shared",rank:2,affinity:0.8,properties:{}},
      {entity_id:"solo-a",name:"Solo A",rank:1,affinity:0.95,properties:{}},
    ]},
    {profile_id:"profile-2",entities:[
      {entity_id:"shared",name:"Shared",rank:1,affinity:0.9,properties:{}},
      {entity_id:"solo-b",name:"Solo B",rank:2,affinity:0.8,properties:{}},
    ]},
  ];
  const result=buildConsensus(rows,2);
  assert.equal(result[0].entity_id,"shared");
  assert.equal(result[0].coverage,1);
  assert.equal(result.find((x)=>x.entity_id==="solo-a").coverage,0.5);
});

test("agent queries every profile and returns a bounded group plan",async()=>{
  const payloads=[
    {success:true,results:{entities:[
      {entity_id:"p-shared",name:"Shared Place",type:"urn:entity:place",query:{affinity:0.88}},
      {entity_id:"p-a",name:"A Place",type:"urn:entity:place",query:{affinity:0.95}},
    ]}},
    {success:true,results:{entities:[
      {entity_id:"p-shared",name:"Shared Place",type:"urn:entity:place",query:{affinity:0.9}},
      {entity_id:"p-b",name:"B Place",type:"urn:entity:place",query:{affinity:0.97}},
    ]}},
  ];
  const fetchImpl=fakeFetch(payloads);
  const result=await runCommonGroundAgent({
    profiles:[
      {label:"Alex",interests:["Studio Ghibli"]},
      {label:"Sam",interests:["Wes Anderson"]},
    ],
    categories:["place"],
    location:"Seattle",
  },{fetchImpl,apiKey:"test-key"});
  assert.equal(fetchImpl.calls.length,2);
  assert.equal(result.results[0].top_pick.entity_id,"p-shared");
  assert.equal(result.plan[0].pick.name,"Shared Place");
  assert.equal(result.privacy.profile_names_sent_to_qloo,false);
  assert.equal(result.authority.payment_authority,false);
  assert.match(result.receipt_hash,/^sha256:/);
  assert.equal(JSON.stringify(result).includes("test-key"),false);
});

test("health never exposes credential material",()=>{
  const health=commonGroundHealth({apiKey:"super-secret",baseUrl:"https://example.test/v2"});
  assert.equal(health.qloo_configured,true);
  assert.equal(JSON.stringify(health).includes("super-secret"),false);
});
