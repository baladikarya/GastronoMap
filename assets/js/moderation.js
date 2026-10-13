/* P2 Tahap 12 — shared report/actions UI for Community and moderation.
   Uses the existing report form and brand design tokens; no framework required. */
(()=>{
'use strict';
const TARGET_LABELS={post:'Postingan',comment:'Komentar',user:'Pengguna',post_photo:'Foto Community',visit_photo:'Foto kunjungan',menu_photo:'Foto menu',resto:'Restoran'};
const currentUser=()=>typeof myUserId==='string'?myUserId:null;
const admin=()=>typeof isAdmin!=='undefined'&&isAdmin===true;
const say=s=>typeof showToast==='function'?showToast(s):console.warn(s);
const el=(tag,cls,label)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(label!==undefined)node.textContent=label;
 return node;
};
const layer=el('div','gm-mod-layer');
layer.hidden=true;layer.setAttribute('role','presentation');
const backdrop=el('div','gm-mod-backdrop');
const dialog=el('section','gm-mod-dialog');
dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
dialog.setAttribute('aria-labelledby','gmModTitle');
layer.append(backdrop,dialog);document.body.append(layer);
let returnFocus=null,active=null,busy=false;
function close(){
 if(layer.hidden)return;
 layer.hidden=true;active=null;busy=false;
 if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
backdrop.addEventListener('click',close);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!layer.hidden&&!busy){event.preventDefault();close();}});
function show(title,subtitle){
 returnFocus=document.activeElement;layer.hidden=false;dialog.replaceChildren();
 const heading=el('div','gm-mod-head');
 const text=el('div','gm-mod-heading');
 const h=el('h2','',title);h.id='gmModTitle';text.append(h);
 if(subtitle)text.append(el('p','',subtitle));
 const cancel=el('button','gm-mod-close','×');
 cancel.type='button';cancel.setAttribute('aria-label','Tutup');cancel.onclick=close;
 heading.append(text,cancel);dialog.append(heading);
 cancel.focus({preventScroll:true});
}
function option(label,callback,{danger=false,detail=''}={}){
 const b=el('button','gm-mod-option'+(danger?' gm-mod-option--danger':''),label);
 b.type='button';
 if(detail)b.append(el('small','',detail));
 b.addEventListener('click',callback);
 dialog.append(b);return b;
}
function openReport(target){
 if(!target||!TARGET_LABELS[target.type]||!target.id)return;
 close();
 if(typeof openReportModal==='function')openReportModal({
   targetType:target.type,targetId:target.id,
   targetName:target.name||TARGET_LABELS[target.type],restoId:target.restoId||null
 });
}
function openActions(options){
 if(!options?.type||!options.id)return;
 active=options;
 show('Opsi '+(TARGET_LABELS[options.type]||'Konten'),options.name||'Pilih tindakan yang tersedia.');
 const own=!!currentUser()&&options.ownerId===currentUser();
 if(own&&typeof options.onOwnerDelete==='function')
   option('Hapus konten saya',()=>{close();options.onOwnerDelete();},{danger:true});
 if(!own){
   option('Laporkan '+(TARGET_LABELS[options.type]||'konten'),()=>openReport(options),{detail:'Kirim laporan kepada admin GastronoMap'});
 }
 if(options.ownerId&&!own&&options.type!=='user')
   option('Laporkan akun pengguna',()=>openReport({type:'user',id:options.ownerId,name:'Akun pengguna'}));
 if(admin()){
   if(options.type==='user'){
     if(options.id!==currentUser()){
       option('Batasi akun',()=>confirmAdminAction({...options,action:'suspend'}),{danger:true});
       option('Pulihkan akun',()=>confirmAdminAction({...options,action:'unsuspend'}));
     }
   }else if(['post','comment','post_photo','visit_photo','menu_photo'].includes(options.type)){
     option('Sembunyikan konten',()=>confirmAdminAction({...options,action:'hide'}));
     option('Tampilkan kembali',()=>confirmAdminAction({...options,action:'restore'}));
     option('Hapus secara permanen',()=>confirmAdminAction({...options,action:'delete'}),{danger:true});
   }
 }
 if(!dialog.querySelector('.gm-mod-option'))dialog.append(el('p','gm-mod-empty','Tidak ada tindakan untuk konten ini.'));
}
function confirmAdminAction(options){
 if(!admin()||!options?.id)return;
 const {type,id,action}=options;
 if(!['hide','restore','delete','suspend','unsuspend'].includes(action))return;
 show('Konfirmasi moderasi',TARGET_LABELS[type]+' · '+{
  hide:'Sembunyikan',restore:'Pulihkan',delete:'Hapus permanen',suspend:'Suspend akun',unsuspend:'Aktifkan akun'
 }[action]);
 const label=el('label','gm-mod-label','Alasan tindakan admin');
 const reason=el('textarea','gm-mod-textarea');
 reason.placeholder='Jelaskan alasan tindakan ini (minimal 5 karakter)';
 reason.maxLength=1000;reason.rows=3;
 label.append(reason);dialog.append(label);
 let duration=null;
 if(action==='suspend'){
   const selectLabel=el('label','gm-mod-label','Durasi pembatasan');
   duration=el('select','gm-mod-select');
   for(const [value,text] of [['24','24 jam'],['168','7 hari'],['720','30 hari'],['','Tanpa batas waktu']]){
     const choice=el('option','',text);choice.value=value;duration.append(choice);
   }
   selectLabel.append(duration);dialog.append(selectLabel);
 }
 const feedback=el('p','gm-mod-feedback');feedback.setAttribute('role','status');dialog.append(feedback);
 const row=el('div','gm-mod-footer');
 const cancel=el('button','gm-mod-secondary','Batal');cancel.type='button';cancel.onclick=close;
 const confirm=el('button','gm-mod-primary'+(['delete','suspend'].includes(action)?' gm-mod-primary--danger':''),'Konfirmasi');
 confirm.type='button';
 confirm.addEventListener('click',async()=>{
   const text=reason.value.trim();
   if(busy)return;
   if(text.length<5){feedback.textContent='Alasan minimal 5 karakter.';reason.focus();return;}
   if(action==='delete'&&!window.confirm('Tindakan ini permanen dan tidak dapat dibatalkan. Lanjutkan?'))return;
   busy=true;confirm.disabled=true;cancel.disabled=true;feedback.textContent='Menyimpan tindakan…';
   try{
     const {error}=await sb.rpc('moderate_content',{
       p_target_type:type,p_target_id:id,p_action:action,p_reason:text,
       p_report_id:options.reportId||null,
       p_suspension_hours:duration?.value?Number(duration.value):null
     });
     if(error)throw error;
     close();say('Tindakan moderasi tersimpan.');
     if(typeof options.onRefresh==='function')await options.onRefresh();
     window.dispatchEvent(new CustomEvent('gm-content-moderated',{detail:{type,id,action}}));
   }catch(error){
     console.error('Moderation:',error);
     feedback.textContent='Gagal: '+(error.message||'Periksa koneksi atau izin admin.');
   }finally{busy=false;confirm.disabled=false;cancel.disabled=false;}
 });
 row.append(cancel,confirm);dialog.append(row);
 reason.focus();
}
window.GMModeration={openActions,openReport,confirmAdminAction,TARGET_LABELS};
window.openContentReport=openReport;
})();