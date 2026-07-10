try {
 performance.mark('rkj-app-init');
} catch {
 // Monitoring must never affect app boot.
}

export function onRouterTransitionStart(
 url: string,
 navigationType: 'push' | 'replace' | 'traverse') {
 try {
  performance.mark(`rkj-nav-start:${navigationType}:${url}`);
 } catch {
  // Monitoring must never affect navigation.
 }
}
