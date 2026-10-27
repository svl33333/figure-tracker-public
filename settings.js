(function(){
"use strict";
const REPO="svl33333/figure-tracker-public";
const DRAFT_KEY="figure-tracker-settings-draft-v1";
let ignored=new Set(),saved=new Set(),loaded=false,refreshing=false;
const el=s=>document.querySelector(s);
const savedRender=render;
const sortIds=ids=>Array.from(ids).sort((a,b)=>a-b);
const equal=(a,b)=>a.size===b.size&&Array.from(a).every(id=>b.has(id));
const safeStore=(key,val)=>{try{if(val===null)localStorage.removeItem(key);else localStorage.setItem(key,val)}catch(_){}};
const safeLoad=key=>{try{return localStorage.getItem(key)}catch(_){return null}};
const panel=document.createElement("section");
panel.className="watch-dashboard";
panel.setAttribute("aria-label","監視の継続・無視設定");
panel.innerHTML='<div class="shell">'+
  '<div class="watch-toolbar"><strong>監視対象の設定</strong><span id="watchCounts" class="watch-counts">設定を読み込み中</span></div>'+
  '<p class="watch-steps">商品ごとに「継続」または「無視」を選択できます。変更後、「GitHubで設定を確定」を押し、開いた画面で <b>Submit new issue</b> を押すと定期チェックへ反映されます。選択だけでは反映されません。</p>'+
  '<div class="watch-actions"><a id="watchSave" class="watch-save disabled" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true">GitHubで設定を確定</a>'+
  '<button id="watchReset" class="watch-reset" type="button">変更を破棄</button>'+
  '<button id="watchRefresh" class="watch-refresh" type="button">保存状態を再取得</button>'+
  '<span id="watchStatus" class="watch-status" role="status" aria-live="polite">読込中</span></div>'+
  '<p class="watch-steps" style="margin-bottom:0">無視はこの商品の更新通知のみを止めます。別商品の新発表まで除外しません。設定番号は公開GitHub Issueに記録されますが、購入・予約履歴は保存しません。</p>'+
  '</div>';
document.querySelector(".controls").after(panel);
const watchFilter=document.createElement("select");
watchFilter.className="select watch-select";watchFilter.id="watchFilter";
watchFilter.setAttribute("aria-label","監視状態で絞り込み");
watchFilter.innerHTML='<option value="all">監視状態：すべて</option><option value="keep">継続のみ</option><option value="ignore">無視のみ</option>';
document.querySelector(".controlrow").appendChild(watchFilter);

function getId(article){
  const node=article.querySelector(".id");
  const id=Number((node&&node.textContent||"").replace(/[^0-9]/g,""));
  return Number.isSafeInteger(id)?id:0;
}
function setStatus(message,error){
  const e=el("#watchStatus");e.textContent=message;e.classList.toggle("error",Boolean(error));
}
function updateUI(){
  const count=all.length;
  const totalIgnored=all.filter(x=>ignored.has(x.id)).length;
  el("#watchCounts").textContent="継続 "+(count-totalIgnored)+"件 ／ 無視 "+totalIgnored+"件";
  const dirty=loaded&&!equal(ignored,saved);
  const btn=el("#watchSave");
  btn.classList.toggle("disabled",!dirty);
  btn.setAttribute("aria-disabled",dirty?"false":"true");
  if(!loaded){setStatus("設定の取得待ち",false)}
  else if(dirty){setStatus("未保存：GitHubで確定すると反映されます",false)}
  else {setStatus("保存済みの監視設定と同期中",false)}
}
function decorate(){
  const filter=watchFilter.value;let visible=0;
  document.querySelectorAll("#cards article.card").forEach(article=>{
    const id=getId(article);
    const isIgnored=ignored.has(id);
    article.classList.toggle("watch-ignored",isIgnored);
    article.hidden=(filter==="keep"&&isIgnored)||(filter==="ignore"&&!isIgnored);
    if(!article.hidden)visible++;
    if(!loaded)return;
    const previous=article.querySelector(".watch-choice");
    if(previous)previous.remove();
    const choice=document.createElement("div");choice.className="watch-choice";
    choice.innerHTML='<div class="watch-choice-title">以後の情報収集</div>'+
      '<div class="watch-choice-buttons" role="group" aria-label="No.'+id+'の監視設定">'+
      '<button type="button" data-watch-id="'+id+'" data-watch-choice="keep" aria-pressed="'+(!isIgnored)+'" class="'+(!isIgnored?'active':'')+'">継続して監視</button>'+
      '<button type="button" data-watch-id="'+id+'" data-watch-choice="ignore" aria-pressed="'+isIgnored+'" class="'+(isIgnored?'active':'')+'">以後は無視</button></div>';
    const link=article.querySelector("a.link");
    if(link)link.before(choice);
  });
  if(all.length)el("#count").textContent=visible+"件表示";
  updateUI();
}
render=function(){savedRender();decorate();};
watchFilter.addEventListener("change",decorate);
el("#cards").addEventListener("click",event=>{
  const button=event.target.closest("button[data-watch-id]");
  if(!button||!loaded)return;
  const id=Number(button.dataset.watchId);
  if(!all.some(x=>x.id===id))return;
  if(button.dataset.watchChoice==="ignore")ignored.add(id);else ignored.delete(id);
  if(equal(ignored,saved))safeStore(DRAFT_KEY,null);
  else safeStore(DRAFT_KEY,JSON.stringify(sortIds(ignored)));
  render();
});
el("#watchReset").addEventListener("click",()=>{
  if(!loaded)return;
  ignored=new Set(saved);
  safeStore(DRAFT_KEY,null);
  render();
});
function issueUrl(){
  const marker="<!-- FIGURE_TRACKER_STATE_V1\n"+JSON.stringify({ignored_ids:sortIds(ignored)})+"\n-->";
  const explanation="フィギュアの監視設定を変更します。\n\n下の設定はこのアカウントの定期チェックへ同期されます。\nSubmit new issue を押して登録してください。変更せずに戻った場合は保存されません。\n\n"+marker;
  const params=new URLSearchParams({title:"FIGURE_TRACKER_SET_V1",body:explanation});
  return "https://github.com/"+REPO+"/issues/new?"+params.toString();
}
el("#watchSave").addEventListener("click",event=>{
  if(!loaded||equal(ignored,saved)){event.preventDefault();return;}
  event.currentTarget.href=issueUrl();
  safeStore(DRAFT_KEY,JSON.stringify(sortIds(ignored)));
  setStatus("GitHubで「Submit new issue」を押してください。完了後、再取得で同期状態を確認できます。",false);
});
async function loadRemoteState(){
  const githubUrl="https://api.github.com/repos/"+REPO+"/contents/tracking.json?ref=main&t="+Date.now();
  try{
    const r=await fetch(githubUrl,{cache:"no-store",headers:{"Accept":"application/vnd.github+json"}});
    if(!r.ok)throw new Error("GitHub API HTTP "+r.status);
    const obj=await r.json();
    const json=atob((obj.content||"").replace(/\s/g,""));
    return JSON.parse(json);
  }catch(apiError){
    const raw="https://raw.githubusercontent.com/"+REPO+"/main/tracking.json?t="+Date.now();
    const r=await fetch(raw,{cache:"no-store"});
    if(!r.ok)throw new Error("設定取得失敗: "+apiError.message+" / raw HTTP "+r.status);
    return r.json();
  }
}
async function refresh(first){
  if(refreshing)return;
  refreshing=true;el("#watchRefresh").disabled=true;
  try{
    const state=await loadRemoteState();
    if(state.schema_version!==1||!Array.isArray(state.ignored_ids)||
      state.ignored_ids.some(x=>!Number.isSafeInteger(x)||x<=0))
      throw new Error("監視設定ファイルが無効です");
    const nextSaved=new Set(state.ignored_ids);
    if(!loaded){
      saved=nextSaved;ignored=new Set(nextSaved);loaded=true;
      const draft=safeLoad(DRAFT_KEY);
      if(draft!==null){
        try{
          const ids=JSON.parse(draft);
          if(Array.isArray(ids)&&ids.every(x=>Number.isSafeInteger(x)&&x>0))
            ignored=new Set(ids);
        }catch(_){}
      }
    }else{
      const hadLocalChanges=!equal(saved,ignored);
      saved=nextSaved;
      if(!hadLocalChanges)ignored=new Set(nextSaved);
    }
    if(equal(saved,ignored))safeStore(DRAFT_KEY,null);
    render();
    if(equal(saved,ignored))setStatus("GitHubに保存済み・監視設定と同期済み",false);
    else setStatus("未反映の変更があります。Issue送信後に再取得してください",false);
  }catch(error){
    console.error(error);
    if(!loaded){
      el("#watchCounts").textContent="監視設定を取得できません";
      setStatus("設定の取得失敗：再取得してください",true);
    }else setStatus("再取得失敗。前回取得した設定を表示中",true);
  }finally{
    refreshing=false;el("#watchRefresh").disabled=false;
  }
}
el("#watchRefresh").addEventListener("click",()=>refresh(false));
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)refresh(false);
});
refresh(true);
})();

