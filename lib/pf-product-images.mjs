// Only packshots: main image, front, back and packaging. Exclude lifestyle,
// model, detail and extra images, which may show people or hands.
const packshotKeys=new Set(['imageMain','imageFront','imageBack','imagePackage']);
export function packshotImages(imageData={}){
 const excluded=new Set(Object.entries(imageData).filter(([key])=>/Model|Mood/i.test(key)).map(([,value])=>value).filter(Boolean));
 return [...new Set(Object.entries(imageData).filter(([key,value])=>packshotKeys.has(key)&&value&&!excluded.has(value)).map(([,value])=>`https://images.pfconcept.com/ProductImages_All/JPG/500x500/${encodeURIComponent(value)}`))];
}
export function filterStoredPackshots(product){
 return {...product,variants:product.variants.map(variant=>({...variant,images:(variant.images||[]).filter(url=>/\/[a-z0-9]+(?:_[FBP]\d+)?\.jpg$/i.test(url))}))};
}
