// Evercraft Economic Pressure Atlas public pilot.
// No API calls, storage, trackers, payments or submitted personal information.
export const RESOURCES = Object.freeze([
  {id:"basic-food",title:"Apply or ask about Washington Basic Food",roles:["household","worker","farmer"],pressures:["food","income"],source:"Washington DSHS",href:"https://www.dshs.wa.gov/family-food-and-housing-services/food-assistance/basic-food-benefits",description:"Washington's SNAP food assistance may supplement a qualifying household's grocery budget. DSHS determines eligibility and benefit amounts after application and review. The 2026 SNAP/LIHEAP utility rule may affect some households. Ask DSHS about your situation."},
  {id:"liheap",title:"Explore energy-bill assistance",roles:["household","worker","farmer"],pressures:["utilities","income"],source:"WA Department of Commerce",href:"https://www.commerce.wa.gov/community-opportunities/liheap/",description:"Find your county's LIHEAP provider and schedule an application appointment. Funding, income limits and award amounts vary. For households also receiving Basic Food, review the 2026 utility-deduction changes with DSHS."},
  {id:"wa211",title:"Locate food, housing, transportation and emergency resources",roles:["household","worker","farmer","business"],pressures:["food","housing","utilities","income","business"],source:"Washington 211",href:"https://search.wa211.org/",description:"Search a location-based service directory. Provider hours, eligibility and availability are not independently confirmed."},
  {id:"unemployment",title:"Check Washington unemployment options",roles:["worker","household"],pressures:["income"],source:"WA Employment Security",href:"https://esd.wa.gov/get-financial-help/unemployment-benefits/applying-unemployment-benefits/how-apply-unemployment-benefits",description:"If your work or hours have changed, consult the state for current eligibility and application rules. A referral is not an approved benefit."},
  {id:"sharedwork",title:"Consider SharedWork before layoffs",roles:["business"],pressures:["business","income"],source:"WA Employment Security",href:"https://esd.wa.gov/get-financial-help/sharedwork-program/rules-and-information-sharedwork-employers",description:"Qualifying Washington employers can apply to reduce enrolled employees' hours instead of layoffs. Requires an approved plan, at least two participating employees and other conditions."},
  {id:"sbdc",title:"Speak to a Yakima small-business advisor",roles:["business","farmer"],pressures:["business","income"],source:"Washington SBDC",href:"https://wsbdc.org/advisor-location/yakima/",description:"Get local advising on operations, cash-flow decisions and strategy. Contact the Yakima office to confirm appointments and services."},
  {id:"fsa",title:"Review agricultural assistance and loan programs",roles:["farmer"],pressures:["business","income"],source:"USDA Farm Service Agency",href:"https://www.fsa.usda.gov/state-offices/washington",description:"Explore farm loans, conservation and disaster support. Program criteria, county designations, dates and availability require separate verification."}
]);
export function matchResources(role, pressure, resources=RESOURCES) {
  const direct=resources.filter(item => item.roles.includes(role) && item.pressures.includes(pressure));
  if(direct.length)return direct;
  return resources.filter(item=>item.roles.includes(role)).slice(0,3);
}
export function costDelta(units, oldPrice, newPrice) {
  if([units,oldPrice,newPrice].some(value=>String(value??"").trim()===""))return null;
  const values=[units,oldPrice,newPrice].map(Number);
  if(values.some(v=>!Number.isFinite(v)||v<0||v>1e12))return null;
  const amount=values[0]*(values[2]-values[1]);
  return Number.isFinite(amount)&&Math.abs(amount)<=1e15?amount:null;
}
export function initAtlas(doc = document) {
  const roles=doc.getElementById("roles"),pressures=doc.getElementById("pressures"),target=doc.getElementById("referrals");
  const inputs=["units","before","after"].map(id=>doc.getElementById(id));
  if(!roles||!pressures||!target||inputs.some(v=>!v))return false;
  let role="household", pressure="income";
  const create=(name,className,contents)=>{
    const el=doc.createElement(name);if(className)el.className=className;
    if(contents!==undefined)el.textContent=contents;
    return el;
  };
  const render=()=>{
    target.replaceChildren();
    const visible=matchResources(role,pressure);
    for(const r of visible){
      const article=create("article","referral");const title=create("h4","",r.title);
      const flag=create("span","flag","Eligibility unconfirmed");title.appendChild(flag);
      article.appendChild(title);article.appendChild(create("p","",r.description));
      const link=create("a","",r.source+" ↗");link.href=r.href;link.target="_blank";link.rel="noopener noreferrer";
      article.appendChild(link);target.appendChild(article);
    }
    if(!visible.length) target.appendChild(create("p","","No match in this reviewed directory. Search Washington 211."));
  };
  const choose=(parent,selector,key,value)=>{
    for(const b of parent.querySelectorAll(selector))b.setAttribute("aria-pressed",String(b.dataset[key]===value));
  };
  roles.addEventListener("click",event=>{
    const btn=event.target.closest("button[data-role]");if(!btn||!roles.contains(btn))return;
    role=btn.dataset.role;choose(roles,"button[data-role]","role",role);render();
  });
  pressures.addEventListener("click",event=>{
    const btn=event.target.closest("button[data-pressure]");if(!btn||!pressures.contains(btn))return;
    pressure=btn.dataset.pressure;choose(pressures,"button[data-pressure]","pressure",pressure);render();
  });
  const amount=doc.getElementById("amount"),explanation=doc.getElementById("explanation");
  const format=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Math.abs(n));
  const calculate=()=>{
    const [units,before,after]=inputs.map(i=>i.value);
    const delta=costDelta(units,before,after);
    if(delta===null){
      amount.textContent="Enter your prices";
      explanation.textContent="Three nonnegative, finite numbers are required. Calculated only in this browser tab.";
      return;
    }
    amount.textContent=(delta<0?"−":delta>0?"+":"")+format(delta)+" / month";
    explanation.textContent=delta>0?"Estimated added monthly cost at the same usage.":delta<0?"Estimated monthly cost decrease at the same usage.":"No price-driven cost change at the entered usage level.";
  };
  for(const input of inputs)input.addEventListener("input",calculate);
  render();calculate();return true;
}
if(typeof document!=="undefined")initAtlas(document);
