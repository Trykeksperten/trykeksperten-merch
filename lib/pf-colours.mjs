// PF Technical Support, Thomas, 22 October 2026. Method names come from
// the validated catalogue selection, never from a customer-supplied override.
export function pfColourPolicy(design){
 const method=String(design.method||'').trim().toLowerCase();
 if(/^(laser engraving|lasergravering|gravering|engraving)(\b|$)/.test(method))return {kind:'fixed',code:'Laser Engraving'};
 if(/^(debossing|prægning)(\b|$)/.test(method))return {kind:'fixed',code:'Debossing'};
 if(/^(digital|digitaltryk(?: skinnende)?|digital print|digital printing)$/.test(method))return {kind:'fixed',code:'Full Color'};
 const screen=/^(screenprint|screen print|screen printing|screenround|screen round|serigrafi|rundtryk)(\b|$)/.test(method);
 if(screen||/^(padprint|pad print|pad printing|tampontryk|transfer)(\b|$)/.test(method))return {kind:'pantone',screen};
 return {kind:'manual'};
}
export function pfColourCodes(design,codes){
 const policy=pfColourPolicy(design);
 if(policy.kind==='fixed')return [policy.code];
 if(!Array.isArray(codes)||codes.length!==Number(design.colors)||codes.some(code=>typeof code!=='string'||!code.trim()||!/^[A-Za-z0-9 #.-]{1,40}$/.test(code.trim())))throw Error('PF-farvekoder skal matche trykfarver: angiv én gyldig kode pr. farve.');
 const result=codes.map(code=>code.trim().replace(/^PANTONE\s+/i,'').replace(/\s+/g,' '));
 if(policy.kind==='pantone'){
  // Format check only: the operator must confirm membership in Solid Coated
  // against the customer's artwork; RGB values are never converted by guessing.
  if(result.some(code=>! /^(?:[0-9]{3,4}|[A-Za-z]+(?: [A-Za-z]+)*(?: [0-9]{2,4})?)\s*C$/i.test(code)))throw Error('Angiv bekræftede PANTONE Solid Coated-farver (C), én pr. trykfarve.');
  if(policy.screen&&result.some(code=>/^87[1-7]\s*C$/i.test(code)))throw Error('PF accepterer ikke metallic 871 C–877 C til serigrafi/rundtryk. Vælg en afklaret alternativ farve eller trykmetode.');
 }
 return result;
}
