// Explain the event as it happened, never using the order's current state.
const descriptions={
 prepared:'Ordreoplysninger og varer blev samlet i Smerch og gjort klar til afsendelse til PF.',
 submitting:'Smerch startede afsendelsen af ordren til PF. Denne hændelse er ikke en kvittering for modtagelse.',
 gateway_accepted:'PF’s system kvitterede teknisk for ordren. Det er endnu ikke en ordrebekræftelse eller en bekræftelse på produktionsstart.',
 pf_confirmation:'PF sendte en ordrebekræftelse. Den bekræfter, at ordren er registreret hos PF, men ikke at produktionen er startet.',
 pf_status:'PF sendte en opdatering om ordren. De konkrete statusoplysninger er ikke gemt på denne ældre hændelse.',
 proof_received:'En korrektur blev modtaget og gemt på ordren. Modtagelsen godkender ikke korrekturen hos PF.',
 customer_proof_published:'Korrekturen blev gjort tilgængelig for kunden til gennemgang og godkendelse.',
 proof_published:'Korrekturen blev gjort tilgængelig for kunden til gennemgang og godkendelse.',
 customer_approved:'Kunden godkendte korrekturversionen. Smerchs interne godkendelse og afsendelse af svaret til PF er separate trin.',
 smerch_approved:'En medarbejder registrerede godkendelse af korrekturen i Smerch. Denne hændelse bekræfter ikke, at svaret er sendt til PF.',
 staff_proof_payment_approved:'Smerch godkendte korrekturversionen og tillod hævning af betalingen. Selve hævningen skal bekræftes særskilt.',
 revision_requested:'Der blev registreret et ønske om ændringer til korrekturen. Ændringsønsket skal behandles og sendes til PF.',
 approval_sent_to_pf:'Afsendelse af godkendelsen til PF blev registreret. Produktionsstart er ikke bekræftet af denne hændelse.',
 revision_sent_to_pf:'Afsendelse af ændringsønsket til PF blev registreret. En ny korrektur kan være nødvendig.',
 external_approval_recorded:'Smerch registrerede en bekræftelse på korrekturgodkendelse hos PF. Produktionsstart er et separat trin.',
 external_approval:'En bekræftelse på korrekturgodkendelse hos PF blev registreret.',
 pf_shipment:'PF sendte forsendelsesoplysninger. Se Levering for pakker, tracking og eventuelle delleverancer.',
 shipped:'En afsendelse blev registreret. Se Levering for de tilknyttede forsendelsesoplysninger.',
 needs_reconciliation:'Afsendelsen kunne ikke bekræftes sikkert. Afstem ordren med PF, før den forsøges sendt igen.',
 pf_eproof_reconciliation_required:'Det er usikkert, om PF har behandlet korrektursvaret. Afstem med PF før et nyt forsøg.',
 smerch_review_required:'Ordren kræver intern gennemgang i Smerch, før den kan sendes til PF.',
 smerch_review_approved:'Smerch gennemgik ordren og godkendte, at den kan sendes til PF.',
 customer_decision:'Kundens svar på korrekturen blev registreret. Se korrekturhistorikken for beslutningen.',
 approval_delivery:'Afsendelse af korrektursvaret til PF blev registreret.'
};
const statuses={PROCESSING:'PF behandler ordren. Produktionsstart er ikke særskilt bekræftet.',STALLED:'Ordren er sat i bero hos PF og kræver afklaring.','PARTIAL SHIPPED':'PF melder ordren delvist afsendt.',SHIPPED:'PF melder ordren afsendt.',COMPLETED:'PF melder ordren afsluttet.',CANCELLED:'PF melder ordren annulleret.'};
export function eventDescription(event={}){
 if(event.type==='pf_status'&&(event.pfStatus||event.pfStatusInformation||event.expectedShipDate)){
  const parts=[statuses[event.pfStatus]||(event.pfStatus?`PF-status: ${event.pfStatus}.`:'PF opdaterede oplysningerne om ordren.')];
  if(event.pfStatusInformation)parts.push(`PF’s kommentar: ${event.pfStatusInformation}`);
  if(event.expectedShipDate&&Number.isFinite(Date.parse(event.expectedShipDate)))parts.push('Forventet afsendelse: '+new Date(event.expectedShipDate).toLocaleDateString('da-DK',{timeZone:'Europe/Copenhagen'})+'.');
  return parts.join(' ');
 }
 return descriptions[event.type]||'Hændelsen blev registreret på ordren. Der er ingen yderligere forklaring gemt for denne hændelsestype.';
}
