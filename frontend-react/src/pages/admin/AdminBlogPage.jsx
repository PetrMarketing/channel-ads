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
  { id: 'articles',    label: 'Статьи' },
  { id: 'screenshots', label: 'Скриншоты' },
  { id: 'missing',     label: 'Нужны скрины' },
  { id: 'categories',  label: 'Категории' },
  { id: 'overview',    label: 'Сводка' },
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
      {tab === 'screenshots' && <ScreenshotsTab />}
      {tab === 'missing' && <MissingScreenshotsTab />}
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
  const [showScreenshots, setShowScreenshots] = useState(false);
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
            <ToolbarBtn onClick={() => setShowScreenshots(true)}>🖼 Из библиотеки</ToolbarBtn>
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

      {showScreenshots && (
        <ScreenshotPicker
          onClose={() => setShowScreenshots(false)}
          onPick={(s) => {
            // Вставляем тег с маркером — src/alt подставятся при рендере статьи.
            // src здесь нужен только для предпросмотра в редакторе.
            insertHtml(`<img data-screenshot-slug="${s.slug}" src="${s.file_url}" alt="${(s.alt_text || s.title || '').replace(/"/g, '&quot;')}" />`);
            setShowScreenshots(false);
          }}
        />
      )}
    </div>
  );
}

// Модалка выбора скриншота из библиотеки
function ScreenshotPicker({ onClose, onPick }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    adminApi.get('/blog/screenshots').then(d => setItems(d?.screenshots || []));
  }, []);
  const filtered = useMemo(() => {
    const list = items || [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(i => (i.title || '').toLowerCase().includes(s)
      || (i.slug || '').toLowerCase().includes(s)
      || (i.description || '').toLowerCase().includes(s));
  }, [items, q]);
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 760, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0 }}>Библиотека скриншотов</h4>
          <button onClick={onClose} style={btnOutline}>Закрыть</button>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          Выбранный скриншот вставится с привязкой по slug. Если потом загрузишь новый файл — он автоматически обновится во всех статьях.
        </p>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Поиск по названию или slug…" style={input} autoFocus />
        {!items ? <div style={emptyState}>Загрузка…</div>
          : filtered.length === 0 ? <div style={emptyState}>Нет скриншотов. Добавь их во вкладке «Скриншоты».</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {filtered.map(s => (
                <button key={s.id} onClick={() => onPick(s)} style={{
                  border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff',
                  padding: 8, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <img src={s.file_url} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 6, background: '#f3f4f6' }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.slug}</div>
                </button>
              ))}
            </div>
          )}
      </div>
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

// ============== Screenshots library ==============
function ScreenshotsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [usages, setUsages] = useState(null); // { screenshot, articles }
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminApi.get('/blog/screenshots').then(d => {
      if (d?.success) setItems(d.screenshots || []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(i => (i.title || '').toLowerCase().includes(s)
      || (i.slug || '').toLowerCase().includes(s)
      || (i.description || '').toLowerCase().includes(s));
  }, [items, q]);

  const del = async (s) => {
    const msg = s.usage_count > 0
      ? `Удалить «${s.title}»? Используется в ${s.usage_count} статьях — там скриншот пропадёт.`
      : `Удалить «${s.title}»?`;
    if (!confirm(msg)) return;
    try { await adminApi.delete(`/blog/screenshots/${s.id}`); load(); } catch (e) { alert(e?.message); }
  };

  const showUsages = async (s) => {
    try {
      const d = await adminApi.get(`/blog/screenshots/${s.id}/usages`);
      if (d?.success) setUsages({ screenshot: d.screenshot, articles: d.articles });
    } catch (e) { alert(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию / slug…"
          style={{ ...input, marginBottom: 0, maxWidth: 320 }} />
        <button style={btnPrimary} onClick={() => setEditing({ title: '', slug: '', description: '', file_url: '', alt_text: '' })}>
          + Добавить скриншот
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, padding: 10, background: '#f9fafb', borderRadius: 8 }}>
        💡 Скриншоты переиспользуются в статьях через тег <code>&lt;img data-screenshot-slug="..."&gt;</code>.
        Если заменишь файл — он сразу обновится во всех статьях, где этот скриншот вставлен.
      </div>

      {loading ? <div style={emptyState}>Загрузка…</div>
        : filtered.length === 0 ? <div style={emptyState}>Скриншотов пока нет</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {filtered.map(s => (
              <div key={s.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <img src={s.file_url} alt={s.alt_text || ''} style={{
                  width: '100%', aspectRatio: '16/9', objectFit: 'cover',
                  background: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
                }} />
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#1a1a2e' }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 6 }}>slug: {s.slug}</div>
                  {s.description && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, lineHeight: 1.4 }}>{s.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <button onClick={() => showUsages(s)} style={{
                      ...badge(s.usage_count > 0 ? '#dcfce7' : '#f3f4f6', s.usage_count > 0 ? '#166534' : '#6b7280'),
                      cursor: 'pointer', border: 'none',
                    }}>
                      📰 {s.usage_count} {plurArticles(s.usage_count)}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditing(s)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11, flex: 1 }}>Изменить</button>
                    <button onClick={() => del(s)} style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {editing && (
        <ScreenshotEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {usages && (
        <div style={modalOverlay} onClick={() => setUsages(null)}>
          <div style={{ ...modalBox, maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 4px' }}>Где используется: {usages.screenshot.title}</h4>
            <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 12 }}>{usages.screenshot.slug}</div>
            {usages.articles.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13, padding: 14 }}>Скриншот пока не используется ни в одной статье.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {usages.articles.map(a => (
                  <a key={a.id} href={a.status === 'published' ? `/blog/${a.slug}` : '#'} target="_blank" rel="noreferrer"
                    style={{ display: 'block', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', color: '#1a1a2e' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      {a.category_name || '—'} · <span style={{ color: a.status === 'published' ? '#16a34a' : '#9ca3af' }}>{STATUS_META[a.status]?.label || a.status}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setUsages(null)} style={btnOutline}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScreenshotEditor({ editing, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: editing.id || null,
    title: editing.title || '',
    slug: editing.slug || '',
    description: editing.description || '',
    file_url: editing.file_url || '',
    alt_text: editing.alt_text || '',
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const d = await adminApi.upload('/upload', fd);
      if (d?.success) setForm(p => ({ ...p, file_url: d.url }));
    } catch (e) { alert(e?.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    if (!form.title.trim() || !form.file_url) { alert('Нужно название и файл'); return; }
    setBusy(true);
    try {
      if (form.id) await adminApi.put(`/blog/screenshots/${form.id}`, form);
      else await adminApi.post('/blog/screenshots', form);
      onSaved();
    } catch (e) { alert(e?.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalBox, maxWidth: 540 }}>
        <h4 style={{ margin: '0 0 12px' }}>{form.id ? `Изменить скриншот #${form.id}` : 'Новый скриншот'}</h4>

        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>Файл *</label>
          {form.file_url ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <img src={form.file_url} alt="" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} style={btnOutline}>↻ Заменить файл</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{
              padding: '12px 18px', borderRadius: 10, border: '1px dashed #4361ee',
              background: '#eef2ff', color: '#4361ee', fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>{busy ? 'Загружаем…' : '📤 Загрузить скриншот'}</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => upload(e.target.files?.[0])} />
        </div>

        <Field label="Название (для поиска в библиотеке) *" v={form.title}
          onChange={v => setForm(p => ({ ...p, title: v, slug: p.slug || autoSlug(v) }))} />
        <Field label="Slug (стабильный идентификатор)" v={form.slug}
          onChange={v => setForm(p => ({ ...p, slug: v }))} mono
          placeholder="например: max-create-channel-step1" />
        <Field label="Описание (что на скриншоте — для админа)" v={form.description}
          onChange={v => setForm(p => ({ ...p, description: v }))} multiline rows={2} />
        <Field label="Alt-текст (для SEO/доступности)" v={form.alt_text}
          onChange={v => setForm(p => ({ ...p, alt_text: v }))}
          placeholder="например: Кнопка «Создать канал» в мессенджере MAX" />

        {form.id && (
          <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            ⚠️ Изменения файла или alt-текста сразу применятся ко всем статьям, где используется этот скриншот.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <button onClick={onClose} style={btnOutline}>Отмена</button>
          <button onClick={save} disabled={busy} style={btnPrimary}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

// ============== Missing screenshots ==============
// Список slug-ов которые упоминаются в статьях, но ещё не загружены.
// У каждой записи есть встроенная форма загрузки — slug уже подставлен.
function MissingScreenshotsTab() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => {
    adminApi.get('/blog/missing-screenshots').then(d => {
      if (d?.success) setItems(d.missing || []);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (items === null) return <div style={emptyState}>Загрузка…</div>;
  if (items.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>
          Все скриншоты из статей загружены
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', padding: 10, borderRadius: 8, marginBottom: 12 }}>
        💡 Слева название, справа кнопка <b>«Выбрать файл»</b> — выбираешь скрин и он СРАЗУ загружается и пропадает из списка. Сверху самые востребованные.
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {items.map((it, i) => (
          <MissingRow key={it.slug} item={it} isLast={i === items.length - 1} onDone={load} />
        ))}
      </div>
    </div>
  );
}

// Одна строка списка — название + кнопка «Файл». Файл выбирается и сразу
// отправляется (без отдельной кнопки «Сохранить»).
function MissingRow({ item, isLast, onDone }) {
  const [state, setState] = useState('idle'); // idle | uploading | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setState('uploading'); setErrorMsg('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await adminApi.upload('/upload', fd);
      if (!up?.success) throw new Error('Не удалось загрузить файл');
      const title = slugToTitle(item.slug);
      const r = await adminApi.post('/blog/screenshots', {
        slug: item.slug,
        title,
        alt_text: title,
        file_url: up.url,
      });
      if (!r?.success) throw new Error('Не удалось сохранить скриншот');
      setState('done');
      // Через секунду перезагружаем — строка пропадёт
      setTimeout(onDone, 800);
    } catch (e) {
      setState('error');
      setErrorMsg(e?.message || 'Ошибка');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
      background: state === 'done' ? '#f0fdf4' : 'transparent',
      transition: 'background 0.3s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 3, lineHeight: 1.4 }}>
          {item.description_ru || slugToTitle(item.slug)}
        </div>
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#9ca3af',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.slug} · в {item.usage_count} {plurArticles(item.usage_count)}
        </div>
      </div>

      {state === 'done' ? (
        <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ Загружено</span>
      ) : state === 'uploading' ? (
        <span style={{ fontSize: 12, color: '#6b7280' }}>Загружаем…</span>
      ) : (
        <>
          {state === 'error' && (
            <span style={{ fontSize: 11, color: '#dc2626', maxWidth: 180, textAlign: 'right' }}>
              {errorMsg}
            </span>
          )}
          <button onClick={() => fileRef.current?.click()} style={{
            ...btnPrimary, padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap',
          }}>📤 Выбрать файл</button>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}

function slugToTitle(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}

function plurArticles(n) {
  const v = n || 0;
  const last = v % 10;
  const teen = v % 100;
  if (teen >= 11 && teen <= 14) return 'статьях';
  if (last === 1) return 'статья';
  if (last >= 2 && last <= 4) return 'статьи';
  return 'статьях';
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
