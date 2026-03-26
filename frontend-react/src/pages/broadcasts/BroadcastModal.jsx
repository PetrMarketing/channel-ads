import Modal from '../../components/Modal';
import RichTextEditor from '../../components/RichTextEditor';
import ButtonBuilder from '../../components/ButtonBuilder';
import AttachmentPicker from '../../components/AttachmentPicker';

const FILTER_TYPE_LABELS = {
  all_leads: 'Все лиды',
  lead_magnet: 'Получил лид-магнит',
  registration_date: 'Дата регистрации',
  giveaway_participant: 'Участник розыгрыша',
};

const FILTER_TYPES = Object.keys(FILTER_TYPE_LABELS);

const filterTagStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  position: 'relative',
};

const negateButtonStyle = {
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '1px 6px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1.4,
};

const filterSelectStyle = {
  padding: '3px 8px',
  fontSize: '0.82rem',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const removeButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.1rem',
  lineHeight: 1,
  color: 'var(--text-secondary)',
  padding: '0 2px',
};

const tabButtonStyle = {
  background: 'none',
  border: 'none',
  padding: '8px 16px',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'color 0.2s',
};

const previewContainerStyle = {
  padding: '20px',
  background: 'var(--bg-secondary)',
  borderRadius: '12px',
  minHeight: '120px',
};

const previewBubbleStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '12px 16px',
  maxWidth: '400px',
};

const previewButtonStyle = {
  display: 'inline-block',
  padding: '6px 16px',
  fontSize: '0.82rem',
  borderRadius: '6px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--primary, #3b82f6)',
  textAlign: 'center',
  flex: 1,
};

const statsRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.9rem',
};

export default function BroadcastModal({
  showModal,
  setShowModal,
  editingBc,
  form,
  setForm,
  errors,
  setErrors,
  filterRules,
  updateFilter,
  updateFilterValue,
  removeFilter,
  addFilterType,
  setAddFilterType,
  addFilter,
  bcFile,
  setBcFile,
  recipientCount,
  leadMagnets,
  giveaways,
  modalTab,
  setModalTab,
  messageRef,
  saving,
  handleSave,
  handleSendTest,
  // Stats modal
  showStatsModal,
  setShowStatsModal,
  statsData,
  // Edit sent modal
  showEditSentModal,
  setShowEditSentModal,
  editSentBc,
  editSentText,
  setEditSentText,
  editSentSaving,
  handleEditSentSubmit,
}) {
  const renderFilterTag = (rule, idx) => {
    const label = FILTER_TYPE_LABELS[rule.type] || rule.type;
    return (
      <div key={idx} style={filterTagStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Negate toggle */}
          <button
            type="button"
            onClick={() => updateFilter(idx, { negate: !rule.negate })}
            style={{
              ...negateButtonStyle,
              background: rule.negate ? '#ef4444' : 'var(--bg-secondary)',
              color: rule.negate ? '#fff' : 'var(--text-secondary)',
            }}
            title={rule.negate ? 'Исключение активно' : 'Нажмите для исключения'}
          >
            НЕ
          </button>

          <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>

          {/* Extra controls per type */}
          {rule.type === 'lead_magnet' && (
            <select
              style={filterSelectStyle}
              value={rule.value?.lead_magnet_id || ''}
              onChange={e => updateFilterValue(idx, { lead_magnet_id: e.target.value })}
            >
              <option value="">— Выберите —</option>
              {leadMagnets.map(lm => (
                <option key={lm.id} value={lm.id}>{lm.title}</option>
              ))}
            </select>
          )}

          {rule.type === 'giveaway_participant' && (
            <select
              style={filterSelectStyle}
              value={rule.value?.giveaway_id || ''}
              onChange={e => updateFilterValue(idx, { giveaway_id: e.target.value })}
            >
              <option value="">— Все розыгрыши —</option>
              {giveaways.map(g => (
                <option key={g.id} value={g.id}>{g.title || `Розыгрыш #${g.id}`}</option>
              ))}
            </select>
          )}

          {rule.type === 'registration_date' && (
            <>
              <select
                style={filterSelectStyle}
                value={rule.value?.direction || 'before'}
                onChange={e => updateFilterValue(idx, { direction: e.target.value })}
              >
                <option value="before">до</option>
                <option value="after">после</option>
              </select>
              <input
                type="date"
                style={filterSelectStyle}
                value={rule.value?.date || ''}
                onChange={e => updateFilterValue(idx, { date: e.target.value })}
              />
            </>
          )}

          <button type="button" onClick={() => removeFilter(idx)} style={removeButtonStyle} title="Удалить фильтр">
            &times;
          </button>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    let buttons = [];
    if (form.inline_buttons && form.inline_buttons.trim()) {
      try { buttons = JSON.parse(form.inline_buttons); } catch {}
    }
    return (
      <div style={previewContainerStyle}>
        <div style={previewBubbleStyle}>
          <div
            style={{ fontSize: '0.92rem', lineHeight: 1.55 }}
            dangerouslySetInnerHTML={{ __html: form.message_text || '<span style="color:#999">Нет текста</span>' }}
          />
          {Array.isArray(buttons) && buttons.length > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {buttons.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: '6px' }}>
                  {(Array.isArray(row) ? row : [row]).map((btn, bi) => (
                    <span key={bi} style={previewButtonStyle}>
                      {btn.text || btn.label || 'Кнопка'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {bcFile && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            📎 {bcFile.name}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Edit/Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBc ? 'Редактировать рассылку' : 'Создать рассылку'}>
        {/* Tab toggle */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setModalTab('edit')}
            style={{
              ...tabButtonStyle,
              borderBottom: modalTab === 'edit' ? '2px solid var(--primary)' : '2px solid transparent',
              color: modalTab === 'edit' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            Редактирование
          </button>
          <button
            type="button"
            onClick={() => setModalTab('preview')}
            style={{
              ...tabButtonStyle,
              borderBottom: modalTab === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
              color: modalTab === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            Предпросмотр
          </button>
        </div>

        {modalTab === 'preview' ? (
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Так будет выглядеть сообщение для получателя:
            </div>
            {renderPreview()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Title */}
            <div>
              <label className="form-label">Название</label>
              <input className="form-input" placeholder="Например: Акция на выходные" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <div className="form-hint">Для вашего удобства. Подписчики не увидят название.</div>
            </div>

            {/* Message text — RichTextEditor */}
            <div ref={messageRef}>
              <label className="form-label">Текст сообщения *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст рассылки... Поддерживает HTML: <b>жирный</b>, <i>курсив</i>, <a href='URL'>ссылка</a>"
                  rows={5}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div className="form-hint">Этот текст получат подписчики. Поддерживается HTML-разметка Telegram/MAX.</div>
            </div>

            {/* File attachment */}
            <div>
              <label className="form-label">Вложение</label>
              <AttachmentPicker
                file={bcFile}
                onFileChange={setBcFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingBc?.file_type || ''}
              />
              <div className="form-hint">Фото, видео или документ. Макс. 50 МБ для Telegram, 100 МБ для MAX.</div>
            </div>

            {/* Recipient count */}
            {recipientCount !== null && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                background: recipientCount > 0 ? 'rgba(42,157,143,0.08)' : 'rgba(230,57,70,0.08)',
                border: `1px solid ${recipientCount > 0 ? 'rgba(42,157,143,0.2)' : 'rgba(230,57,70,0.2)'}`,
                fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '1.1rem' }}>{recipientCount > 0 ? '👥' : '⚠️'}</span>
                <span>Получателей: <strong>{recipientCount}</strong></span>
              </div>
            )}

            {/* Recipient filters */}
            <div>
              <label className="form-label">Получатели (фильтры)</label>
              {/* Existing filter tags */}
              {filterRules.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                  {filterRules.map((rule, idx) => renderFilterTag(rule, idx))}
                  {filterRules.length > 1 && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Фильтры объединяются по логике И (AND)
                    </div>
                  )}
                </div>
              )}
              {filterRules.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Нет фильтров — рассылка пойдёт всем лидам
                </div>
              )}
              {/* Add filter control */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  className="form-input"
                  style={{ flex: 1 }}
                  value={addFilterType}
                  onChange={e => setAddFilterType(e.target.value)}
                >
                  <option value="">+ Добавить фильтр...</option>
                  {FILTER_TYPES.map(ft => (
                    <option key={ft} value={ft}>{FILTER_TYPE_LABELS[ft]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                  onClick={addFilter}
                  disabled={!addFilterType}
                >
                  Добавить
                </button>
              </div>
              <div className="form-hint">Фильтруйте получателей по лид-магнитам, дате регистрации или участию в розыгрышах.</div>
            </div>

            {/* Schedule */}
            <div>
              <label className="form-label">Запланировать отправку</label>
              <input className="form-input" type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
              <div className="form-hint">Оставьте пустым для отправки вручную. Время — по Москве (UTC+3).</div>
            </div>

            {/* Inline buttons — ButtonBuilder */}
            <div>
              <label className="form-label">Инлайн-кнопки</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
              <div className="form-hint">Кнопки под сообщением. Можно добавить ссылку или выдачу лид-магнита.</div>
            </div>
          </div>
        )}

        {/* Actions — always visible */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className="btn btn-outline" onClick={() => setShowModal(false)}>Отмена</button>
          {editingBc && (
            <button className="btn btn-outline" onClick={handleSendTest} title="Отправить тестовое сообщение себе">
              Отправить себе
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      {/* Stats Modal */}
      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title={`Статистика: ${statsData?.title || ''}`}>
        {statsData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={statsRowStyle}>
              <span>Всего получателей:</span>
              <strong>{statsData.total_count ?? statsData.stats?.total_count ?? '—'}</strong>
            </div>
            <div style={statsRowStyle}>
              <span>Отправлено:</span>
              <strong>{statsData.sent_count ?? statsData.stats?.sent_count ?? '—'}</strong>
            </div>
            <div style={statsRowStyle}>
              <span>Доставлено:</span>
              <strong>{statsData.delivered_count ?? statsData.stats?.delivered_count ?? '—'}</strong>
            </div>
            <div style={statsRowStyle}>
              <span>Ошибки:</span>
              <strong>{statsData.error_count ?? statsData.stats?.error_count ?? '—'}</strong>
            </div>
            {(statsData.click_count != null || statsData.stats?.click_count != null) && (
              <div style={statsRowStyle}>
                <span>Кликов по кнопкам:</span>
                <strong>{statsData.click_count ?? statsData.stats?.click_count ?? '—'}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button className="btn btn-outline" onClick={() => setShowStatsModal(false)}>Закрыть</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Sent Messages Modal */}
      <Modal isOpen={showEditSentModal} onClose={() => setShowEditSentModal(false)} title={`Редактировать отправленные: ${editSentBc?.title || ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">Новый текст сообщения *</label>
            <RichTextEditor
              value={editSentText}
              onChange={setEditSentText}
              placeholder="Новый текст для всех отправленных сообщений..."
              rows={6}
              showEmoji={true}
            />
            <div className="form-hint">Этот текст заменит текущий текст во всех отправленных сообщениях.</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => setShowEditSentModal(false)}>Отмена</button>
            <button className="btn btn-primary" onClick={handleEditSentSubmit} disabled={editSentSaving}>
              {editSentSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
