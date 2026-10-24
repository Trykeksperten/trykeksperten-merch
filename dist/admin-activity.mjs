export function actorLabel(actor){
 if(!actor||!['staff','customer','system','supplier'].includes(actor.type))return 'Ikke registreret';
 const role={staff:'Smerch',customer:'Kunde',system:'Automatik',supplier:'PF'}[actor.type];
 const detail=[actor.name,actor.email].filter(value=>typeof value==='string'&&value.trim()).filter((value,i,values)=>values.indexOf(value)===i).join(' · ');
 return detail?role+' · '+detail:role;
}
export function proofActionLabel(kind){return {invitation:'Korrektur sendt til godkendelse',receipt:'Bekræftelse på kundens korrektursvar',staff_decision:'Intern besked om kundens korrektursvar'}[kind]||'Korrekturbesked';}
export function mailActivity(row){return [
 'Igangsat af: '+actorLabel(row.initiatedBy),
 ...(row.approvedBy?['Frigivet til afsendelse af: '+actorLabel(row.approvedBy)]:[]),
 'Afsender: '+actorLabel(row.sentBy),
 'Modtager: '+(row.to||'Ikke registreret'),
 ...(row.proof&&row.sentCount>1?['Automatiske påmindelser sendt: '+(row.sentCount-1)]:[])
];}
