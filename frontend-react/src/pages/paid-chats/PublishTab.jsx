export default function PublishTab({ posts, openPostCreate, openPostEdit, deletePost, publishPost, publishingPostId }) {
  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Публикации</h2>
        <button className="btn btn-primary" onClick={openPostCreate}>+ Создать пост</button>
      </div>
      <div className="pc-info-box">
        <strong>Как это работает:</strong>
        <ol>
          <li>Создайте пост — укажите текст, кнопку и прикрепите картинку</li>
          <li>К посту автоматически добавится кнопка со ссылкой на бота</li>
          <li>Нажмите «Опубликовать» — пост будет отправлен в канал</li>
        </ol>
      </div>
      {posts.length === 0 && <p className="pc-empty">Постов пока нет. Создайте первый пост.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.map(post => (
          <div key={post.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{post.title || 'Без названия'}</span>
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4,
                    background: post.status === 'published' ? '#2a9d8f' : '#3b82f6', color: '#fff',
                  }}>
                    {post.status === 'published' ? 'Опубликован' : 'Черновик'}
                  </span>
                </div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 6, maxHeight: 80, overflow: 'hidden', lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: post.message_text?.substring(0, 150) || '' }}
                />
                <div style={{ display: 'flex', gap: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {post.chat_title && <span>Чат: {post.chat_title}</span>}
                  {post.file_type && <span>📎 {post.file_type}</span>}
                  <span>
                    {post.published_at
                      ? `Опубликован: ${new Date(post.published_at).toLocaleString('ru-RU')}`
                      : `Создан: ${new Date(post.created_at).toLocaleDateString('ru-RU')}`}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openPostEdit(post)}>Ред.</button>
                <button
                  className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => publishPost(post)}
                  disabled={publishingPostId === post.id}
                >
                  {publishingPostId === post.id ? '...' : 'Опубликовать'}
                </button>
                <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => deletePost(post)}>Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
