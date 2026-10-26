import 'react-native-url-polyfill/auto';
import {dateKey,initialValues,monthDays,optimisticItem,routeForPath,serverAddress,validateFields} from '../src/model';

test('server selection accepts HTTPS and emulator loopback but rejects credential and insecure remote origins',()=>{
 expect(serverAddress(' https://famora.example/path ')).toBe('https://famora.example');
 expect(serverAddress('http://10.0.2.2:3100')).toBe('http://10.0.2.2:3100');
 for(const origin of ['http://family.example','https://user:password@family.example','https://family.example?token=private','javascript:alert(1)'])expect(()=>serverAddress(origin)).toThrow();
});
test('forms preserve explicit false values and validate required inputs and upload bounds',()=>{
 const fields=[{name:'title',label:'Title',required:true},{name:'shared',label:'Shared',type:'checkbox'},{name:'status',label:'Status',options:['TODO','DONE']}];
 expect(initialValues(fields,{title:'Shopping',shared:false})).toEqual({title:'Shopping',shared:false,status:'TODO'});
 expect(validateFields(fields,{title:'',status:'TODO'},{ })).toBe('Title is required.');
 expect(validateFields(fields,{title:'Shopping',status:'OTHER'},{ })).toBe('Choose a valid status.');
 expect(validateFields([{name:'file',label:'File',type:'file',required:true}],{},{})).toBe('Choose file.');
 expect(validateFields([{name:'file',label:'File',type:'file',required:true}],{}, {},true)).toBeNull();
 expect(validateFields([{name:'file',label:'File',type:'file'}],{},{file:{uri:'content://file',name:'photo.png',type:'image/png',size:5*1024*1024}})).toContain('4 MB');
});
test('optimistic changes preserve attachments and show edits immediately while awaiting persistence',()=>{
 const previous={id:'task',title:'Old',body:'Before',url:'https://signed.example/file',values:{title:'Old'}};
 expect(optimisticItem({title:'New',description:'After',status:'DONE'},'task',previous)).toEqual(expect.objectContaining({id:'task',title:'New',body:'After',pending:true,url:previous.url}));
 expect(previous.title).toBe('Old');
});
test('calendar grid is stable across leap years and month boundaries',()=>{
 const dates=monthDays(2024,1);expect(dates).toHaveLength(42);expect(dates[0].getDay()).toBe(0);expect(dates.filter(date=>date.getMonth()===1)).toHaveLength(29);expect(new Set(dates.map(dateKey)).size).toBe(42);
});
test('notification links map to native routes without opening a web view',()=>{
 expect(routeForPath('/notebook/personal')).toEqual({name:'workspace',kind:'personal'});
 expect(routeForPath('/dms?conversation=abc')).toEqual({name:'dms',id:'abc'});
 expect(routeForPath('/unknown')).toBeNull();
});
