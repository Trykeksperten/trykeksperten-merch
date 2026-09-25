// PF Concept: https://www.pfconcept.com/en_nl/perfectly-personalised
export const pfTextFonts=Object.freeze(['Arial','Times New Roman','Helvetica','Calibri','Futura','Lucida Calligraphy','Myriad Pro']);
export const pfEmbroideryFonts=Object.freeze(pfTextFonts.slice(0,5));
export const textAlignments=Object.freeze(['left','center','right']);
export const textLineSpacings=Object.freeze([1,1.25,1.5]);

export const availableTextFonts=option=>/brod|embroider/i.test(String(option?.impMethod||''))?pfEmbroideryFonts:pfTextFonts;
export const defaultTextPlacement=()=>({x:.5,y:.5,scale:.24,font:'Arial',align:'center',lineSpacing:1.25,rotation:0});
export const fontFamily=font=>({
 'Arial':'Arial, sans-serif',
 'Times New Roman':'"Times New Roman", Times, serif',
 'Helvetica':'Helvetica, Arial, sans-serif',
 'Calibri':'Calibri, Arial, sans-serif',
 'Futura':'Futura, "Trebuchet MS", Arial, sans-serif',
 'Lucida Calligraphy':'"Lucida Calligraphy", "Brush Script MT", cursive',
 'Myriad Pro':'"Myriad Pro", Arial, sans-serif'
})[font]||'Arial, sans-serif';
