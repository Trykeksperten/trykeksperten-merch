export function shouldHandleNavigation(link,event,origin){
 return Boolean(link&&link.origin===origin&&!link.hash&&!link.hasAttribute('download')&&(!link.target||link.target==='_self')&&!link.pathname.startsWith('/api/')&&!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0);
}
