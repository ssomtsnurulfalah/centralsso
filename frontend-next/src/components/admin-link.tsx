"use client";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
/** Same document navigation keeps the authenticated workspace and its CSP. */
export function AdminLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.download!==undefined || props.target && props.target!=="_self")return;
    const url=new URL(href,window.location.href);
    if(url.origin!==window.location.origin || !/^\/admin(?:\/(?:users|applications|credentials|logs|settings|profile))?\/?$/.test(url.pathname))return;
    event.preventDefault();
    const destination=url.pathname+url.search+url.hash;
    if(destination!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState(null,"",destination);
  }
  return <a {...props} href={href} onClick={navigate} />;
}
