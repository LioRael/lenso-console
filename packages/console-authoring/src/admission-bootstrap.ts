/** These GETs share the identity read lock; methods still determine login/error UI. */
export function readAdmissionBootstrap<T>(methods: () => Promise<T>, session: () => Promise<T>) {
  return Promise.allSettled([methods(), session()] as const);
}
