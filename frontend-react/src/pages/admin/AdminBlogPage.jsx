/**
 * Админка блога — список статей, категории, редактор.
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';

const STATUS_META = {
  draft:     { label: 'Черновик',  bg: '#f3f4f6', fg: '#6b7280' },
  published: { label: 'Опубликована', bg: '#dcfce7', fg: '#166534' },
  archived:  { label: 'Архив',     bg: '#fef3c7', fg: '#92400e' },
};

const TABS = [
  { id: 'articles',   label: 'Статьи' },
  { id: 'categories', label: 'Категории' },
  { id: 'overview',   label: 'Сводка' },
];

export default function AdminBlogPage() {
  const [tab, setTab] = useState('articles');
  return (
    <div>
      <h1 style={{ ...pageTitle, marginBottom: 16 }}>Блог</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
            background: tab === t.id ? '#4361ee' : '#f3f4f6',
            color: tab === t.id ? '#fff' : '#6b7280',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'articles' && <ArticlesTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'overview' && <OverviewTab />}
    </div>
  );
}

// ============== Articles ==============
function ArticlesTab() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const url = '/blog/articles' + (statusFilter ? `?status=${statusFilter}` : '');
    adminApi.get(url).then(d => {
      if (d?.success) setArticles(d.articles || []);
    }).finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminApi.get('/blog/categories').then(d => { if (d?.success) setCategories(d.categories || []); });
  }, []);

  const del = async (a) => {
    if (!confirm(`Удалить статью «${a.title}»?`)) return;
    try { await adminApi.delete(`/blog/articles/${a.id}`); load(); } catch (e) { alert(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Статус:</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
            <option value="">Все</option>
            <option value="draft">Черновики</option>
            <option value="published">Опубликованы</option>
            <option value="archived">Архив</option>
          </select>
        </div>
        <button style={btnPrimary} onClick={() => setEditing({ status: 'draft', tags: [] })}>+ Новая статья</button>
      </div>

      {loading ? <div style={emptyState}>Загрузка…</div>
        : articles.length === 0 ? <div style={emptyState}>Статей нет</div>
        : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Заголовок</th>
                <th style={th}>Категория</th>
                <th style={th}>Статус</th>
                <th style={th}>Скрин-ты</th>
                <th style={th}>Просмотры</th>
                <th style={th}>CTA</th>
                <th style={th}>Опубликована</th>
                <th style={th}>Действия</th>
              </tr></thead>
              <tbody>{articles.map(a => {
                const sm = STATUS_META[a.status] || STATUS_META.draft;
                const imgs = a.img_count || 0;
                return (
                  <tr key={a.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>/blog/{a.slug}</div>
                    </td>
                    <td style={td}>{a.category_name || '—'}</td>
                    <td style={td}><span style={badge(sm.bg, sm.fg)}>{sm.label}</span></td>
                    <td style={td}>
                      {imgs === 0 && a.status === 'published' ? (
                        <span title="Скриншоты не вставлены"
                          style={badge('#fee2e2', '#991b1b')}>⚠️ нет</span>
                      ) : (
                        <span style={{ fontSize: 13 }}>{imgs}</span>
                      )}
                    </td>
                    <td style={td}><b>{a.views_count}</b></td>
                    <td style={td}><b>{a.clicks_count}</b></td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {a.published_at ? fmtDate(a.published_at) : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => loadAndEdit(a.id, setEditing)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>Изменить</button>
                        {a.status === 'published' && (
                          <a href={`/blog/${a.slug}`} target="_blank" rel="noreferrer"
                            style={{ ...btnOutline, padding: '4px 10px', fontSize: 11, textDecoration: 'none' }}>↗ Открыть</a>
                        )}
                        <button onClick={() => del(a)} style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}

      {editing && (
        <ArticleEditor
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

async function loadAndEdit(id, setEditing) {
  try {
    const d = await adminApi.get(`/blog/articles/${id}`);
    if (d?.success) setEditing(d.article);
  } catch (e) { alert(e?.message); }
}

// ============== Article Editor ==============
function ArticleEditor({ editing, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: editing.id || null,
    category_id: editing.category_id || '',
    slug: editing.slug || '',
    title: editing.title || '',
    excerpt: editing.excerpt || '',
    meta_title: editing.meta_title || '',
    meta_description: editing.meta_description || '',
    cover_image_url: editing.cover_image_url || '',
    body: editing.body || '',
    tags: editing.tags || [],
    status: editing.status || 'draft',
  });
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRutube, setShowRutube] = useState(false);
  const editorRef = useRef(null);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Кол-во картинок в теле
  const imgCount = useMemo(() => {
    const m = (form.body || '').match(/<img\s/gi);
    return m ? m.length : 0;
  }, [form.body]);

  const save = async (newStatus) => {
    if (!form.title.trim()) { alert('Заголовок обязателен'); return; }
    if (newStatus === 'published' && imgCount === 0) {
      if (!confirm('⚠️ В статье нет скриншотов. Опубликовать всё равно?')) return;
    }
    setBusy(true);
    try {
      const payload = { ...form, status: newStatus || form.status };
      if (!payload.category_id) payload.category_id = null;
      if (form.id) {
        await adminApi.put(`/blog/articles/${form.id}`, payload);
      } else {
        await adminApi.post('/blog/articles', payload);
      }
      onSaved();
    } catch (e) { alert(e?.message); }
    finally { setBusy(false); }
  };

  // Загрузка файла → /admin/upload, вставка <img> в тело
  const insertImageFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const d = await adminApi.upload('/upload', fd);
      if (d?.success && d.url) insertHtml(`<img src="${d.url}" alt="" />`);
    } catch (e) { alert(e?.message); }
  };

  // Paste из буфера: ловим картинки
  const onEditorPaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const f = items[i].getAsFile();
        if (f) insertImageFile(f);
        return;
      }
    }
  };

  const insertHtml = (html) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertHTML', false, html);
    update('body', el.innerHTML);
  };

  const insertRutube = (url) => {
    const m = url.match(/rutube\.ru\/video\/([a-z0-9]+)/i);
    if (!m) { alert('Формат: https://rutube.ru/video/<id>/'); return; }
    const embed = `<iframe src="https://rutube.ru/play/embed/${m[1]}" frameborder="0" allow="clipboard-write; autoplay" allowfullscreen></iframe>`;
    insertHtml(embed);
    setShowRutube(false);
  };

  const insertHeading = (level) => {
    const tag = `h${level}`;
    insertHtml(`<${tag}>Заголовок ${level}</${tag}>`);
  };

  const insertScreenshotPlaceholder = () => {
    insertHtml(`<p style="border:2px dashed #cbd5e1; padding:24px; text-align:center; color:#94a3b8; border-radius:10px;">📷 Вставьте скриншот сюда (Ctrl+V из буфера или загрузите файл)</p>`);
  };

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalBox, maxWidth: 920, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {form.id ? `Изменить статью #${form.id}` : 'Новая статья'}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: imgCount === 0 ? '#dc2626' : '#16a34a' }}>
              {imgCount === 0 ? '⚠️ Скриншоты не вставлены' : `🖼 Скриншотов: ${imgCount}`}
            </span>
          </div>
        </div>

        {/* Базовые поля */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <Field label="Заголовок *" v={form.title}
            onChange={v => { update('title', v); if (!form.slug) update('slug', autoSlug(v)); }} />
          <Field label="Slug (URL)" v={form.slug} onChange={v => update('slug', v)} mono />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={fieldLabel}>Категория</label>
            <select value={form.category_id || ''} onChange={e => update('category_id', e.target.value || '')}
              style={input}>
              <option value="">— без категории —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Статус</label>
            <select value={form.status} onChange={e => update('status', e.target.value)} style={input}>
              <option value="draft">Черновик</option>
              <option value="published">Опубликована</option>
              <option value="archived">Архив</option>
            </select>
          </div>
        </div>

        <Field label="Краткое описание (для карточки и meta)" v={form.excerpt}
          onChange={v => update('excerpt', v)} multiline rows={2}
          placeholder="1-2 предложения о чём статья — пойдёт в OG и список" />

        {/* Cover */}
        <CoverPicker value={form.cover_image_url} onChange={v => update('cover_image_url', v)} />

        {/* Toolbar для тела */}
        <div style={{ marginTop: 14 }}>
          <label style={fieldLabel}>Тело статьи (HTML)</label>
          <div style={{
            display: 'flex', gap: 6, padding: 8, background: '#f9fafb',
            border: `1px solid #e5e7eb`, borderBottom: 'none', borderRadius: '10px 10px 0 0',
            flexWrap: 'wrap',
          }}>
            <ToolbarBtn onClick={() => insertHeading(2)}>H2</ToolbarBtn>
            <ToolbarBtn onClick={() => insertHeading(3)}>H3</ToolbarBtn>
            <ToolbarBtn onClick={() => document.execCommand('bold')}><b>B</b></ToolbarBtn>
            <ToolbarBtn onClick={() => document.execCommand('italic')}><i>I</i></ToolbarBtn>
            <ToolbarBtn onClick={() => document.execCommand('insertUnorderedList')}>• список</ToolbarBtn>
            <ToolbarBtn onClick={() => document.execCommand('insertOrderedList')}>1. список</ToolbarBtn>
            <ToolbarBtn onClick={() => {
              const url = prompt('URL ссылки');
              if (url) document.execCommand('createLink', false, url);
            }}>🔗 ссылка</ToolbarBtn>
            <div style={{ width: 1, background: '#d1d5db', margin: '0 4px' }} />
            <ToolbarBtn onClick={() => document.getElementById('blog-img-input')?.click()}>📷 Картинка</ToolbarBtn>
            <input id="blog-img-input" type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) insertImageFile(f); e.target.value = ''; }} />
            <ToolbarBtn onClick={insertScreenshotPlaceholder}>📐 Плейсхолдер скрина</ToolbarBtn>
            <ToolbarBtn onClick={() => setShowRutube(true)}>📺 RuTube видео</ToolbarBtn>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={e => update('body', e.currentTarget.innerHTML)}
            onPaste={onEditorPaste}
            style={{
              minHeight: 320, maxHeight: '50vh', overflowY: 'auto',
              padding: 16, border: '1px solid #e5e7eb', borderRadius: '0 0 10px 10px',
              fontSize: 14, lineHeight: 1.6, outline: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: form.body }}
          />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            💡 Скопируй скрин в буфер и вставь Ctrl+V — загрузится автоматом.
            Для RuTube видео — кнопка «📺».
          </div>
        </div>

        {/* SEO meta */}
        <div style={{ marginTop: 16, padding: 14, background: '#f9fafb', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>SEO meta (необязательно)</div>
          <Field label="Meta title (если пусто — берём заголовок)" v={form.meta_title}
            onChange={v => update('meta_title', v)} />
          <Field label="Meta description" v={form.meta_description}
            onChange={v => update('meta_description', v)} multiline rows={2} />
          <div>
            <label style={fieldLabel}>Теги</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {form.tags.map(t => (
                <span key={t} style={{
                  padding: '4px 10px', borderRadius: 12, background: '#e0e7ff', color: '#3730a3',
                  fontSize: 12, fontWeight: 600,
                }}>
                  #{t} <button onClick={() => update('tags', form.tags.filter(x => x !== t))}
                    style={{ background: 'none', border: 'none', color: '#3730a3', cursor: 'pointer', marginLeft: 4 }}>×</button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  update('tags', [...form.tags, tagInput.trim()]);
                  setTagInput('');
                }
              }} placeholder="Введите тег и нажмите Enter" style={input} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={onClose} style={btnOutline}>Закрыть</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => save('draft')} disabled={busy} style={btnOutline}>💾 Сохранить как черновик</button>
            <button onClick={() => save('published')} disabled={busy} style={{ ...btnPrimary, background: '#16a34a' }}>📢 Опубликовать</button>
          </div>
        </div>
      </div>

      {showRutube && (
        <div style={modalOverlay} onClick={() => setShowRutube(false)}>
          <div style={{ ...modalBox, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 12px' }}>RuTube видео</h4>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Вставьте ссылку вида <code>https://rutube.ru/video/abc123/</code>
            </p>
            <input id="rutube-url" type="url" placeholder="https://rutube.ru/video/..."
              style={input} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') insertRutube(e.target.value); }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setShowRutube(false)} style={btnOutline}>Отмена</button>
              <button onClick={() => insertRutube(document.getElementById('rutube-url').value)} style={btnPrimary}>Вставить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoverPicker({ value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    setBusy(true);
    const fd = new FormData(); fd.append('file', file);
    try { const d = await adminApi.upload('/upload', fd); if (d?.success) onChange(d.url); }
    catch (e) { alert(e?.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <label style={fieldLabel}>Обложка статьи</label>
      {value ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={value} alt="" style={{ width: 160, height: 90, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => ref.current?.click()} style={btnOutline}>↻ Заменить</button>
            <button onClick={() => onChange('')} style={{ ...btnOutline, color: '#dc2626', borderColor: '#fecaca' }}>× Убрать</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => ref.current?.click()} disabled={busy} style={{
            padding: '10px 14px', borderRadius: 10, border: '1px dashed #4361ee',
            background: '#eef2ff', color: '#4361ee', fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>{busy ? 'Загружаем…' : '📤 Выбрать файл'}</button>
          <input type="text" placeholder="или вставьте URL" value={value || ''}
            onChange={e => onChange(e.target.value)} style={input} />
        </div>
      )}
      <input ref={ref} type="file" accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} style={{ display: 'none' }} />
    </div>
  );
}

// ============== Categories ==============
function CategoriesTab() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => adminApi.get('/blog/categories').then(d => { if (d?.success) setItems(d.categories || []); });
  useEffect(() => { load(); }, []);

  const save = async (form) => {
    try {
      if (form.id) await adminApi.put(`/blog/categories/${form.id}`, form);
      else await adminApi.post('/blog/categories', form);
      setEditing(null); load();
    } catch (e) { alert(e?.message); }
  };
  const del = async (c) => {
    if (!confirm(`Удалить «${c.name}»? Статьи внутри останутся (без категории).`)) return;
    try { await adminApi.delete(`/blog/categories/${c.id}`); load(); } catch (e) { alert(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btnPrimary} onClick={() => setEditing({ name: '', slug: '', description: '', sort_order: 0 })}>+ Категория</button>
      </div>
      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Название</th><th style={th}>Slug</th>
            <th style={th}>Статей</th><th style={th}>Действия</th>
          </tr></thead>
          <tbody>{items.map(c => (
            <tr key={c.id}>
              <td style={td}><b>{c.name}</b>{c.description && <div style={{ fontSize: 11, color: '#6b7280' }}>{c.description}</div>}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{c.slug}</td>
              <td style={td}>{c.article_count}</td>
              <td style={td}>
                <button onClick={() => setEditing(c)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11, marginRight: 6 }}>Изменить</button>
                <button onClick={() => del(c)} style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }}>×</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {editing && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h4 style={{ margin: '0 0 12px' }}>{editing.id ? 'Изменить' : 'Новая'} категория</h4>
            <Field label="Название *" v={editing.name} onChange={v => setEditing(p => ({ ...p, name: v, slug: p.slug || autoSlug(v) }))} />
            <Field label="Slug" v={editing.slug || ''} onChange={v => setEditing(p => ({ ...p, slug: v }))} mono />
            <Field label="Описание" v={editing.description || ''} onChange={v => setEditing(p => ({ ...p, description: v }))} multiline rows={2} />
            <Field label="Порядок" v={String(editing.sort_order || 0)} onChange={v => setEditing(p => ({ ...p, sort_order: Number(v) || 0 }))} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={btnOutline}>Отмена</button>
              <button onClick={() => save(editing)} style={btnPrimary}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== Overview ==============
function OverviewTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    adminApi.get('/blog/overview').then(d => { if (d?.success) setData(d); });
  }, []);
  if (!data) return <div style={emptyState}>Загрузка…</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
      <Stat label="Всего статей" value={data.total} />
      <Stat label="Опубликовано" value={data.published} color="#16a34a" />
      <Stat label="Черновиков" value={data.drafts} color="#6b7280" />
      <Stat label="Просмотров" value={data.views} color="#4361ee" />
      <Stat label="CTA-кликов" value={data.cta_clicks} color="#f59e0b" />
      <Stat label="Регистраций из блога" value={data.registrations_from_blog} color="#7c3aed" />
    </div>
  );
}
function Stat({ label, value, color = '#1a1a2e' }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{(value || 0).toLocaleString('ru-RU')}</div>
    </div>
  );
}

// ============== Helpers ==============
const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 };

function Field({ label, v, onChange, multiline, rows, placeholder, mono }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {multiline
        ? <textarea rows={rows || 3} value={v} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={{ ...input, resize: 'vertical', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }} />
        : <input type="text" value={v} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={{ ...input, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }} />}
    </div>
  );
}

function ToolbarBtn({ children, onClick }) {
  return <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick}
    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#1a1a2e' }}>{children}</button>;
}

function autoSlug(s) {
  const tbl = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya' };
  return (s || '').toLowerCase().split('').map(c => tbl[c] !== undefined ? tbl[c] : c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
