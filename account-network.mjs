// Bound network waits so account controls always recover after a stalled request.
export async function accountFetch(input, options={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{return await fetch(input,{...options,signal:controller.signal});}
  catch(error){if(controller.signal.aborted&&!options.signal?.aborted)throw Error('The request took too long. Please try again. If you requested an email, check your inbox and spam folder before resending.');throw error;}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
