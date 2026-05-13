/**
 * Блог сервиса — главная страница со списком статей и категориями.
 * Также используется для /blog/category/<slug>.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useBlogYandexMetrika } from '../../hooks/useBlogYandexMetrika';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

export default function BlogIndexPage() {
  useBlogYandexMetrika();
  const { categorySlug } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const currentCat = useMemo(
    () => categories.find(c => c.slug === categorySlug),
    [categories, categorySlug],
  );

  useEffect(() => {
    api.get('/blog/categories').then(d => { if (d?.success) setCategories(d.categories || []); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = categorySlug
      ? `/blog/articles?category=${encodeURIComponent(categorySlug)}&page=${page}&limit=12`
      : `/blog/articles?page=${page}&limit=12`;
    api.get(url).then(d => {
      if (d?.success) { setArticles(d.articles || []); setTotal(d.total || 0); }
    }).finally(() => setLoading(false));
  }, [categorySlug, page]);

  // Document title
  useEffect(() => {
    document.title = currentCat
      ? `${currentCat.name} — Блог PK Business`
      : 'Блог — PK Business';
  }, [currentCat]);

  const pageCount = Math.ceil(total / 12);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <BlogHeader />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 80px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: DARK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          {currentCat ? currentCat.name : 'Блог сервиса PK Business'}
        </h1>
        <p style={{ fontSize: '0.96rem', color: MUTED, margin: '0 0 28px', maxWidth: 720 }}>
          {currentCat?.description || 'Гайды, кейсы и инструкции по работе с каналами в мессенджере MAX. Как привлекать подписчиков, монетизировать аудиторию и использовать ИИ для роста канала.'}
        </p>

        {/* Категории — pill-навигация */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          <Link to="/blog" style={pillStyle(!categorySlug)}>
            Все статьи {total > 0 && !categorySlug && <span style={{ opacity: 0.7 }}>· {total}</span>}
          </Link>
          {categories.map(c => (
            <Link key={c.slug} to={`/blog/category/${c.slug}`} style={pillStyle(c.slug === categorySlug)}>
              {c.name}
              {c.article_count > 0 && <span style={{ opacity: 0.7, marginLeft: 6 }}>· {c.article_count}</span>}
            </Link>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: MUTED }}>Загружаем…</div>
        ) : articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div style={{
              display: 'grid', gap: 20,
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}>
              {articles.map(a => <ArticleCard key={a.id} a={a} />)}
            </div>

            {pageCount > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 32 }}>
                <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0); }}
                  style={navBtn(page <= 1)}>← Назад</button>
                <span style={{ padding: '10px 16px', color: MUTED }}>{page} / {pageCount}</span>
                <button disabled={page >= pageCount} onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}
                  style={navBtn(page >= pageCount)}>Дальше →</button>
              </div>
            )}
          </>
        )}
      </div>

      <BlogFooter />
    </div>
  );
}

export function BlogHeader() {
  return (
    <header style={{
      borderBottom: `1px solid ${BORDER}`, background: '#fff',
      position: 'sticky', top: 0, zIndex: 50,
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <Link to="/blog" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 10px ${ACCENT}40`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: DARK, lineHeight: 1.1 }}>PK Business</div>
            <div style={{ fontSize: '0.7rem', color: MUTED }}>Блог</div>
          </div>
        </Link>
        <a href="/login" style={{
          padding: '8px 16px', borderRadius: 10, fontSize: '0.86rem', fontWeight: 600,
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          color: '#fff', textDecoration: 'none',
          boxShadow: `0 3px 10px ${ACCENT}30`,
        }}>Войти →</a>
      </div>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '40px 20px', background: '#fafbfc' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, color: MUTED, fontSize: '0.85rem' }}>
        <div>© PK Business · MAXМаркетинг</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link to="/blog" style={{ color: MUTED, textDecoration: 'none' }}>Блог</Link>
          <a href="/promo" style={{ color: MUTED, textDecoration: 'none' }}>О сервисе</a>
          <a href="/login" style={{ color: MUTED, textDecoration: 'none' }}>Войти</a>
        </div>
      </div>
    </footer>
  );
}

function ArticleCard({ a }) {
  return (
    <Link to={`/blog/${a.slug}`} style={{
      display: 'flex', flexDirection: 'column',
      borderRadius: 14, border: `1px solid ${BORDER}`,
      overflow: 'hidden', background: '#fff',
      textDecoration: 'none', color: 'inherit',
      transition: 'transform .15s ease, box-shadow .15s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{
        aspectRatio: '16/9', overflow: 'hidden',
        background: a.cover_image_url ? `url(${a.cover_image_url}) center/cover` : `linear-gradient(135deg, ${ACCENT}20, ${ACCENT2}30)`,
      }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {a.category_name && (
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, color: ACCENT,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{a.category_name}</span>
        )}
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: DARK, lineHeight: 1.35 }}>
          {a.title}
        </h3>
        {a.excerpt && (
          <p style={{ margin: 0, fontSize: '0.86rem', color: MUTED, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.excerpt}
          </p>
        )}
        <div style={{ marginTop: 'auto', fontSize: '0.74rem', color: MUTED, paddingTop: 8 }}>
          {fmtDate(a.published_at)} · {a.views_count} {plurViews(a.views_count)}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 14 }}>
      <div style={{ fontSize: '2.6rem', marginBottom: 12 }}>📝</div>
      <p style={{ margin: 0 }}>В этом разделе пока нет статей</p>
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: '8px 16px', borderRadius: 20,
    fontSize: '0.84rem', fontWeight: 600, textDecoration: 'none',
    background: active ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : '#fff',
    color: active ? '#fff' : DARK,
    border: active ? 'none' : `1px solid ${BORDER}`,
    boxShadow: active ? `0 3px 10px ${ACCENT}30` : 'none',
    transition: 'all .15s ease',
  };
}

function navBtn(disabled) {
  return {
    padding: '10px 18px', borderRadius: 10,
    background: disabled ? '#f3f4f6' : '#fff', color: disabled ? '#9ca3af' : DARK,
    border: `1px solid ${BORDER}`, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.86rem', fontWeight: 600,
  };
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return ''; }
}

function plurViews(n) {
  const v = n || 0;
  const last = v % 10;
  const teen = v % 100;
  if (teen >= 11 && teen <= 14) return 'просмотров';
  if (last === 1) return 'просмотр';
  if (last >= 2 && last <= 4) return 'просмотра';
  return 'просмотров';
}
