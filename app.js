(function(){
var bank=[], session=[], pos=0, sessionLog=[], teaching={}, helpUsed=false;
var state={seen:{},correct:{},wrong:{},sessions:0,events:[],concepts:{}};
function $(id){return document.getElementById(id)}
function loadState(){try{var s=localStorage.getItem("caminho_state_v2");if(s)state=JSON.parse(s)}catch(e){}}
function save(){try{localStorage.setItem("caminho_state_v2",JSON.stringify(state))}catch(e){}}
function ensureVocab(){if(!state.vocab)state.vocab={}}
function vocabKey(v){return v.he}
function vocabRec(v){ensureVocab();var k=vocabKey(v);if(!state.vocab[k])state.vocab[k]={he:v.he,pt:v.pt,correct_encounters:0,wrong_encounters:0,question_ids:{},first_ts:0,last_ts:0,level:"new"};return state.vocab[k]}
function updateVocab(q,ok){
 var v=(q.explanation_v1&&q.explanation_v1.vocabulary)||[],now=Date.now();
 v.forEach(function(x){var r=vocabRec(x);if(!r.first_ts)r.first_ts=now;r.last_ts=now;r.question_ids[q.official_id]=1;if(ok)r.correct_encounters++;else r.wrong_encounters++;
   var distinct=Object.keys(r.question_ids).length,days=(now-r.first_ts)/86400000;
   if(r.wrong_encounters>0&&r.wrong_encounters>=r.correct_encounters/2)r.level="assisted";
   else if(r.correct_encounters>=3&&distinct>=2&&days>=3)r.level="mastered";
   else if(r.correct_encounters>=2&&distinct>=2)r.level="recognized";
   else if(r.correct_encounters>=1)r.level="assisted";
   else r.level="new";
 });
}
function vocabNeedsHelp(v){var r=vocabRec(v);return r.level!=="mastered"}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function conceptOf(q){return q.pedagogy_v1.primary_concept}
function conceptLabel(q){return q.pedagogy_v1.primary_concept_pt}
function progress(){
 var answered=Object.keys(state.seen||{}).length;
 var coverage=bank.length?answered/bank.length:0;
 var vals=[];for(var c in state.concepts){if(state.concepts[c].distinct>=5)vals.push(state.concepts[c].score)}
 var mastery=vals.length?vals.reduce(function(a,b){return a+b},0)/vals.length/100:0;
 var p=Math.round((coverage*.35+mastery*.65)*100);if(p>100)p=100;
 $("roadFill").style.width=p+"%";$("car").style.left="calc("+p+"% - 12px)";
 $("status").textContent=bank.length+" questões · "+answered+" estudadas · jornada "+p+"%";
}
function rebuildConcepts(){
 var grouped={};
 (state.events||[]).forEach(function(e){
   var c=e.concept;if(!c)return;
   if(!grouped[c])grouped[c]={byId:{},label:e.concept_pt||c};
   var prev=grouped[c].byId[e.id];
   if(!prev||e.ts>=prev.ts)grouped[c].byId[e.id]=e;
 });
 state.concepts={};
 Object.keys(grouped).forEach(function(c){
   var g=grouped[c],ev=Object.keys(g.byId).map(function(id){return g.byId[id]}).sort(function(a,b){return b.ts-a.ts}).slice(0,20);
   var distinct=ev.length,sum=0;ev.forEach(function(e){sum+=e.correct?1:-1});
   var score=distinct?Math.round(((sum/distinct)+1)/2*100):0;
   var all=(state.events||[]).filter(function(e){return e.concept===c});
   var first=all.length?Math.min.apply(null,all.map(function(e){return e.ts})):0;
   var retention=all.some(function(e){return e.correct&&first&&e.ts-first>=3*86400000});
   if(distinct<5){score=Math.min(score,69)}
   if((distinct<8||!retention)&&score>=85)score=84;
   var label=distinct<5?"coletando evidência":score<50?"precisa reforçar":score<70?"em aprendizado":score<85?"quase firme":"firme";
   state.concepts[c]={score:score,distinct:distinct,label:label,title:g.label,retention:retention};
 });
}
function makeSession(){
 rebuildConcepts();
 var byId={};bank.forEach(function(q){byId[q.official_id]=q});
 var latestMock=(state.mocks&&state.mocks.length)?state.mocks[state.mocks.length-1]:null;
 var latestMiss=(latestMock&&latestMock.missed_ids)||[];
 var priorityReview=latestMiss.map(function(id){return byId[id]}).filter(Boolean);
 var otherWrong=shuffle(Object.keys(state.wrong||{}).filter(function(id){return state.wrong[id]>0&&byId[id]&&latestMiss.indexOf(id)<0}).map(function(id){return byId[id]}));
 var review=priorityReview.concat(otherWrong).slice(0,3);
 var weak=Object.keys(state.concepts).filter(function(c){return state.concepts[c].distinct>=5&&state.concepts[c].score<70});
 if(latestMock&&latestMock.weak_concepts)latestMock.weak_concepts.forEach(function(c){if(weak.indexOf(c)<0)weak.push(c)});
 weak.sort(function(a,b){return state.concepts[a].score-state.concepts[b].score});
 var weakQs=shuffle(bank.filter(function(q){return weak.indexOf(conceptOf(q))>=0&&review.indexOf(q)<0})).slice(0,4);
 var used={};review.concat(weakQs).forEach(function(q){used[q.official_id]=1});
 var unseen=shuffle(bank.filter(function(q){return !state.seen[q.official_id]&&!used[q.official_id]})).slice(0,Math.max(0,9-review.length-weakQs.length));
 unseen.forEach(function(q){used[q.official_id]=1});
 var confidence=shuffle(bank.filter(function(q){return state.seen[q.official_id]&&!used[q.official_id]})).slice(0,1);
 session=review.concat(weakQs,unseen,confidence);
 if(session.length<10)session=session.concat(shuffle(bank.filter(function(q){return !used[q.official_id]})).slice(0,10-session.length));
 session=session.slice(0,10);pos=0;sessionLog=[];render();
}
function render(){
 var q=session[pos];if(!q){finishSession();return}
 $("counter").textContent=(pos+1)+" / "+session.length;$("concept").textContent=conceptLabel(q);$("question").textContent=q.question_he;
 helpUsed=false;$("help").hidden=true;$("help").innerHTML="";$("teacherFeedback").hidden=true;$("teacherFeedback").innerHTML="";$("continueBtn").hidden=true;
 var iw=$("imageWrap");iw.innerHTML="";var u=q.provenance_v1&&q.provenance_v1.current_image_candidate_url;
 if(u){var im=document.createElement("img");im.src=u;im.alt="Imagem da questão";im.onerror=function(){this.remove()};iw.appendChild(im)}
 var a=$("answers");a.innerHTML="";
 q.answers_he.forEach(function(txt,i){var b=document.createElement("button");b.textContent=txt;b.onclick=function(){answer(q,i,b)};a.appendChild(b)});
 $("helpBtn").onclick=function(){showHelp(q)};
}
function answer(q,i,b){
 var bs=$("answers").querySelectorAll("button");for(var k=0;k<bs.length;k++)bs[k].disabled=true;
 var ok=i===q.correct_index;state.seen[q.official_id]=(state.seen[q.official_id]||0)+1;
 if(ok){b.className="correct";state.correct[q.official_id]=(state.correct[q.official_id]||0)+1}
 else{b.className="wrong";bs[q.correct_index].className="correct";state.wrong[q.official_id]=(state.wrong[q.official_id]||0)+1}
 updateVocab(q,ok);showTeacherFeedback(q,ok);var ev={id:q.official_id,concept:conceptOf(q),concept_pt:conceptLabel(q),correct:ok,ts:Date.now(),diagnosis:diagnoseError(q,ok),help_used:helpUsed,source:"study"};
 state.events.push(ev);if(state.events.length>5000)state.events=state.events.slice(-5000);sessionLog.push(ev);rebuildConcepts();save();
 $("continueBtn").hidden=false;$("continueBtn").onclick=function(){pos++;render()};
}
function diagnoseError(q,ok){
 if(ok)return "correct";
 var vocab=(q.explanation_v1&&q.explanation_v1.vocabulary)||[];
 if(helpUsed&&vocab.length)return "language_support";
 var c=conceptOf(q);
 if(c==="sinais"||c==="semaforo")return "sign_interpretation";
 if(c==="preferencia"||c==="cruzamentos")return "rule_application";
 return "concept_gap";
}
function diagnosisText(code){
 if(code==="language_support")return "Parece que o hebraico técnico pode ter pesado nesta questão. Vamos manter a tradução ativa e testar o mesmo termo em outra pergunta.";
 if(code==="sign_interpretation")return "Vale revisar como interpretar a sinalização, não decorar esta alternativa.";
 if(code==="rule_application")return "O ponto fraco parece ser aplicar a regra à situação. A próxima revisão usará outra questão do mesmo conceito.";
 if(code==="concept_gap")return "Esta resposta indica um possível buraco no conceito. O Caminho vai reforçá-lo com outra questão oficial.";
 return "";
}
function showTeacherFeedback(q,ok){
 var box=$("teacherFeedback"),topic=teaching[conceptOf(q)];
 var code=diagnoseError(q,ok);var h="<div class='answer'>"+(ok?"✓ Correto":"Resposta correta: <span dir='rtl'>"+q.answers_he[q.correct_index]+"</span>")+"</div>";if(!ok)h+="<p><b>Diagnóstico:</b> "+diagnosisText(code)+"</p>";
 if(topic){h+="<b>"+topic.title_pt+"</b><br>"+topic.explanation_pt+"<span class='source'>"+topic.source_label+"</span>";}
 else{h+="<small>O gabarito acima vem do banco oficial. Ainda não adicionamos uma explicação detalhada verificada para este conceito.</small>";}
 box.innerHTML=h;box.hidden=false;
}
function showHelp(q){helpUsed=true;
 var all=(q.explanation_v1&&q.explanation_v1.vocabulary)||[],v=all.filter(vocabNeedsHelp),mastered=all.filter(function(x){return !vocabNeedsHelp(x)}),h="<b>O que está sendo treinado?</b><br>"+conceptLabel(q);
 if(v.length)h+="<br><br><b>Vocabulário</b><br>"+v.map(function(x){var r=vocabRec(x);return "<span dir='rtl'>"+x.he+"</span> = "+x.pt+" <small>· "+r.level+"</small>"}).join("<br>");
 if(mastered.length)h+="<br><br><details><summary>"+mastered.length+" termo(s) já dominado(s)</summary>"+mastered.map(function(x){return "<span dir='rtl'>"+x.he+"</span> = "+x.pt}).join("<br>")+"</details>";
 if(!all.length)h+="<br><br><small>Nenhum termo técnico marcado nesta questão.</small>";
 $("help").innerHTML=h;$("help").hidden=false;
}
function finishSession(){
 state.sessions=(state.sessions||0)+1;save();rebuildConcepts();
 var correct=sessionLog.filter(function(x){return x.correct}).length;
 var affected={};sessionLog.forEach(function(x){affected[x.concept]=1});
 var concepts=Object.keys(affected).map(function(c){return state.concepts[c]}).filter(Boolean).sort(function(a,b){return a.score-b.score});
 $("study").hidden=true;$("result").hidden=false;
 $("resultScore").textContent=correct+" / "+sessionLog.length;
 $("resultText").textContent=correct>=9?"Sessão muito firme.":correct>=7?"Bom avanço. Vamos consolidar o que ainda oscila.":"Hoje encontramos exatamente o que vale revisar.";
 var box=$("conceptResults");box.innerHTML="";
 concepts.forEach(function(c){var d=document.createElement("div");d.className="mastery";d.innerHTML="<b>"+c.title+"</b><span>"+c.score+"% · "+c.label+"</span>";box.appendChild(d)});
 progress();
}
loadState();
fetch("teaching.json").then(function(r){return r.json()}).then(function(d){teaching=d.topics||{}}).catch(function(){});
fetch("questions.json").then(function(r){return r.json()}).then(function(d){bank=d.questions;progress();$("startBtn").disabled=false}).catch(function(){$("status").textContent="Não consegui carregar o banco. Esta versão precisa estar hospedada por HTTP/HTTPS.";});
$("startBtn").disabled=true;$("startBtn").onclick=function(){$("app").querySelector(".hero").hidden=true;$("result").hidden=true;$("study").hidden=false;makeSession()};
$("backBtn").onclick=function(){$("study").hidden=true;$("result").hidden=true;$("app").querySelector(".hero").hidden=false;progress()};
$("againBtn").onclick=function(){$("result").hidden=true;$("study").hidden=false;makeSession()};
$("homeBtn").onclick=function(){$("result").hidden=true;$("app").querySelector(".hero").hidden=false;progress()};

var mockSession=[],mockPos=0,mockAnswers=[],mockStarted=0,mockTimer=null,mockSeconds=2400,mockFinished=false;
function startMock(){
  mockSession=shuffle(bank).slice(0,30);mockPos=0;mockAnswers=[];mockStarted=Date.now();mockSeconds=2400;mockFinished=false;
  $("app").querySelector(".hero").hidden=true;$("study").hidden=true;$("result").hidden=true;$("mockResult").hidden=true;$("mock").hidden=false;
  renderMock();updateTimer();if(mockTimer)clearInterval(mockTimer);mockTimer=setInterval(function(){mockSeconds--;updateTimer();if(mockSeconds<=0)finishMock()},1000);
}
function updateTimer(){var m=Math.floor(mockSeconds/60),s=mockSeconds%60;$("timer").textContent=(m<10?"0":"")+m+":"+(s<10?"0":"")+s}
function renderMock(){
  var q=mockSession[mockPos];if(!q){finishMock();return}
  $("mockCounter").textContent=(mockPos+1)+" / 30";$("mockQuestion").textContent=q.question_he;$("mockNextBtn").disabled=true;
  var iw=$("mockImageWrap");iw.innerHTML="";var u=q.provenance_v1&&q.provenance_v1.current_image_candidate_url;
  if(u){var im=document.createElement("img");im.src=u;im.alt="Imagem da questão";im.onerror=function(){this.remove()};iw.appendChild(im)}
  var box=$("mockAnswers");box.innerHTML="";
  q.answers_he.forEach(function(txt,i){var b=document.createElement("button");b.textContent=txt;b.onclick=function(){
    var bs=box.querySelectorAll("button");for(var k=0;k<bs.length;k++)bs[k].className="";b.className="selected";mockAnswers[mockPos]=i;$("mockNextBtn").disabled=false;
  };box.appendChild(b)});
  $("mockNextBtn").textContent=mockPos===29?"Finalizar":"Próxima";
}
function finishMock(){
  if(mockFinished)return;mockFinished=true;
  if(mockTimer){clearInterval(mockTimer);mockTimer=null}
  var correct=0,missed=[],now=Date.now();
  for(var i=0;i<mockSession.length;i++){
    var q=mockSession[i],chosen=mockAnswers[i],ok=chosen===q.correct_index;
    if(ok)correct++;else missed.push(q);
    state.seen[q.official_id]=(state.seen[q.official_id]||0)+1;
    if(ok)state.correct[q.official_id]=(state.correct[q.official_id]||0)+1;
    else state.wrong[q.official_id]=(state.wrong[q.official_id]||0)+1;
    updateVocab(q,ok);state.events.push({id:q.official_id,concept:conceptOf(q),concept_pt:conceptLabel(q),correct:ok,ts:now,source:"mock"});
  }
  if(state.events.length>5000)state.events=state.events.slice(-5000);
  rebuildConcepts();
  var elapsed=Math.min(2400,Math.round((Date.now()-mockStarted)/1000)),answered=mockAnswers.filter(function(x){return typeof x==="number"}).length;
  var weakAfter={};missed.forEach(function(q){var c=conceptOf(q);weakAfter[c]=(weakAfter[c]||0)+1});
  var weakList=Object.keys(weakAfter).sort(function(a,b){return weakAfter[b]-weakAfter[a]}).slice(0,3);
  state.mocks=state.mocks||[];
  state.mocks.push({ts:now,score:correct,answered:answered,elapsed_seconds:elapsed,missed_ids:missed.map(function(q){return q.official_id}),weak_concepts:weakList});
  if(state.mocks.length>20)state.mocks=state.mocks.slice(-20);save();
  $("mock").hidden=true;$("mockResult").hidden=false;$("mockScore").textContent=correct+" / 30";
  $("mockVerdict").textContent=correct>=28?"Meta de treino atingida.":correct>=26?"Aprovada pelo critério da prova. Agora vamos buscar consistência em 28+.":"Ainda não passou. Os erros já entraram no próximo estudo.";
  var meta=answered+" respondidas · "+Math.floor(elapsed/60)+" min "+(elapsed%60)+" s";
  if(weakList.length)meta+=" · revisar: "+weakList.map(function(c){return state.concepts[c]?state.concepts[c].title:c}).join(", ");
  $("mockMeta").textContent=meta;
  progress();
}
$("mockBtn").onclick=startMock;
$("mockNextBtn").onclick=function(){mockPos++;renderMock()};
$("mockExitBtn").onclick=function(){if(mockTimer)clearInterval(mockTimer);$("mock").hidden=true;$("app").querySelector(".hero").hidden=false;progress()};
$("studyMockErrorsBtn").onclick=function(){
 $("mockResult").hidden=true;$("study").hidden=false;makeSession();
};
$("mockHomeBtn").onclick=function(){$("mockResult").hidden=true;$("app").querySelector(".hero").hidden=false;progress()};


function vocabMasteryPercent(){
 ensureVocab();var keys=Object.keys(state.vocab);if(!keys.length)return 0;
 var mastered=keys.filter(function(k){return state.vocab[k].level==="mastered"}).length;
 return mastered/keys.length*100;
}
function readinessData(){
 rebuildConcepts();
 var coverage=bank.length?Object.keys(state.seen||{}).length/bank.length*100:0;
 var cs=Object.keys(state.concepts).filter(function(c){return state.concepts[c].distinct>=5}).map(function(c){return state.concepts[c].score});
 var mastery=cs.length?cs.reduce(function(a,b){return a+b},0)/cs.length:0;
 var conceptKeys={};bank.forEach(function(q){conceptKeys[conceptOf(q)]=1});
 var conceptCoverage=Object.keys(conceptKeys).length?cs.length/Object.keys(conceptKeys).length*100:0;
 var mocks=(state.mocks||[]),last5=mocks.slice(-5),last3=mocks.slice(-3);
 var threeOfFive=last5.filter(function(m){return m.score>=28}).length>=3;
 var noFailLast3=last3.length>=3&&last3.every(function(m){return m.score>=26});
 var ready=coverage>=85&&mastery>=80&&conceptCoverage>=80&&threeOfFive&&noFailLast3;
 return {coverage:coverage,mastery:mastery,conceptCoverage:conceptCoverage,mocks:mocks,threeOfFive:threeOfFive,noFailLast3:noFailLast3,ready:ready};
}
function metric(title,value,detail){
 var v=Math.max(0,Math.min(100,Math.round(value)));
 return "<div class='metric'><div class='metricTop'><b>"+title+"</b><span>"+v+"%</span></div><div class='bar'><i style='width:"+v+"%'></i></div><small>"+detail+"</small></div>";
}
function diagnosisSummary(){
 var ev=(state.events||[]).slice(-100),c={language_support:0,sign_interpretation:0,rule_application:0,concept_gap:0};
 ev.forEach(function(x){if(!x.correct&&x.diagnosis&&c.hasOwnProperty(x.diagnosis))c[x.diagnosis]++});
 return c;
}
function showReadiness(){
 var r=readinessData();$("app").querySelector(".hero").hidden=true;$("readiness").hidden=false;
 $("readyTitle").textContent=r.ready?"Pronta para a prova":"Construindo consistência";
 $("readyText").textContent=r.ready?"Os critérios de treino do Caminho foram atingidos.":"Ainda não usamos uma porcentagem de chance de passar. Mostramos o que já está sólido e o que falta.";
 var mockQuality=0;if(r.mocks.length){var last=r.mocks.slice(-5);mockQuality=last.reduce(function(a,m){return a+(m.score/30*100)},0)/last.length}
 $("readyMetrics").innerHTML=metric("Cobertura do banco",r.coverage,"Meta de treino: 85%")+
   metric("Domínio dos conceitos",r.mastery,"Meta de treino: 80%")+metric("Conceitos com evidência",r.conceptCoverage,"Meta interna: pelo menos 80% dos conceitos com 5 questões distintas.")+metric("Hebraico técnico",vocabMasteryPercent(),"A ajuda desaparece gradualmente conforme os termos ficam dominados.")+
   metric("Simulados recentes",mockQuality,"Pronta: 3 dos últimos 5 com 28+ e nenhum dos últimos 3 abaixo de 26.");var dg=diagnosisSummary();$("readyMetrics").innerHTML+="<div class='metric'><b>Erros recentes</b><br><small>Hebraico: "+dg.language_support+" · Sinalização: "+dg.sign_interpretation+" · Aplicação de regra: "+dg.rule_application+" · Conceito: "+dg.concept_gap+"</small></div>";
 var h=$("mockHistory");h.innerHTML="<h3>Últimos simulados</h3>";
 if(!r.mocks.length)h.innerHTML+="<p>Ainda não há simulados.</p>";
 r.mocks.slice(-5).reverse().forEach(function(m){var d=document.createElement("div");d.className="history";d.innerHTML="<span>"+new Date(m.ts).toLocaleDateString()+"</span><b>"+m.score+"/30</b>";h.appendChild(d)});
}
$("readinessBtn").onclick=showReadiness;
$("readinessBackBtn").onclick=function(){$("readiness").hidden=true;$("app").querySelector(".hero").hidden=false;progress()};
$("readyStudyBtn").onclick=function(){$("readiness").hidden=true;$("study").hidden=false;makeSession()};

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(function(){});
})();
window.addEventListener("offline",function(){document.body.classList.add("offline")});
window.addEventListener("online",function(){document.body.classList.remove("offline")});
window.addEventListener("error",function(e){
  console.error("Caminho runtime error",e.error||e.message);
});

function byId(id){return document.getElementById(id)}
var deferredInstallPrompt=null;
window.addEventListener("beforeinstallprompt",function(e){
 e.preventDefault();deferredInstallPrompt=e;
 var b=byId("nativeInstallBtn");if(b)b.hidden=false;
});
byId("nativeInstallBtn").onclick=function(){
 if(!deferredInstallPrompt)return;
 deferredInstallPrompt.prompt();
 deferredInstallPrompt.userChoice.finally(function(){deferredInstallPrompt=null;byId("nativeInstallBtn").hidden=true});
};
function showInstall(){
 byId("app").querySelector(".hero").hidden=true;byId("installHelp").hidden=false;
 try{history.pushState({caminho:"install"},"","#install")}catch(e){}
}
function hideInstall(){
 byId("installHelp").hidden=true;byId("app").querySelector(".hero").hidden=false;
 if(location.hash==="#install")try{history.back()}catch(e){}
}
byId("installBtn").onclick=showInstall;
byId("installBackBtn").onclick=hideInstall;
window.addEventListener("popstate",function(){
 if(!byId("installHelp").hidden){byId("installHelp").hidden=true;byId("app").querySelector(".hero").hidden=false}
});
window.addEventListener("appinstalled",function(){
 deferredInstallPrompt=null;var b=byId("nativeInstallBtn");if(b)b.hidden=true;
});
