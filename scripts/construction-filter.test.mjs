import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyConstruction as classify} from './construction-filter.mjs';
test('private small jobs and helpers in Russian and Latvian',()=>{
 assert.equal(classify('Ищу мастера, нужно заменить кран в ванной квартиры в Риге','task'),'task');
 assert.equal(classify('Meklēju meistaru nomainīt krānu dzīvoklī Rīgā','task'),'task');
 assert.equal(classify('Сантехник ищу подработку, мелкий ремонт','helper'),'helper');
 assert.equal(classify('Veicu nelielus remonta darbus Rīgā','helper'),'helper');
});
test('exclude recruitment, unrelated work, companies and ambiguous listings',()=>{
 for(const s of ['SIA meklē elektriķi dzīvokļu remontam','Компания ищет мастера по ремонту квартир','Нужен сантехник в штат, зарплата 1500','Ищу няню в квартиру','Строитель ищет работу']) assert.equal(classify(s,'task'),null,s);
 assert.equal(classify('Бригада предлагает ремонт квартир','helper'),null);
 assert.equal(classify('Нужен электрик','task'),null);
});
