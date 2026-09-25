export function logoPreflight({type,pixelWidth=0,pixelHeight=0,widthMm=0,heightMm=0,hasText=false}={}){
 const width=Number(widthMm),height=Number(heightMm);
 if(hasText&&!type)return {status:'approved',label:'Godkendt',dpi:null,checks:['Teksten oprettes som en skarp produktionsfil.']};
 if(!type)return {status:'missing',label:'Mangler design',dpi:null,checks:['Upload et logo eller skriv en tekst.']};
 if(['application/pdf','application/postscript','application/illustrator','application/vnd.corel-draw'].includes(type))return {status:'review',label:'Kræver filkontrol',dpi:null,checks:['Vektorfilen er modtaget. Kurver, skrifter, farver og fine detaljer kontrolleres i korrekturen.']};
 if(type==='image/svg+xml')return {status:'review',label:'Kræver filkontrol',dpi:null,checks:['SVG-filen er skalerbar. Skrifter, farver og fine detaljer kontrolleres i korrekturen.']};
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||pixelWidth<=0||pixelHeight<=0)return {status:'rejected',label:'Kan ikke godkendes',dpi:null,checks:['Billedets opløsning eller ønskede trykstørrelse kan ikke aflæses.']};
 const dpi=Math.floor(Math.min(pixelWidth/(width/25.4),pixelHeight/(height/25.4)));
 if(dpi<150)return {status:'rejected',label:'Kan ikke godkendes',dpi,checks:[`Opløsningen er cirka ${dpi} DPI ved den valgte størrelse. Mindst 150 DPI er nødvendigt.`]};
 if(dpi<300)return {status:'review',label:'Kræver filkontrol',dpi,checks:[`Opløsningen er cirka ${dpi} DPI. 300 DPI anbefales til et skarpt resultat.`,'Fine linjer og afstand mellem bogstaver kontrolleres manuelt.']};
 return {status:'approved',label:'Teknisk godkendt',dpi,checks:[`Opløsningen er cirka ${dpi} DPI ved den valgte størrelse.`,'Filtype, størrelse og opløsning er godkendt. Fine linjer og bogstavafstand kontrolleres igen i korrekturen.']};
}
