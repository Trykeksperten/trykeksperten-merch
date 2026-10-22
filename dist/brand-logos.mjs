// Shared by server-rendered headers, client catalogues and brand listings.
const vectorBrands=new Set(["boompods", "camelbak", "case-logic", "chipolo", "citizen-green", "elevate", "graid", "herschel", "hydro-flask", "journalbooks", "karst", "larq", "luxe", "marksman", "mepal", "miir", "moleskine", "ocean-bottle", "originalhome", "parker", "prixton", "rfx", "roly", "scx-design", "seasons", "skross", "stac", "stanley-1913", "tekio", "thule", "waterman", "wellmark", "xtorm", "zens"]);
export function brandLogoURL(brand){
 if(!brand||brand.id==='unbranded')return null;
 if(vectorBrands.has(brand.id))return `/assets/brands/${brand.id}.svg?v=3`;
 return brand.logo?.replace(/\.(png|svg)(?:\?.*)?$/,'.svg?v=2')||null;
}
