import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useChannels } from '../contexts/ChannelContext';
import Paywall from '../components/Paywall';
import UploadProgress from '../components/UploadProgress';

const PRICE = 3990;
const ACCENT = '#6d5dfc', DARK = '#17172b', MUTED = '#6b7280', BORDER = '#e6e7ef', BG = '#f7f8fc';
const CATEGORIES = [['business','О бизнесе'],['products','Товары и услуги'],['competitors','Конкуренты'],['content','Контент и соцсети'],['brand','Бренд и материалы'],['general','Другое']];
const FIELDS = [
  ['niche','Ниша и география *','Например: стоматология в Москве'],
  ['business','О бизнесе *','Что продаёте, опыт, преимущества, средний чек'],
  ['audience','Целевая аудитория *','Кто покупает, боли, желания и возражения'],
  ['goal','Главная цель *','Подписчики, заявки, продажи, запись или повторные покупки'],
  ['products','Приоритетные продукты','Названия, цены, маржинальность, сезонность'],
  ['sales','Как сейчас происходят продажи','Путь клиента, менеджеры, CRM, оплата'],
  ['content','Контент и возможности производства','Готовность сниматься, форматы, частота'],
  ['tone','Стиль и ограничения','Тон общения, запрещённые темы и формулировки'],
  ['competitors','Известные конкуренты','Названия или ссылки; ссылки также можно добавить ниже'],
  ['notes','Дополнительная информация','Всё, что агент обязательно должен учесть'],
];
const card = { background:'#fff', border:`1px solid ${BORDER}`, borderRadius:16, padding:20, boxShadow:'0 2px 10px rgba(20,25,50,.04)' };
const input = { width:'100%', boxSizing:'border-box', border:`1px solid ${BORDER}`, borderRadius:10, padding:'11px 12px', font:'inherit', color:DARK, outline:'none', background:'#fff' };
const primary = { border:0, borderRadius:11, padding:'12px 18px', color:'#fff', fontWeight:700, cursor:'pointer', background:`linear-gradient(135deg,${ACCENT},#4361ee)` };

export default function AiAssistantPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;
  const [project,setProject] = useState(null), [loading,setLoading] = useState(true), [creating,setCreating] = useState(false);
  const load = useCallback(async (silent=false) => {
    if (!tc) return;
    if (!silent) setLoading(true);
    try { const data=await api.get(`/ai-agent/${tc}/current`); setProject(data.project||null); }
    catch(e){ showToast(e.message||'Не удалось загрузить проект','error'); }
    finally { if(!silent)setLoading(false); }
  },[tc]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ if(!project||!['queued','running'].includes(project.status))return; const timer=setInterval(()=>load(true),2500); return()=>clearInterval(timer); },[project?.status,load]);
  const create=async()=>{ setCreating(true); try{const d=await api.post(`/ai-agent/${tc}/project`,{});setProject(d.project);}catch(e){showToast(e.message,'error');}finally{setCreating(false);} };
  if(loading)return <Page><div style={{...card,textAlign:'center'}}>Загрузка…</div></Page>;
  if(!project)return <Page><Hero onStart={create} busy={creating}/></Page>;
  return <Page><Project project={project} tc={tc} reload={()=>load(true)}/></Page>;
}

function Page({children}) { return <Paywall><div style={{maxWidth:1080,margin:'0 auto',padding:24,color:DARK,fontFamily:"'DM Sans',system-ui,sans-serif"}}>{children}</div></Paywall>; }

function Hero({onStart,busy}) {
  const items=['Анализ конкурентов и их контента','Упаковка канала MAX','Продукты, лид-магниты и воронки','Сайт с геймификацией','Чат-боты и мини-приложения','Контент и сценарии на год','Рассылки и план набора аудитории'];
  return <><div style={{...card,padding:30,background:'linear-gradient(135deg,#17172b,#352a79)',color:'#fff'}}><div style={{fontSize:13,opacity:.75,fontWeight:700,letterSpacing:'.08em'}}>МАРКЕТИНГОВАЯ СИСТЕМА ПОД КЛЮЧ</div><h1 style={{margin:'10px 0 8px',fontSize:34}}>ИИ Агент</h1><p style={{maxWidth:720,lineHeight:1.6,opacity:.88}}>Изучит бизнес и конкурентов, согласует стратегию и создаст рабочие материалы прямо в кабинете.</p><div style={{display:'flex',alignItems:'center',gap:14,marginTop:22,flexWrap:'wrap'}}><button onClick={onStart} disabled={busy} style={{...primary,background:'#fff',color:'#342b78',opacity:busy?.6:1}}>{busy?'Создаю проект…':'Начать подготовку →'}</button><b>{PRICE.toLocaleString('ru-RU')} ИИ-токенов</b><span style={{opacity:.65}}>спишутся только после заполнения брифа</span></div></div><div style={{...card,marginTop:16}}><h2 style={{marginTop:0}}>Что войдёт</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:10}}>{items.map(x=><div key={x} style={{padding:12,borderRadius:10,background:BG}}>✓ {x}</div>)}</div></div></>;
}

function Project({project,tc,reload}) {
  const {showToast}=useToast();
  const [brief,setBrief]=useState(project.brief_json||{}),[saving,setSaving]=useState(false),[starting,setStarting]=useState(false);
  const [url,setUrl]=useState(''),[category,setCategory]=useState('business'),[addingUrl,setAddingUrl]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(0),[uploading,setUploading]=useState(false);
  const editable=project.status==='draft';
  useEffect(()=>setBrief(project.brief_json||{}),[project.id]);
  const complete=useMemo(()=>['niche','business','audience','goal'].filter(k=>(brief[k]||'').trim()).length,[brief]);
  const save=async()=>{setSaving(true);try{await api.put(`/ai-agent/${tc}/project/${project.id}/brief`,{brief});showToast('Бриф сохранён');await reload();return true;}catch(e){showToast(e.message,'error');return false;}finally{setSaving(false);}};
  const addUrl=async()=>{if(!url.trim())return;setAddingUrl(true);try{const d=await api.post(`/ai-agent/${tc}/project/${project.id}/source-url`,{url:url.trim(),category});setUrl('');await reload();showToast(d.warning?'Ссылка сохранена; соцсеть ограничила автоматическое чтение':'Страница загружена');}catch(e){showToast(e.message,'error');}finally{setAddingUrl(false);}};
  const upload=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setUploading(true);setUploadProgress(0);const fd=new FormData();fd.append('file',file);fd.append('category',category);try{await api.upload(`/ai-agent/${tc}/project/${project.id}/source-file`,fd,'POST',setUploadProgress);showToast('Файл загружен и разобран');await reload();}catch(err){showToast(err.message,'error');}finally{setUploading(false);setUploadProgress(0);}};
  const remove=async id=>{try{await api.delete(`/ai-agent/${tc}/project/${project.id}/source/${id}`);await reload();}catch(e){showToast(e.message,'error');}};
  const start=async()=>{if(!(await save()))return;setStarting(true);try{await api.post(`/ai-agent/${tc}/project/${project.id}/start`,{});showToast('ИИ Агент запущен');await reload();}catch(e){showToast(e.message,'error');}finally{setStarting(false);}};
  return <><div style={{...card,marginBottom:16}}><div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><div style={{color:ACCENT,fontWeight:800,fontSize:13}}>ИИ АГЕНТ · ПРОЕКТ #{project.id}</div><h1 style={{margin:'5px 0 2px'}}>{stageName(project.current_stage)}</h1><div style={{color:MUTED}}>{statusName(project.status)}</div></div><div style={{fontSize:22,fontWeight:800}}>{project.tokens_charged?`${project.tokens_charged} ИИт оплачено`:`${PRICE} ИИт`}</div></div><div style={{height:10,background:'#eceefa',borderRadius:99,marginTop:18,overflow:'hidden'}}><div style={{height:'100%',width:`${project.progress||0}%`,background:`linear-gradient(90deg,${ACCENT},#32b8ff)`,transition:'width .4s'}}/></div>{project.error_message&&<div style={{marginTop:12,color:'#b91c1c'}}>{project.error_message}</div>}</div>
  {editable&&<><section style={{...card,marginBottom:16}}><h2 style={{marginTop:0}}>1. Бриф <span style={{color:MUTED,fontSize:14,fontWeight:500}}>обязательные поля {complete}/4</span></h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>{FIELDS.map(([key,label,placeholder])=><label key={key} style={{fontSize:13,fontWeight:700}}>{label}<textarea value={brief[key]||''} onChange={e=>setBrief(p=>({...p,[key]:e.target.value}))} placeholder={placeholder} rows={3} style={{...input,display:'block',marginTop:6,resize:'vertical',fontWeight:400}}/></label>)}</div><button onClick={save} disabled={saving} style={{...primary,marginTop:16}}>{saving?'Сохраняю…':'Сохранить бриф'}</button></section>
  <section style={{...card,marginBottom:16}}><h2 style={{marginTop:0}}>2. Сайты, соцсети и файлы</h2><p style={{color:MUTED}}>Вставьте сайт, канал, группу VK или страницу конкурента. Для товаров загрузите CSV/XML либо ссылку на каталог.</p><select value={category} onChange={e=>setCategory(e.target.value)} style={{...input,maxWidth:260,marginBottom:10}}>{CATEGORIES.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUrl()} placeholder="https://site.ru или https://vk.com/group" style={{...input,flex:'1 1 420px'}}/><button onClick={addUrl} disabled={addingUrl} style={primary}>{addingUrl?'Читаю…':'Добавить ссылку'}</button></div><label style={{display:'inline-flex',marginTop:12,cursor:'pointer',padding:'11px 15px',border:`1px dashed ${ACCENT}`,borderRadius:10,color:ACCENT,fontWeight:700}}>📎 Загрузить CSV, XML, JSON, TXT, MD или PDF<input type="file" accept=".csv,.xml,.json,.txt,.md,.pdf" onChange={upload} disabled={uploading} hidden/></label>{uploading&&<div style={{marginTop:12}}><UploadProgress progress={uploadProgress} label="Загрузка и обработка файла…"/></div>}<div style={{display:'grid',gap:8,marginTop:14}}>{(project.sources||[]).map(s=><div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:11,borderRadius:10,background:BG}}><span>{s.source_type==='url'?'🌐':s.category==='products'?'📦':'📎'}</span><div style={{minWidth:0,flex:1}}><b>{s.title||s.file_name||s.source_url}</b><div style={{color:MUTED,fontSize:12,overflow:'hidden',textOverflow:'ellipsis'}}>{CATEGORIES.find(x=>x[0]===s.category)?.[1]} · {s.status==='link_only'?'ссылка сохранена':'данные прочитаны'}</div></div><button onClick={()=>remove(s.id)} style={{border:0,background:'transparent',cursor:'pointer',fontSize:18}}>×</button></div>)}</div></section>
  <section style={{...card,borderColor:'#c9c4ff'}}><h2 style={{marginTop:0}}>3. Запуск анализа</h2><p style={{color:MUTED,lineHeight:1.6}}>После запуска спишется один раз <b>{PRICE} ИИ-токенов</b>. Внутри проекта дополнительные списания не производятся.</p><button onClick={start} disabled={starting||complete<4} style={{...primary,opacity:(starting||complete<4) ? 0.5 : 1}}>{starting?'Запускаю…':`Запустить ИИ Агента за ${PRICE} ИИт →`}</button></section></>}
  {!editable&&<Results project={project}/>}</>;
}

function Results({project}) { const active=['queued','running'].includes(project.status);return <div style={{display:'grid',gap:14}}>{active&&<div style={card}><h2 style={{marginTop:0}}>Агент работает</h2><p style={{color:MUTED}}>Можно закрыть страницу — этапы выполняются в фоне, прогресс сохранится.</p></div>}{(project.deliverables||[]).map(d=><article key={d.id} style={card}><div style={{color:'#0f9f6e',fontSize:12,fontWeight:800}}>ГОТОВО</div><h2>{d.title}</h2><div style={{whiteSpace:'pre-wrap',lineHeight:1.65,fontSize:14}}>{d.content_text}</div></article>)}{(project.activity||[]).length>0&&<div style={card}><h3 style={{marginTop:0}}>Журнал</h3>{project.activity.slice(0,10).map(x=><div key={x.id} style={{padding:'8px 0',borderBottom:`1px solid ${BORDER}`,fontSize:13}}><b>{x.message}</b> <span style={{color:MUTED}}>{new Date(x.created_at).toLocaleString('ru-RU')}</span></div>)}</div>}</div>; }
function stageName(stage){return({brief:'Подготовка проекта',research:'Анализ источников',strategy:'Формирование стратегии',strategy_approval:'Стратегия готова'})[stage]||'ИИ Агент';}
function statusName(status){return({draft:'Заполните бриф и добавьте источники',queued:'Задача поставлена в очередь',running:'Агент выполняет исследование',awaiting_approval:'Результаты готовы к проверке',failed:'Выполнение остановлено из-за ошибки'})[status]||status;}
