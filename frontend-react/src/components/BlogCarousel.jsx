/**
 * Горизонтальная карусель свежих статей блога — для страницы «Обзор» (Dashboard).
 * Подгружает до 20 опубликованных статей и крутит их с прокруткой/стрелками.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function BlogCarousel() {
  const [items, setItems] = useState(null);
  const trackRef = useRef(null);

  useEffect(() => {
    api.get('/blog/articles?limit=20').then(d => {
      if (d?.success) setItems(d.articles || []);
      else setItems([]);
    }).catch(() => setItems([]));
  }, []);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  if (items === null) return null; // тихая загрузка
  if (items.length === 0) return null;

  return (
    <section style={{
      marginTop: 32,
      padding: '24px 0 8px',
      borderTop: '1px solid var(--border, #e5e7eb)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 16, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em',
            color: 'var(--accent, #4361ee)', textTransform: 'uppercase', marginBottom: 4,
          }}>📖 Блог MAX Маркетинг</div>
          <h2 style={{
            margin: 0, fontSize: '1.4rem', fontWeight: 700,
            color: 'var(--text-primary, #1a1a2e)', letterSpacing: '-0.02em',
          }}>Свежее в блоге</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link to="/blog" style={{
            fontSize: '0.85rem', color: 'var(--accent, #4361ee)',
            textDecoration: 'none', fontWeight: 600, marginRight: 6,
          }}>Все статьи →</Link>
          <button onClick={() => scroll(-1)} aria-label="Назад" style={btnStyle}>‹</button>
          <button onClick={() => scroll(1)} aria-label="Вперёд" style={btnStyle}>›</button>
        </div>
      </div>

      <div
        ref={trackRef}
        style={{
          display: 'flex', gap: 14, overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', paddingBottom: 14,
          scrollbarWidth: 'thin',
        }}
        className="blog-carousel-track"
      >
        {items.map(a => <Card key={a.id} a={a} />)}
      </div>

      <style>{`
        .blog-carousel-track::-webkit-scrollbar { height: 6px; }
        .blog-carousel-track::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
        .blog-carousel-track::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </section>
  );
}

function Card({ a }) {
  return (
    <Link to={`/blog/${a.slug}`} style={{
      flex: '0 0 280px', scrollSnapAlign: 'start',
      display: 'flex', flexDirection: 'column',
      borderRadius: 12, border: '1px solid var(--border, #e5e7eb)',
      overflow: 'hidden', background: 'var(--bg-card, #fff)',
      textDecoration: 'none', color: 'inherit',
      transition: 'transform .15s ease, box-shadow .15s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{
        aspectRatio: '16/9',
        background: a.cover_image_url
          ? `url(${a.cover_image_url}) center/cover`
          : 'linear-gradient(135deg, #4361ee20, #7b68ee30)',
      }} />
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {a.category_name && (
          <span style={{
            fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent, #4361ee)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{a.category_name}</span>
        )}
        <div style={{
          fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.35,
          color: 'var(--text-primary, #1a1a2e)',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{a.title}</div>
        {a.excerpt && (
          <div style={{
            fontSize: '0.74rem', color: 'var(--text-secondary, #6b7280)', lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{a.excerpt}</div>
        )}
      </div>
    </Link>
  );
}

const btnStyle = {
  width: 32, height: 32, borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--bg-card, #fff)',
  color: 'var(--text-primary, #1a1a2e)',
  fontSize: 18, lineHeight: 1, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
