import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
const mockApi=jest.fn(async()=>({success:'Saved'}));
const mockClient={api:mockApi,session:{user:{id:'user',displayName:'Test Family',email:'test@example.com'},memberId:'member',family:{id:'family',name:'Test family'},permissions:['tasks.read','tasks.create','tasks.update','tasks.delete','chat.read','agenda.read'],preferences:{},features:[],preferenceSections:{},modules:{tasks:{title:'Tasks',path:'/tasks',fields:[{name:'title',label:'Title',required:true}]}}},error:'',loading:false,server:'https://famora.example',connect:jest.fn(),login:jest.fn(),logout:jest.fn(),refreshSession:jest.fn(),supabase:null};
const mockRefresh=jest.fn(async()=>{});
jest.mock('../src/client',()=>({ClientProvider:({children}:{children:React.ReactNode})=>children,useClient:()=>mockClient,useAction:()=>jest.fn(),getCached:()=>undefined,setCached:jest.fn(),useResource:(path:string|null)=>({loading:false,error:'',refresh:mockRefresh,data:path==='workspace/tasks'?{items:[],members:[],canCreate:true,canEdit:true,canDelete:true,config:mockClient.session.modules.tasks}:path==='agenda'?[]:undefined})}));
jest.mock('../src/native',()=>({pickFile:jest.fn(),pickDateTime:jest.fn(),download:jest.fn(),startRecording:jest.fn(),stopRecording:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({...jest.requireActual('react-native-safe-area-context/jest/mock').default,SafeAreaView:jest.requireActual('react-native').View}));

test('native navigation opens Tasks immediately and submits the create form',async()=>{
 let view:ReactTestRenderer.ReactTestRenderer;
 await ReactTestRenderer.act(async()=>{view=ReactTestRenderer.create(<App/>);});
 await ReactTestRenderer.act(async()=>view!.root.findByProps({testID:'tab-more'}).props.onPress());
 const taskRow=view!.root.findByProps({accessibilityLabel:'Tasks'});
 expect(taskRow).toBeDefined();
 await ReactTestRenderer.act(async()=>taskRow!.props.onPress());
 await ReactTestRenderer.act(async()=>view!.root.findByProps({testID:'workspace-add'}).props.onPress());
 const title=view!.root.findAllByProps({testID:'field-title'}).find(input=>input.props.onChangeText);expect(title).toBeDefined();
 await ReactTestRenderer.act(async()=>title!.props.onChangeText('Native task'));
 await ReactTestRenderer.act(async()=>view!.root.findByProps({testID:'form-save'}).props.onPress());
 expect(mockApi).toHaveBeenCalledWith('workspace/tasks',expect.objectContaining({method:'POST',body:expect.any(FormData)}));
 await ReactTestRenderer.act(async()=>view!.unmount());
},30000);
