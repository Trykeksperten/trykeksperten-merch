// Shared by downloads and mail attachments. References come from the PDF's order number.
export function invoiceBasisFilename(reference){
 const number=String(reference??'').trim().replace(/[^a-zA-Z0-9-]+/g,'_').replace(/^_+|_+$/g,'')||'afventer_ordrenummer';
 return `${number}_smerch_fakturagrundlag.pdf`;
}
