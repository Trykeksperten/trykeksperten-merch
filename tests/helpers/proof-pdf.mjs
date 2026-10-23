import {PDFDocument,StandardFonts} from 'pdf-lib';
export async function proofPdf(text='Internal test - no production'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([595,842]);
 page.drawText(text,{x:50,y:760,size:16,font});return Buffer.from(await pdf.save());
}
