// Curated direction chosen by the owner, not a live product or reseller feed.
// PF Concept's public brand navigation and the owner's screenshot identify these names.
const source='https://www.pfconcept.com/en_nl/?l=EN&p=brands';
export const brands=[
 {id:'thule',name:'Thule',group:'Tasker og rejse',focus:'Tasker til arbejde og rejse',description:'Et oplagt brand at prioritere til computertasker, rygsække og rejseudstyr i det kommende sortiment.',featured:true},
 {id:'herschel',name:'Herschel',group:'Tasker og rejse',focus:'Rygsække med et afslappet udtryk',description:'Et udvalgt brand til tasker og rygsække, der kan indgå i medarbejdergaver og et mere personligt merch-sortiment.',featured:true},
 {id:'stanley-1913',name:'Stanley 1913',group:'Flasker og krus',focus:'Termoflasker og drikkekrus',description:'Et af de brands, vi vil bygge drikkegrejssortimentet omkring. Konkrete modeller og mulighed for logo skal bekræftes.',featured:true},
 {id:'hydro-flask',name:'Hydro Flask',group:'Flasker og krus',focus:'Drikkeflasker til hverdag og fritid',description:'Udvalgt til et sortiment af termoflasker og krus. Farver, modeller og logomuligheder tilføjes, når leverandørdata er klar.',featured:true,source:'https://www.pfconcept.com/en_nl/hydro-flask-standard-mouth-621-ml-insulated-stainless-steel-water-bottle-100990.html'},
 {id:'moleskine',name:'Moleskine',group:'Kontor og gaver',focus:'Notesbøger til idéer og hverdagen',description:'Et centralt valg til notesbøger, onboarding og firmagaver. Det endelige udvalg af formater og dekoration fastlægges senere.',featured:true},
 {id:'parker',name:'Parker',group:'Kontor og gaver',focus:'Skriveredskaber med et klassisk udtryk',description:'Udvalgt til penne og gaver, hvor et enkelt og klassisk udtryk er i fokus. Modeller og gravering afklares med leverandøren.',featured:true},
 {id:'camelbak',name:'CamelBak',group:'Flasker og krus',focus:'Drikkegrej til en aktiv hverdag',description:'Et supplerende brand til drikkeflasker og krus i det kommende udvalg.'},
 {id:'waterman',name:'Waterman',group:'Kontor og gaver',focus:'Penne til den særlige anledning',description:'Et prioriteret navn til mere eksklusive skriveredskaber og firmagaver.'},
 {id:'ocean-bottle',name:'Ocean Bottle',group:'Flasker og krus',focus:'Et alternativ i flaskesortimentet',description:'Udvalgt som et alternativ til de øvrige flaskebrands. Produktpåstande og eventuelle certificeringer tilføjes kun med dokumentation.'},
 {id:'karst',name:'Karst',group:'Kontor og gaver',focus:'Notesbøger og skrivebord',description:'Et udvalgt navn til et mere designorienteret kontor- og gavesortiment.'},
 {id:'larq',name:'LARQ',group:'Flasker og krus',focus:'Drikkeflasker med fokus på design',description:'Et brand, vi ønsker at undersøge til den øvre del af flaskesortimentet. Specifikke funktioner afhænger af modellen.'},
 {id:'miir',name:'MiiR',group:'Flasker og krus',focus:'Flasker og krus i et enkelt design',description:'Et udvalgt supplement til premium-drikkegrej. De konkrete produkter og muligheder for logo afklares før salg.'},
 {id:'citizen-green',name:'Citizen Green',group:'Tasker og rejse',focus:'Ansvarlige hverdagsprodukter og tasker',description:'Et udvalg af hverdagsprodukter med fokus på mere ansvarlige materialer og et enkelt udtryk.'},
 {id:'elevate',name:'Elevate',group:'Tøj og tekstiler',focus:'Caps og hovedbeklædning',description:'Et bredt udvalg af caps til teams, events og virksomheder, samlet med de tilgængelige farver og trykmuligheder.',logo:null}
].map(b=>({...b,source:b.source||source,logo:b.logo===null?null:`/assets/brands/${b.id}.${['miir','hydro-flask','citizen-green'].includes(b.id)?'svg':'png'}`,status:'planned',connected:false}));
