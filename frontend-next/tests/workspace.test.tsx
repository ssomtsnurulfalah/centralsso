import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {useSyncExternalStore} from 'react';
import {AdminWorkspace} from '../src/components/admin-workspace';
import {Modal} from '../src/components/common';
import type {Identity} from '../src/lib/panel-schema';
vi.mock('next/navigation',()=>({
 usePathname:()=>useSyncExternalStore((f)=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);},()=>window.location.pathname,()=>'/admin'),
 useSearchParams:()=>new URLSearchParams(useSyncExternalStore((f)=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);},()=>window.location.search,()=>''))
}));
const actor:Identity={sso_user_id:'usr_test',username:'admin.utama',full_name:'Admin Uji',global_role:'super_admin',account_status:'active',identity_version:1};
const page={items:[],pagination:{page:1,page_size:25,total:0,total_pages:0,has_next:false}};
beforeEach(()=>{
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 window.history.replaceState(null,'','/admin');
 const native=window.history.pushState.bind(window.history);
 vi.spyOn(window.history,'pushState').mockImplementation((...args)=>{native(...args);window.dispatchEvent(new PopStateEvent('popstate'));});
});
afterEach(()=>vi.restoreAllMocks());
function backend(user=actor){
 const calls:{action:string;input:Record<string,unknown>;signal:AbortSignal}[]=[];
 const pending=new Map<string,(v:Response)=>void>();
 vi.stubGlobal('fetch',vi.fn((_url,options)=>{
  const body=JSON.parse(options.body);calls.push({...body,signal:options.signal});
  if(body.action==='page.access')return new Promise<Response>(resolve=>pending.set(body.input.section,resolve));
  const data=body.action==='preferences.get'?{system_name:'SSO',institution_name:'Institusi',display_timezone:'Asia/Jakarta'}:body.action==='dashboard'?{users_total:0,users_active:0,users_archived:0,applications_total:0,auth_success_24h:0,auth_failure_24h:0,recent_logs:[],generated_at:new Date().toISOString()}:page;
  return Promise.resolve(Response.json({success:true,data}));
 }));
 return {calls,resolve(section:string,allowed=true){pending.get(section)?.(Response.json({success:true,data:{section,user,allowed}}));}};
}
test('SPA01 destination heading is immediate; data waits for access; preferences and shell stay mounted',async()=>{
 const b=backend();render(<AdminWorkspace user={actor}>{null}</AdminWorkspace>);
 await waitFor(()=>expect(b.calls.filter(c=>c.action==='page.access')).toHaveLength(1));b.resolve('dashboard');
 await waitFor(()=>expect(b.calls.some(c=>c.action==='dashboard')).toBe(true));
 const sidebar=document.querySelector('.sidebar');fireEvent.click(screen.getByRole('link',{name:'Pengguna'}));
 expect(screen.getByRole('heading',{level:1,name:'Pengguna'})).toBeTruthy();
 expect(b.calls.some(c=>c.action==='users.list')).toBe(false);
 await waitFor(()=>expect(b.calls.filter(c=>c.action==='page.access')).toHaveLength(2));b.resolve('users');
 await waitFor(()=>expect(b.calls.some(c=>c.action==='users.list')).toBe(true));
 expect(document.querySelector('.sidebar')).toBe(sidebar);
 expect(b.calls.filter(c=>c.action==='preferences.get')).toHaveLength(1);
 expect(b.calls.filter(c=>c.action==='dashboard')).toHaveLength(1);
 expect(b.calls.some(c=>['apps.list','logs.list','settings.get'].includes(c.action))).toBe(false);
});
test('SPA02 denied access never mounts or fetches the target private data',async()=>{
 const user={...actor,global_role:'admin' as const},b=backend(user);
 window.history.replaceState(null,'','/admin/applications');render(<AdminWorkspace user={user}>{null}</AdminWorkspace>);
 await waitFor(()=>expect(b.calls.some(c=>c.action==='page.access')).toBe(true));b.resolve('applications',false);
 expect((await screen.findByRole('alert')).textContent).toContain('Super Admin');
 expect(b.calls.some(c=>c.action==='apps.list')).toBe(false);
});
test('SPA03 interrupted navigation aborts previous access and ignores its late result',async()=>{
 const b=backend();render(<AdminWorkspace user={actor}>{null}</AdminWorkspace>);
 await waitFor(()=>expect(b.calls.some(c=>c.action==='page.access')).toBe(true));
 const previous=b.calls.find(c=>c.action==='page.access')!;
 fireEvent.click(screen.getByRole('link',{name:'Pengguna'}));
 await waitFor(()=>expect(previous.signal.aborted).toBe(true));b.resolve('dashboard');
 expect(screen.getByRole('heading',{level:1,name:'Pengguna'})).toBeTruthy();
 expect(b.calls.some(c=>c.action==='dashboard')).toBe(false);
});
test('MODAL01 concurrent dialogs keep distinct accessible titles and descriptions',()=>{
 render(<><Modal title='Pertama' description='Deskripsi pertama' onClose={()=>{}}>Isi</Modal><Modal title='Kedua' description='Deskripsi kedua' onClose={()=>{}}>Isi</Modal></>);
 const first=screen.getByRole('dialog',{name:'Pertama'}),second=screen.getByRole('dialog',{name:'Kedua'});
 expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'));
 expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
 expect(first.hasAttribute('open')&&second.hasAttribute('open')).toBe(true);
});
