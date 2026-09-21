let language=localStorage.getItem("alifo_lang")||"ja";
let chats=JSON.parse(localStorage.getItem("alifo_chats")||"[]");
let currentId=null;

const $=s=>document.querySelector(s);
const messages=$("#messages"), empty=$("#empty"), prompt=$("#prompt"), send=$("#send"), generateImageBtn=$("#generateImage");

function save(){localStorage.setItem("alifo_chats",JSON.stringify(chats))}
function t(el){if(el.dataset[language])el.textContent=el.dataset[language]}
function applyLanguage(){
 document.documentElement.lang=language;
 document.querySelectorAll("[data-ja][data-en]").forEach(t);
 prompt.placeholder=language==="ja"?prompt.dataset.placeholderJa:prompt.dataset.placeholderEn;
 $("#language").textContent=language==="ja"?"English":"日本語";
 $("#settingLanguage").value=language;
 renderHistory();
}
function newChat(){
 currentId=Date.now().toString();
 chats.unshift({id:currentId,title:language==="ja"?"新しいチャット":"New chat",messages:[]});
 save(); renderChat(); renderHistory();
}
function ensureChat(){
 if(!currentId||!chats.find(c=>c.id===currentId)) newChat();
 return chats.find(c=>c.id===currentId);
}
function renderHistory(){
 const box=$("#history"); box.innerHTML="";
 chats.forEach(c=>{
   const b=document.createElement("button");b.className="history-item"+(c.id===currentId?" active":"");
   b.textContent=c.title;b.onclick=()=>{currentId=c.id;renderChat();renderHistory();$("#sidebar").classList.remove("open")};
   box.appendChild(b);
 });
}
function renderChat(){
 const c=chats.find(x=>x.id===currentId);
 messages.innerHTML="";
 if(!c||!c.messages.length){empty.style.display="block";return}
 empty.style.display="none";
 c.messages.forEach(m=>addMessage(m.role,m.content,false));
}
function addMessage(role,text,store=true){
 const row=document.createElement("div");row.className="message "+role;
 if(role==="ai"){const a=document.createElement("div");a.className="avatar";a.textContent="A";row.appendChild(a)}
 const b=document.createElement("div");b.className="bubble";b.textContent=text;row.appendChild(b);messages.appendChild(row);
 messages.parentElement.scrollTop=messages.parentElement.scrollHeight;
 if(store){const c=ensureChat();c.messages.push({role,content:text});if(c.messages.length===1)c.title=text.slice(0,28);save();renderHistory()}
 return row;
}
function addImageMessage(src,promptText){
 const row=document.createElement("div");row.className="message ai";
 const a=document.createElement("div");a.className="avatar";a.textContent="A";row.appendChild(a);
 const wrap=document.createElement("div");wrap.className="bubble image-bubble";
 const img=document.createElement("img");img.className="generated-image";img.src=src;img.alt=promptText;img.loading="lazy";
 wrap.appendChild(img);
 const note=document.createElement("div");note.className="image-note";note.textContent=language==="ja"?"生成画像":"Generated image";wrap.appendChild(note);
 row.appendChild(wrap);messages.appendChild(row);
 messages.parentElement.scrollTop=messages.parentElement.scrollHeight;
}
async function generateImage(){
 const text=prompt.value.trim();
 if(!text)return;
 const c=ensureChat();
 addMessage("user",`🖼 ${text}`);
 prompt.value="";prompt.style.height="auto";send.disabled=true;generateImageBtn.disabled=true;
 const loading=addMessage("ai",language==="ja"?"画像を生成しています…":"Generating image…");
 try{
   const r=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:text,size:"1024x1024"})});
   const d=await r.json(); if(!r.ok)throw Error(d.error||"Image request failed");
   loading.remove(); addImageMessage(d.image,text);
 }catch(e){loading.querySelector(".bubble").textContent=language==="ja"?`画像生成エラー: ${e.message}`:`Image error: ${e.message}`}
 finally{send.disabled=false;generateImageBtn.disabled=false;prompt.focus()}
}
async function sendMessage(text){
 const c=ensureChat(); addMessage("user",text); prompt.value="";prompt.style.height="auto";send.disabled=true;
 const loading=addMessage("ai",language==="ja"?"考えています…":"Thinking…");
 try{
   const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:c.messages,language})});
   const d=await r.json(); if(!r.ok)throw Error(d.error||"Request failed");
   loading.querySelector(".bubble").textContent=d.text;
   c.messages.push({role:"assistant",content:d.text});save();
 }catch(e){loading.querySelector(".bubble").textContent=language==="ja"?`エラー: ${e.message}`:`Error: ${e.message}`}
 finally{send.disabled=false;prompt.focus()}
}
$("#form").onsubmit=e=>{e.preventDefault();const x=prompt.value.trim();if(x)sendMessage(x)};
generateImageBtn.onclick=generateImage;
prompt.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#form").requestSubmit()}};
prompt.oninput=()=>{prompt.style.height="auto";prompt.style.height=Math.min(prompt.scrollHeight,140)+"px"};
$("#newChat").onclick=newChat;
$("#language").onclick=()=>{language=language==="ja"?"en":"ja";localStorage.setItem("alifo_lang",language);applyLanguage()};
$("#settingsBtn").onclick=()=>$("#settings").classList.remove("hidden");
$("#closeSettings").onclick=()=>$("#settings").classList.add("hidden");
$("#settingLanguage").onchange=e=>{language=e.target.value;localStorage.setItem("alifo_lang",language);applyLanguage()};
$("#clearHistory").onclick=()=>{if(confirm(language==="ja"?"履歴をすべて削除しますか？":"Delete all chat history?")){chats=[];currentId=null;save();renderChat();renderHistory()}};
$("#openSidebar").onclick=()=>$("#sidebar").classList.add("open");
$("#closeSidebar").onclick=()=>$("#sidebar").classList.remove("open");
document.querySelectorAll(".quick button").forEach(b=>b.onclick=()=>sendMessage(b.dataset["prompt-"+language]));
if(!chats.length)newChat();else{currentId=chats[0].id;renderChat();renderHistory()}
applyLanguage();