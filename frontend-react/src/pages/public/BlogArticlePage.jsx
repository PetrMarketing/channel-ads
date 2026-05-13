/**
 * Страница статьи блога — /blog/<slug>.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { BlogHeader, BlogFooter } from './BlogIndexPage';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

export default function BlogArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true); setNotFound(false);
    api.get(`/blog/articles/${slug}`).then(d => {
      if (d?.success) setArticle(d.article);
      else setNotFound(true);
    }).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [slug]);

  // Document title — даже если SSR-meta уже подставлен, обновим для SPA-навигации
  useEffect(() => {
    if (article?.meta_title || article?.title) {
      document.title = `${article.meta_title || article.title} — PK Business`;
    }
  }, [article]);

  const trackCta = async (target) => {
    try { await api.post(`/blog/articles/${slug}/cta-click`, { target }); } catch {}
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <BlogHeader />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: MUTED }}>Загружаем…</div>
        ) : notFound ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <h2 style={{ color: DARK }}>Статья не найдена</h2>
            <Link to="/blog" style={{ color: ACCENT }}>← Все статьи</Link>
          </div>
        ) : article && (
          <>
            <Link to="/blog" style={{ fontSize: '0.86rem', color: MUTED, textDecoration: 'none' }}>← К списку статей</Link>

            {article.category_name && (
              <div style={{ marginTop: 14 }}>
                <Link to={`/blog/category/${article.category_slug}`} style={{
                  fontSize: '0.74rem', fontWeight: 700, color: ACCENT,
                  textTransform: 'uppercase', letterSpacing: '0.05em', textDecoration: 'none',
                }}>{article.category_name}</Link>
              </div>
            )}

            <h1 style={{
              margin: '8px 0 12px', fontSize: '2.1rem', fontWeight: 800, color: DARK,
              letterSpacing: '-0.025em', lineHeight: 1.2,
            }}>{article.title}</h1>

            <div style={{ fontSize: '0.84rem', color: MUTED, marginBottom: 24 }}>
              {fmtDate(article.published_at)}
              {article.views_count > 0 && <> · {article.views_count} {plurViews(article.views_count)}</>}
            </div>

            {article.cover_image_url && (
              <img src={article.cover_image_url} alt="" style={{
                display: 'block', width: '100%', borderRadius: 14, marginBottom: 28,
              }} />
            )}

            {/* HTML тело статьи + наши стили для img/video/h2/p/etc */}
            <div className="blog-article-body" dangerouslySetInnerHTML={{ __html: article.body || '' }} />

            <style>{`
              .blog-article-body { font-size: 1.06rem; line-height: 1.7; color: ${DARK}; }
              .blog-article-body h2 { font-size: 1.5rem; font-weight: 800; margin: 36px 0 14px; letter-spacing: -0.02em; }
              .blog-article-body h3 { font-size: 1.2rem; font-weight: 700; margin: 28px 0 12px; }
              .blog-article-body p { margin: 14px 0; }
              .blog-article-body ul, .blog-article-body ol { margin: 14px 0; padding-left: 24px; }
              .blog-article-body li { margin: 8px 0; }
              .blog-article-body img { max-width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 10px; }
              .blog-article-body iframe { max-width: 100%; aspect-ratio: 16/9; width: 100%; height: auto; border: none; border-radius: 10px; margin: 20px 0; }
              .blog-article-body a { color: ${ACCENT}; }
              .blog-article-body blockquote { border-left: 3px solid ${ACCENT}; padding: 4px 16px; margin: 20px 0; color: ${MUTED}; font-style: italic; }
              .blog-article-body code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.92em; font-family: ui-monospace, monospace; }
              .blog-article-body pre { background: #f3f4f6; padding: 14px; border-radius: 8px; overflow-x: auto; font-family: ui-monospace, monospace; font-size: 0.92rem; }
            `}</style>

            {/* CTA-блок в конце статьи */}
            <div style={{
              marginTop: 40, padding: '24px 28px', borderRadius: 16,
              background: `linear-gradient(135deg, ${ACCENT}10 0%, ${ACCENT2}14 100%)`,
              border: `1px solid ${ACCENT2}30`,
              textAlign: 'center',
            }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: DARK }}>
                Хотите попробовать в действии?
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '0.94rem', color: MUTED }}>
                Подключите канал MAX к PK Business — 2 дня бесплатно
              </p>
              <a href="/login" onClick={() => trackCta('/login')} style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                color: '#fff', fontWeight: 700, fontSize: '0.94rem',
                textDecoration: 'none', boxShadow: `0 4px 14px ${ACCENT}40`,
              }}>Попробовать бесплатно →</a>
            </div>

            {/* Похожие статьи */}
            {article.related?.length > 0 && (
              <div style={{ marginTop: 48 }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: DARK, margin: '0 0 18px' }}>
                  Похожие статьи
                </h2>
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                  {article.related.map(r => (
                    <Link key={r.slug} to={`/blog/${r.slug}`} style={{
                      padding: 14, borderRadius: 12,
                      border: `1px solid ${BORDER}`, background: '#fff',
                      textDecoration: 'none', color: DARK,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '0.94rem', lineHeight: 1.35, marginBottom: 6 }}>{r.title}</div>
                      {r.excerpt && (
                        <div style={{
                          fontSize: '0.78rem', color: MUTED, lineHeight: 1.45,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>{r.excerpt}</div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BlogFooter />
    </div>
  );
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
