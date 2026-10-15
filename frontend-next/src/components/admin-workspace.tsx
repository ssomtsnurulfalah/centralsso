"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { Shell } from "./shell";
import { Panel } from "./panel";
import { Loading, Notice } from "./common";
import { DataState } from "./panel-shared";
import { useData } from "@/lib/client";
import { adminSection, type Identity } from "@/lib/panel-schema";
type Access={section:string;allowed:boolean;user:Identity};
function PageAccess({section,onIdentity}:{section:string;onIdentity:Dispatch<SetStateAction<Identity>>}) {
  const result=useData<Access>("page.access",{section});
  useEffect(()=>{if(result.data)onIdentity(result.data.user);},[result.data,onIdentity]);
  return <DataState {...result}>{result.data?.allowed ? <Panel section={section} user={result.data.user}/> : result.data ? <Notice error>Halaman ini hanya tersedia untuk Super Admin.</Notice> : <Loading/>}</DataState>;
}
export function AdminWorkspace({user:initialUser,children}:{user:Identity;children:ReactNode}) {
  const pathname=usePathname(),search=useSearchParams();
  const [user,setUser]=useState(initialUser);
  const candidate=pathname.replace(/^\/admin\/?/,"").replace(/\/$/,"")||"dashboard";
  const parsed=adminSection.safeParse(candidate);
  const section=parsed.success?parsed.data:"dashboard";
  const pageKey=section==="credentials"?section+":"+(search.get("app")||""):section;
  useEffect(()=>{
    document.getElementById("page-title")?.focus({preventScroll:true});
    window.scrollTo({top:0,left:0,behavior:"auto"});
  },[pageKey]);
  return <Shell user={user} section={section}>
    {parsed.success?<PageAccess key={pageKey} section={section} onIdentity={setUser}/>:<Notice error>Halaman tidak ditemukan.</Notice>}
    {children}
  </Shell>;
}
