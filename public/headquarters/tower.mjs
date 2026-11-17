// Evercraft Headquarters / an enhancement, never a navigation dependency.
const floors=Object.freeze({
  engineering:Object.freeze({
    number:"04",kicker:"04 / ENGINEERING",title:"Tools that do useful work.",
    description:"From working software to connected operations, engineering is where we turn complicated problems into practical tools.",
    label:"Try a working tool",
    href:"https://jgaethle10.github.io/forge-operator/work-saban/report/"
  }),
  intelligence:Object.freeze({
    number:"03",kicker:"03 / INTELLIGENCE",title:"Evidence before assumptions.",
    description:"Explore research built around sources, uncertainty and clear questions. Start with a free scope, not a sales maze.",
    label:"Explore Research",
    href:"https://jgaethle10.github.io/forge-operator/research/"
  }),
  creative:Object.freeze({
    number:"02",kicker:"02 / CREATIVE",title:"Ideas you can step inside.",
    description:"Read original reporting, encounter new worlds and see how storytelling can help people explore what is possible.",
    label:"Read the Journal",
    href:"https://jgaethle10.github.io/forge-operator/journal/"
  }),
  services:Object.freeze({
    number:"01",kicker:"01 / SERVICES",title:"The work meets the world.",
    description:"Bring a specific challenge and find a bounded service, clear scope and a human way to start.",
    label:"Explore available offers",
    href:"https://fabric.systemiacommandcenters.com/offers"
  })
});
const buttons=[...document.querySelectorAll("[data-floor]")];
const index=document.getElementById("display-index");
const kicker=document.getElementById("floor-kicker");
const title=document.getElementById("floor-title");
const description=document.getElementById("floor-description");
const link=document.getElementById("floor-link");
function selectFloor(key){
  const floor=floors[key]; if(!floor||!index||!kicker||!title||!description||!link)return;
  for(const button of buttons){
    const active=button.dataset.floor===key;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  }
  index.textContent=floor.number;
  kicker.textContent=floor.kicker;
  title.textContent=floor.title;
  description.textContent=floor.description;
  link.textContent=floor.label+" ↗";
  link.href=floor.href;
}
for(const button of buttons){
  button.addEventListener("click",()=>selectFloor(button.dataset.floor));
  button.addEventListener("keydown",(event)=>{
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    const position=buttons.indexOf(button);
    let next=position;
    if(event.key==="Home")next=0;
    else if(event.key==="End")next=buttons.length-1;
    else next=(position+(["ArrowUp","ArrowLeft"].includes(event.key)?-1:1)+buttons.length)%buttons.length;
    event.preventDefault();buttons[next].focus();selectFloor(buttons[next].dataset.floor);
  });
}
