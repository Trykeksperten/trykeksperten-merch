import {db} from './database.mjs';

// Call inside the document/import transaction. Only an explicit original PF id
// establishes ownership; shared checkout ids and document labels do not.
export function bindPFDocument(documentId,pfOrderId){
 const connection=db(),document=connection.prepare('SELECT order_id FROM documents WHERE id=?').get(documentId),record=connection.prepare("SELECT payload FROM records WHERE namespace='orders' AND id=?").get(pfOrderId),source=record&&JSON.parse(record.payload);
 if(!document||!source||!source.checkoutId||source.checkoutId!==document.order_id)throw Error('Dokumentets oprindelige PF-ordre matcher ikke kundeordren.');
 const binding=connection.prepare('SELECT pf_order_id FROM pf_document_bindings WHERE document_id=?').get(documentId);
 if(binding&&binding.pf_order_id!==pfOrderId)throw Error('Dokumentet er allerede knyttet til en anden PF-ordre. Afstem originalen.');
 if(!binding)connection.prepare('INSERT INTO pf_document_bindings(document_id,pf_order_id) VALUES(?,?)').run(documentId,pfOrderId);
}
