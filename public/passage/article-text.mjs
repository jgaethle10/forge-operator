// Plain-text representation of original demonstration articles. Never interpret the output as markup.
export function articleText(a){
 return a.title+'\n'+a.description+'\n\n'+a.category+' · Guide edition '+a.edition+'\n\n'+
 a.sections.map(s=>s.heading+'\n\n'+s.paragraphs.join('\n\n')).join('\n\n')+
 '\n\nRights: '+a.rights+'\nReferences for independent reading:\n'+
 a.sources.map(s=>s.label+': '+s.url).join('\n')+
 '\n\nPassage demonstration material. This file is not encrypted.\n';
}