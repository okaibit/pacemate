export function createSaveQueue(save) {
  let pending=Promise.resolve();
  return {
    enqueue(snapshot){pending=pending.catch(()=>{}).then(()=>save(snapshot));return pending;},
    drain(){return pending;},
  };
}
