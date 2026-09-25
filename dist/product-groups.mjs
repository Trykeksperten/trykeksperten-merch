// Editorial navigation. PF's product category remains the source of truth for
// each leaf, and the shop category keeps mutually exclusive groups separate.
export const productGroups = [
 {id:'toj',name:'Tøj og tekstiler',sections:[
  {name:'Toppe',items:['T-shirts','Poloer','Skjorte']},
  {name:'Sweat og lag',items:['Sweatshirts','Hættetrøjer','Fleece']},
  {name:'Overtøj og arbejde',items:['Jakker','Veste','Arbejdstøj','Shorts & bukser']}
 ]},
 {id:'caps',name:'Caps og huer',sections:[{name:'Hovedbeklædning',items:['Caps & hatte','Huer']}]},
 {id:'tasker',name:'Tasker og rejse',sections:[
  {name:'Rygsække',items:['Rygsække','Laptop rygsække','Snøretasker']},
  {name:'Tasker',items:['Muleposer','Konferencetasker','Computer & tablet tasker','Messenger og skuldertasker','Sports & gymnastiktasker','Køletasker']},
  {name:'Rejse',items:['Rejsetasker','Trolleyer og kufferter','Toilettasker','Rejsetilbehør']}
 ]},
 {id:'bomuldstasker',name:'Bomuldstasker',sections:[{name:'Bomuld og stof',items:['Bomuldstasker','Muleposer','Snøretasker','Køletasker']}]},
 {id:'flasker',name:'Flasker og krus',sections:[
  {name:'Flasker',items:['Vandflasker','Sportsflasker','Isoleret flasker','Shaker flasker']},
  {name:'Krus og glas',items:['Standard krus','Isoleret krus','Rejse krus','Krus','Glas','Glas og karafler']}
 ]},
 {id:'elektronik',name:'Teknologi',sections:[
  {name:'Opladning',items:['Powerbanks','Opladere','Trådløs oplader','Kabler']},
  {name:'Lyd og data',items:['Højtalere','Høretelefoner','In Ear høretelefoner','USB stik','USB hubs','Computertilbehør']},
  {name:'Telefon og tablet',items:['Stander og holdere','Tilbehør til telefon og tablet']}
 ]},
 {id:'kontor',name:'Kontor og gaver',sections:[
  {name:'Skriveartikler',items:['Kuglepenne','Fyldepenne','Rollerballpenne','Pennesæt','Blyanter','Markeringspenne']},
  {name:'Notesbøger og papir',items:['Notesbøger med hard cover','Notesbøger med soft cover','Sticky notes','Skriveblokke','Kalender','Dokument mapper']},
  {name:'Små gaver',items:['Nøgleringe','Lanyard','Badgeholdere','Stressbolde','Personlig pleje','Farvesæt/Malesæt']}
 ]},
 {id:'hjem',name:'Hjem og køkken',sections:[
  {name:'Køkken',items:['Forklæder','Køkkengrej','Skærebræt og sæt','Oplukker og tilbehør','Vintilbehør']},
  {name:'Hjem og værktøj',items:['Tilbehør til hjemmet','Tæpper','Lygter','Multiværktøjer','Værktøjssæt','Målebånd']}
 ]},
 {id:'sport',name:'Sport og fritid',sections:[
  {name:'Sport',items:['Fitness- og sportstilbehør','Håndklæder','Cykeltilbehør']},
  {name:'Fritid',items:['Udendørs artikler','Strandartikler','Solbriller','Grilltilbehør','Udendørsspil']}
 ]},
 {id:'paraplyer',name:'Paraplyer',sections:[{name:'Til al slags vejr',items:['Standard paraplyer','Golfparaplyer','Stormparaplyer','Regnponchoer']}]}
];

export function groupSections(group,products){
 const categories=new Map();
 for(const product of products)if(product.shopCategory===group.id&&product.category)categories.set(product.category,(categories.get(product.category)||0)+1);
 return group.sections.map(section=>({name:section.name,items:section.items.filter(name=>categories.has(name)).map(name=>({name,count:categories.get(name)}))})).filter(section=>section.items.length);
}

export function groupLeaves(group,products){return groupSections(group,products).flatMap(section=>section.items);}

export function productGroupURL(groupId,subcategory){
 const params=new URLSearchParams({kategori:groupId});
 if(subcategory)params.set('underkategori',subcategory);
 return `/produkter?${params}`;
}
