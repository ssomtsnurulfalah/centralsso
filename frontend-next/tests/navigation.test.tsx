import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Shell } from '../src/components/shell';
import type { Identity } from '../src/lib/panel-schema';
const admin: Identity={sso_user_id:'usr_admin',username:'admin.utama',full_name:'Admin Uji',global_role:'super_admin',account_status:'active',identity_version:1};
function setup(user=admin,section='dashboard') {
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,data:{system_name:'Central SSO',institution_name:'Institusi Uji',display_timezone:'Asia/Jakarta'}})));
 const router={bfcacheId:'navigation-test',back:vi.fn(),forward:vi.fn(),refresh:vi.fn(),hmrRefresh:vi.fn(),push:vi.fn(),replace:vi.fn(),prefetch:vi.fn()};
 render(<AppRouterContext.Provider value={router}><Shell user={user} section={section}><p>Konten terlindungi</p></Shell></AppRouterContext.Provider>);
 return router;
}
test('NAV01 all authorized sidebar destinations retain native navigation when client router makes no progress',()=>{
 const router=setup();const nav=screen.getByRole('navigation',{name:'Navigasi utama'});
 const links=within(nav).getAllByRole('link');
 expect(links.map(a=>a.getAttribute('href'))).toEqual(['/admin','/admin/users','/admin/applications','/admin/credentials','/admin/logs','/admin/settings','/admin/profile']);
 for(const link of links){
  const event=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});
  // Observe the browser default, then suppress actual jsdom navigation only.
  let intercepted:boolean|undefined;
  const observe=(e:Event)=>{intercepted=e.defaultPrevented;e.preventDefault();};
  document.addEventListener('click',observe,{once:true});fireEvent(link,event);
  expect(intercepted).toBe(false);
 }
 expect(router.push).not.toHaveBeenCalled();
});
test('NAV02 mobile menu opens and closes while preserving destination links',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Buka navigasi'}));
 expect(document.querySelector('.sidebar')?.classList.contains('is-open')).toBe(true);
 const link=screen.getByRole('link',{name:'Pengguna'});
 document.addEventListener('click',e=>e.preventDefault(),{once:true});
 fireEvent.click(link);
 expect(document.querySelector('.sidebar')?.classList.contains('is-open')).toBe(false);
 expect(link.getAttribute('href')).toBe('/admin/users');
});
test('NAV03 Admin keeps only allowed menu destinations and active-page semantics',()=>{
 setup({...admin,global_role:'admin'},'users');
 const nav=screen.getByRole('navigation',{name:'Navigasi utama'});
 expect(within(nav).getAllByRole('link').map(a=>a.getAttribute('href'))).toEqual(['/admin','/admin/users','/admin/profile']);
 expect(within(nav).getByRole('link',{name:'Pengguna'}).getAttribute('aria-current')).toBe('page');
 expect(within(nav).queryByRole('link',{name:'Aplikasi'})).toBeNull();
});
