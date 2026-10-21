(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DndWorldActionUi=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Whole-world rollback must not erase a second edit made while an action awaits storage.
  // Capture before inline handlers; do not compete with the dialog controller's inert state.
  function create({document:doc,isBusy,onBlocked}){
    let started=false;
    const events=['pointerdown','mousedown','touchstart','click','dblclick','beforeinput','input','change','submit','reset','paste','cut','drop','keydown'];
    function guard(event){
      if(!isBusy())return;
      if(event.type==='keydown'&&(event.key==='Tab'||['Control','Meta','Shift','Alt'].includes(event.key)||
        (event.ctrlKey||event.metaKey)&&['a','c'].includes(String(event.key).toLowerCase())))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(onBlocked)onBlocked();
    }
    function start(){if(started)return;started=true;for(const type of events)doc.addEventListener(type,guard,{capture:true,passive:false});}
    return Object.freeze({start});
  }
  return Object.freeze({create});
});
