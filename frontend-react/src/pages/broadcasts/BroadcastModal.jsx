import Modal from '../../components/Modal';
import RichTextEditor from '../../components/RichTextEditor';
import ButtonBuilder from '../../components/ButtonBuilder';
import AttachmentPicker from '../../components/AttachmentPicker';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const FILTER_TYPE_META = {
  lead_magnet: { icon: '🎁', label: 'Получил лид-магнит', grad: [SUCCESS, '#34d399'] },
  registration_date: { icon: '📅', label: 'Дата регистрации', grad: ['#3b82f6', ACCENT] },
  giveaway_participant: { icon: '🎉', label: 'Участник розыгрыша', grad: [ACCENT2, '#a855f7'] },
};

const FILTER_TYPES = Object.keys(FILTER_TYPE_META);

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.86rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.88rem', color: DARK,
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: DARK, marginBottom: 6,
};

const hintStyle = {
  fontSize: '0.74rem', color: MUTED, marginTop: 6, lineHeight: 1.45,
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};

const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 12px', borderRadius: 20,
  fontSize: '0.78rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const filterRuleCard = {
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: '12px 14px',
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
};

const filterSelectStyle = {
  ...inputStyle,
  width: 'auto', minWidth: 140, padding: '7px 10px', fontSize: '0.84rem',
};

const removeButtonStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 8,
  background: '#fff', border: `1px solid ${BORDER}`,
  cursor: 'pointer', color: MUTED, fontSize: '1rem',
  transition: 'all .15s ease', marginLeft: 'auto',
  padding: 0,
};

const negateToggleStyle = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 9px', borderRadius: 6,
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
  cursor: 'pointer',
  background: active ? `linear-gradient(135deg, ${DANGER}, #f87171)` : '#fff',
  color: active ? '#fff' : MUTED,
  border: `1px solid ${active ? 'transparent' : BORDER}`,
  transition: 'all .15s ease',
  boxShadow: active ? `0 2px 8px ${DANGER}33` : 'none',
});

const previewContainerStyle = {
  padding: 24,
  background: SOFT_BG,
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  minHeight: 160,
};

const previewBubbleStyle = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  padding: '14px 16px',
  maxWidth: 420,
  boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
};

const previewButtonStyle = {
  display: 'inline-block',
  padding: '7px 14px',
  fontSize: '0.82rem',
  borderRadius: 8,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color: ACCENT,
  textAlign: 'center',
  flex: 1,
  fontWeight: 500,
};

function StatCard({ label, value, gradFrom, gradTo, soft, accent, icon }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: 18,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -22, right: -22, width: 80, height: 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${soft} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10, marginBottom: 10,
        background: `linear-gradient(135deg, ${gradFrom} 0%, ${gradTo} 100%)`,
        color: '#fff', fontSize: '1rem',
        boxShadow: `0 4px 12px ${gradFrom}44`,
      }}>{icon}</div>
      <div style={{
        fontSize: '1.6rem', fontWeight: 800, color: DARK,
        letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PlusIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function PeopleIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

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
  showStatsModal,
  setShowStatsModal,
  statsData,
  showEditSentModal,
  setShowEditSentModal,
  editSentBc,
  editSentText,
  setEditSentText,
  editSentSaving,
  handleEditSentSubmit,
}) {
  const renderFilterRule = (rule, idx) => {
    const fmeta = FILTER_TYPE_META[rule.type] || { icon: '⚙', label: rule.type, grad: [MUTED, '#9ca3af'] };
    return (
      <div key={idx} style={filterRuleCard}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${fmeta.grad[0]} 0%, ${fmeta.grad[1]} 100%)`,
          fontSize: '0.95rem',
          boxShadow: `0 3px 10px ${fmeta.grad[0]}33`,
          flexShrink: 0,
        }}>{fmeta.icon}</div>

        <button
          type="button"
          onClick={() => updateFilter(idx, { negate: !rule.negate })}
          style={negateToggleStyle(rule.negate)}
          title={rule.negate ? 'Исключение активно — нажмите чтобы убрать' : 'Нажмите для исключения'}
        >
          НЕ
        </button>

        <span style={{ fontWeight: 600, fontSize: '0.86rem', color: DARK, letterSpacing: '-0.005em' }}>
          {fmeta.label}
        </span>

        {rule.type === 'lead_magnet' && (
          <select
            className="bc-input"
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
            className="bc-input"
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
              className="bc-input"
              style={filterSelectStyle}
              value={rule.value?.direction || 'before'}
              onChange={e => updateFilterValue(idx, { direction: e.target.value })}
            >
              <option value="before">до</option>
              <option value="after">после</option>
            </select>
            <input
              type="date"
              className="bc-input"
              style={filterSelectStyle}
              value={rule.value?.date || ''}
              onChange={e => updateFilterValue(idx, { date: e.target.value })}
            />
          </>
        )}

        <button
          type="button"
          className="bc-rule-remove"
          onClick={() => removeFilter(idx)}
          style={removeButtonStyle}
          title="Удалить фильтр"
        >
          ×
        </button>
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
        <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
          Так получатели увидят сообщение
        </div>
        <div style={previewBubbleStyle}>
          <div
            style={{ fontSize: '0.92rem', lineHeight: 1.55, color: DARK }}
            dangerouslySetInnerHTML={{ __html: form.message_text || '<span style="color:#999">Нет текста</span>' }}
          />
          {Array.isArray(buttons) && buttons.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {buttons.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: 6 }}>
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
          <div style={{
            marginTop: 12, fontSize: '0.82rem', color: MUTED,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, background: '#fff',
            border: `1px solid ${BORDER}`,
          }}>
            📎 {bcFile.name}
          </div>
        )}
      </div>
    );
  };

  const sentTotal = statsData?.sent_count ?? statsData?.stats?.sent_count ?? 0;
  const totalCount = statsData?.total_count ?? statsData?.stats?.total_count ?? 0;
  const sentPct = totalCount > 0 ? Math.min(100, Math.round((sentTotal / totalCount) * 100)) : 0;

  return (
    <>
      <style>{`
        .bc-input:focus,
        .bc-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .bc-modal-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 999px; cursor: pointer;
          background: transparent; border: 1px solid transparent;
          color: ${MUTED}; font-size: 0.86rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .18s ease;
        }
        .bc-modal-tab:hover {
          color: ${DARK};
          background: ${SOFT_BG};
        }
        .bc-modal-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .bc-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .bc-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .bc-rule-remove:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
        }
      `}</style>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBc ? 'Редактировать рассылку' : 'Создать рассылку'}>
        <div role="tablist" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: 5, borderRadius: 999,
          background: '#fff', border: `1px solid ${BORDER}`,
          marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === 'edit'}
            className={`bc-modal-tab${modalTab === 'edit' ? ' active' : ''}`}
            onClick={() => setModalTab('edit')}
          >
            Редактирование
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === 'preview'}
            className={`bc-modal-tab${modalTab === 'preview' ? ' active' : ''}`}
            onClick={() => setModalTab('preview')}
          >
            Предпросмотр
          </button>
        </div>

        {modalTab === 'preview' ? (
          renderPreview()
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Название</label>
              <input
                className="bc-input" style={inputStyle}
                placeholder="Например: Акция на выходные"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
              <div style={hintStyle}>Для вашего удобства. Подписчики не увидят название.</div>
            </div>

            <div ref={messageRef}>
              <label style={labelStyle}>Текст сообщения *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст рассылки... Поддерживает HTML: <b>жирный</b>, <i>курсив</i>, <a href='URL'>ссылка</a>"
                  rows={5}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                  hasFile={!!(bcFile || editingBc?.file_path)}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div style={hintStyle}>Этот текст получат подписчики. Поддерживается HTML-разметка Telegram/MAX.</div>
            </div>

            <div>
              <label style={labelStyle}>Вложение</label>
              <AttachmentPicker
                file={bcFile}
                onFileChange={setBcFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingBc?.file_type || ''}
              />
              <div style={hintStyle}>Фото, видео или документ. Макс. 50 МБ для Telegram, 100 МБ для MAX.</div>
            </div>

            {recipientCount !== null && (
              <div style={{
                padding: '12px 14px', borderRadius: 12,
                background: recipientCount > 0
                  ? `linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(52,211,153,0.04) 100%)`
                  : `linear-gradient(135deg, rgba(230,57,70,0.08) 0%, rgba(248,113,113,0.04) 100%)`,
                border: `1px solid ${recipientCount > 0 ? `${SUCCESS}25` : `${DANGER}25`}`,
                fontSize: '0.88rem',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: recipientCount > 0
                    ? `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`
                    : `linear-gradient(135deg, ${DANGER} 0%, #f87171 100%)`,
                  color: '#fff',
                  boxShadow: `0 4px 12px ${recipientCount > 0 ? SUCCESS : DANGER}40`,
                }}>
                  {recipientCount > 0 ? <PeopleIcon /> : <span style={{ fontSize: '1rem' }}>!</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.74rem', color: MUTED, fontWeight: 600,
                    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2,
                  }}>
                    Получателей
                  </div>
                  <div style={{
                    fontSize: '1.15rem', fontWeight: 800, color: DARK,
                    letterSpacing: '-0.02em', lineHeight: 1.1,
                  }}>
                    {recipientCount.toLocaleString('ru-RU')}
                    {recipientCount === 0 && (
                      <span style={{ marginLeft: 8, fontSize: '0.78rem', color: DANGER, fontWeight: 600 }}>
                        нет подходящих лидов
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Получатели (фильтры)</label>

              {filterRules.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {filterRules.map((rule, idx) => renderFilterRule(rule, idx))}
                  {filterRules.length > 1 && (
                    <div style={{ fontSize: '0.74rem', color: MUTED, padding: '0 4px' }}>
                      Фильтры объединяются по логике <b style={{ color: DARK, fontWeight: 700 }}>И (AND)</b>
                    </div>
                  )}
                </div>
              )}

              {filterRules.length === 0 && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: SOFT_BG, border: `1px dashed ${BORDER}`,
                  fontSize: '0.84rem', color: MUTED, marginBottom: 10,
                }}>
                  Нет фильтров — рассылка пойдёт всем лидам
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="bc-input"
                  style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                  value={addFilterType}
                  onChange={e => setAddFilterType(e.target.value)}
                >
                  <option value="">+ Добавить фильтр...</option>
                  {FILTER_TYPES.map(ft => (
                    <option key={ft} value={ft}>{FILTER_TYPE_META[ft].label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bc-primary"
                  style={{
                    ...primaryBtn,
                    padding: '10px 18px',
                    opacity: addFilterType ? 1 : 0.45,
                    cursor: addFilterType ? 'pointer' : 'not-allowed',
                  }}
                  onClick={addFilter}
                  disabled={!addFilterType}
                >
                  <PlusIcon />
                  Добавить
                </button>
              </div>
              <div style={hintStyle}>Фильтруйте получателей по лид-магнитам, дате регистрации или участию в розыгрышах.</div>
            </div>

            <div>
              <label style={labelStyle}>Запланировать отправку</label>
              <input
                className="bc-input" style={inputStyle}
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
              />
              <div style={hintStyle}>Оставьте пустым для отправки вручную. Время — по Москве (UTC+3).</div>
            </div>

            <div>
              <label style={labelStyle}>Инлайн-кнопки</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
              <div style={hintStyle}>Кнопки под сообщением. Можно добавить ссылку или выдачу лид-магнита.</div>
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 22, paddingTop: 18,
          borderTop: `1px solid ${BORDER}`,
          flexWrap: 'wrap',
        }}>
          <button className="bc-ghost" style={ghostBtn} onClick={() => setShowModal(false)}>
            Отмена
          </button>
          {editingBc && (
            <button
              className="bc-ghost"
              style={ghostBtn}
              onClick={handleSendTest}
              title="Отправить тестовое сообщение себе"
            >
              <SendIcon />
              Тест
            </button>
          )}
          <button
            className="bc-primary"
            style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title={`Статистика: ${statsData?.title || ''}`}>
        {statsData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {totalCount > 0 && (
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: '0.82rem', color: MUTED, fontWeight: 600 }}>
                    Прогресс отправки
                  </span>
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
                    {sentPct}%
                  </span>
                </div>
                <div style={{
                  width: '100%', height: 10, borderRadius: 999,
                  background: SOFT_BG, border: `1px solid ${BORDER}`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${sentPct}%`, height: '100%',
                    background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                    borderRadius: 999,
                    transition: 'width 0.4s ease',
                    boxShadow: `0 0 12px ${ACCENT}55`,
                  }} />
                </div>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}>
              <StatCard
                label="Всего получателей"
                value={(statsData.total_count ?? statsData.stats?.total_count ?? 0).toLocaleString('ru-RU')}
                gradFrom={ACCENT} gradTo={ACCENT2}
                soft={`${ACCENT}1c`} accent={ACCENT}
                icon={<PeopleIcon />}
              />
              <StatCard
                label="Отправлено"
                value={(statsData.sent_count ?? statsData.stats?.sent_count ?? 0).toLocaleString('ru-RU')}
                gradFrom={SUCCESS} gradTo="#34d399"
                soft={`${SUCCESS}1c`} accent={SUCCESS}
                icon={<SendIcon />}
              />
              <StatCard
                label="Доставлено"
                value={(statsData.delivered_count ?? statsData.stats?.delivered_count ?? 0).toLocaleString('ru-RU')}
                gradFrom="#3b82f6" gradTo={ACCENT}
                soft={`${ACCENT}1c`} accent={ACCENT}
                icon="✓"
              />
              <StatCard
                label="Ошибки"
                value={(statsData.error_count ?? statsData.stats?.error_count ?? 0).toLocaleString('ru-RU')}
                gradFrom={DANGER} gradTo="#f87171"
                soft={`${DANGER}1c`} accent={DANGER}
                icon="!"
              />
              {(statsData.click_count != null || statsData.stats?.click_count != null) && (
                <StatCard
                  label="Кликов по кнопкам"
                  value={(statsData.click_count ?? statsData.stats?.click_count ?? 0).toLocaleString('ru-RU')}
                  gradFrom={WARNING} gradTo="#f97316"
                  soft={`${WARNING}1c`} accent={WARNING}
                  icon="↗"
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="bc-ghost" style={ghostBtn} onClick={() => setShowStatsModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showEditSentModal} onClose={() => setShowEditSentModal(false)} title={`Редактировать отправленные: ${editSentBc?.title || ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{
            padding: 14, borderRadius: 12,
            background: `linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(249,115,22,0.04) 100%)`,
            border: `1px solid ${WARNING}30`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
              color: '#fff', fontSize: '1.1rem', fontWeight: 800,
              boxShadow: `0 4px 12px ${WARNING}55`,
            }}>!</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                Внимание: массовая правка
              </div>
              <div style={{ fontSize: '0.82rem', color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                Этот текст заменит сообщение во всех уже отправленных рассылках у каждого получателя. Действие необратимо.
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Новый текст сообщения *</label>
            <RichTextEditor
              value={editSentText}
              onChange={setEditSentText}
              placeholder="Новый текст для всех отправленных сообщений..."
              rows={6}
              showEmoji={true}
            />
            <div style={hintStyle}>Поддерживается HTML-разметка Telegram/MAX.</div>
          </div>

          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            paddingTop: 18, borderTop: `1px solid ${BORDER}`,
          }}>
            <button className="bc-ghost" style={ghostBtn} onClick={() => setShowEditSentModal(false)}>
              Отмена
            </button>
            <button
              className="bc-primary"
              style={{ ...primaryBtn, opacity: editSentSaving ? 0.7 : 1 }}
              onClick={handleEditSentSubmit}
              disabled={editSentSaving}
            >
              {editSentSaving ? 'Сохранение…' : 'Заменить во всех'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
