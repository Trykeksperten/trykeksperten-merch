const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const kroner=value=>new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(value/100);
export function printExampleQuantity(minimum){return Math.max(100,Number.isInteger(minimum)&&minimum>0?minimum:1);}
export function productPriceIntro(quote,quantity,{example,exampleQuantity,option,mandatory=false}={}){
 if(!Number.isFinite(quote?.totalIncVat))return `<p class="small muted">${escape(quote?.error||quote?.message||'Vareprisen kunne ikke hentes.')}</p>`;
 const unit=kroner(Math.round(quote.totalIncVat/quantity));
 const colour=/full/i.test(String(option?.maxColours))?'Fuldfarve':/grav|laser|præg|emboss|deboss/i.test(option?.impMethod||'')?'':'1 farve';
 const sample=Number.isFinite(example?.totalIncVat)?`<div class="pf-price-example"><span>Priseksempel med dekoration</span><b>${kroner(Math.round(example.totalIncVat/exampleQuantity))} / stk.</b><small>Ved ${exampleQuantity} stk. · ${escape(option.impMethod)}${option.impLocation!==option.impMethod?' · '+escape(option.impLocation):''} · én placering${colour?' · '+colour:''}</small><small>Inkl. opstart og moms · ekskl. fragt. Eksempelprisen ændrer ikke dit antal.</small></div>`:option?'<div class="pf-price-example"><small>Priseksempel med dekoration afventer. Vælg tryk for at se mulighederne.</small></div>':'';
 return `<div><span>Varepris uden tryk</span><strong>${unit} / stk.</strong><small>Ved ${quantity} stk. · inkl. moms · ekskl. fragt</small>${mandatory?'<small>Dette produkt kræver dekoration, som lægges til prisen.</small>':''}</div>${sample}<div><span>Varetotal uden tryk</span><b>${kroner(quote.totalIncVat)}</b><small>Vælg tryk for at se din samlede pris.</small></div>`;
}
