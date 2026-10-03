// PF product groups, in the same order as PF's Danish navigation.
export const productGroups = [
 {id:'toj',code:'mc2',name:'Tekstil'},
 {id:'tasker',code:'mc3',name:'Tasker'},
 {id:'flasker',code:'mc4',name:'Drikkeartikler'},
 {id:'kontor',code:'mc5',name:'Kuglepenne og skriveartikler'},
 {id:'elektronik',code:'mc7',name:'Teknologi'},
 {id:'papir',code:'mc6',name:'Notesbøger og papir'},
 {id:'paraplyer',code:'mc8',name:'Paraplyer'},
 {id:'hjem',code:'mc9',name:'Hjem og livsstil'},
 {id:'giveaways',code:'mc10',name:'Messe'},
 {id:'sport',code:'mc11',name:'Sport og fritid'},
 {id:'spil',code:'mc12',name:'Spil og legetøj'},
 {id:'vaerktoj',code:'mc13',name:'Værktøj og biltilbehør'},
 {id:'sundhed',code:'mc14',name:'Sundhed og personlig pleje'}
];
export function supplierProductGroup(code){return productGroups.find(group=>group.code===code);}
export function groupSections(group,products){
 const categories=new Map();
 for(const product of products)if(product.shopCategory===group.id&&product.category)categories.set(product.category,(categories.get(product.category)||0)+1);
 const items=[...categories].sort(([a],[b])=>a.localeCompare(b,'da')).map(([name,count])=>({name,count}));
 return items.length?[{name:'Produktkategorier',items}]:[];
}
export function groupLeaves(group,products){return groupSections(group,products).flatMap(section=>section.items);}
export function productGroupURL(groupId,subcategory){
 const params=new URLSearchParams({kategori:groupId});if(subcategory)params.set('underkategori',subcategory);
 return `/produkter?${params}`;
}
