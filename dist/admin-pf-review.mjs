const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function appendPFReview(container,checkout){
 const review=checkout?.pfReview;if(!review?.required)return;
 if(review.approved){container.append(el('small',`Gennemgået af ${review.approvedBy||'Smerch'}${review.approvedAt?' · '+new Date(review.approvedAt).toLocaleString('da-DK'):''}`));if(checkout.pfHandoff?.status==='submitted')return;}
 if(!review.approved)container.append(el('p','Afventer Smerchs godkendelse · privatordre uden tryk over 5.000 kr. inkl. moms, ekskl. fragt.'));
 if(Number.isSafeInteger(review.goodsTotalIncVat))container.append(el('p','Varer inkl. moms, ekskl. fragt: '+(review.goodsTotalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'})));
 const details=el('details');details.append(el('summary','Gennemgå kunde og levering'));const s=checkout.shipping||{};
 details.append(el('p',[s.name,s.company,s.street,s.street2,[s.postalCode,s.city].filter(Boolean).join(' '),s.country,s.deliveryComment].filter(Boolean).join(' · ')));
 for(const [prefix,value] of [['mailto:',s.email],['tel:',s.phone]])if(value){const p=el('p'),a=el('a',value);a.href=prefix+value;p.append(a);details.append(p);}
 const button=el('button',review.approved?'Send godkendt ordre til PF':'Godkend og send til PF'),feedback=el('p');button.type='button';button.className='action';button.disabled=checkout.status!=='authorized'&&!(checkout.paymentProvider==='bank_transfer'&&checkout.status==='paid');
 button.onclick=async()=>{if(!confirm('Jeg har gennemgået privatordren uden tryk og godkender, at den sendes til PF.'))return;button.disabled=true;feedback.textContent='Sender godkendelsen…';try{const response=await fetch('/api/admin/checkouts/'+encodeURIComponent(checkout.id)+(review.approved?'/retry-handoff':'/approve-handoff'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Smerch-Admin':'1'},body:JSON.stringify({confirmed:true,reviewKey:review.key})}),result=await response.json();if(!response.ok)throw Error(result.error||'Godkendelsen kunne ikke gemmes.');if(result.pfHandoff?.status!=='submitted')throw Error(result.pfHandoff?.reason||'Godkendelsen er gemt, men PF-afsendelsen skal afklares.');location.reload();}catch(error){feedback.textContent=error.message;}};
 container.append(details,button,feedback);
}
