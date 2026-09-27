// Conservative rules: ambiguous advertisements are excluded, never guessed to be private.
export const professions = {
 builder:'Ремонт', plater:'Плитка', 'house-painter':'Покраска', electrician:'Электрика',
 plumber:'Сантехника', 'sanitary-technician':'Сантехника', roofer:'Кровля',
 handyman:'Мелкий ремонт', plasterer:'Штукатурка', bricklayer:'Кладка', carpenter:'Столярные работы'
};
export function classifyConstruction(text, role) {
 const s=String(text||'').normalize('NFKC').toLowerCase();
 if(/\b(sia|as|sia\.|vakance|cv|pilna slodze)\b|компан|фирм|ваканси|зарплат|оклад|штат|трудоустр|соцпакет|бригада|uzņēmum|atalgojum|darba alga|darbiniek|brigād|тендер|iepirkum|daudzdzīvokļu.*būvniec/.test(s)) return null;
 if(/уборк|uzkop|tīrīšan/.test(s)) return null;
 if(!/ремонт|плитк|сантех|электри|маляр|штукатур|покрас|покле|обои|ламинат|крыш|кровл|розет|кран|двер|окн|столяр|плотник|remont|flīz|santeh|elektri|krāso|apmet|tapet|lamināt|jumt|rozet|krān|durv|logu|galdnie/.test(s)) return null;
 if(role==='helper' && /подработ|халтур|разов|мелк|частн|ищу.*заказ|выполн|предлагаю|papild|haltūr|sīk|neliel|piedāvāju|veicu|meklēju.*pasūt/.test(s)) return 'helper';
 if(role==='task' && /нужен|нужна|нужны|нужно|ищу|требуется.*(положить|покрасить|заменить|починить)|nepieciešam|vajag|meklēju/.test(s) && /квартир|ванн|кухн|комнат|положить|покрасить|заменить|починить|установить|мелк|разов|dzīvok|vann|istab|virtu|nomain|uzstād|salabot|neliel|sīk/.test(s)) return 'task';
 return null;
}
