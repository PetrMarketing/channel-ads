import { useState, useRef, useEffect, useCallback } from 'react';

const EMOJI_CATEGORIES = {
  'Часто': [
    '✅','❌','⚠️','‼️','❗','❓','💡','📌','📎','🔗','📢','📣','💬','💭','🗣️','💯','🛑',
    '👉','👈','👆','👇','☝️','👍','👎','👏','🙌','🤝','🙏','💪','✌️','🤞','🤷‍♂️','🤷‍♀️',
    '🔥','⭐','✨','💥','🎉','🎊','🏆','🥇','💰','💵','💸','💳','📈','📉','📊','👑','🗿',
    '⏰','⏳','🕐','📅','🗓️','⌛','🔔','🔕',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💖','💗','❤️‍🩹',
    '✍️','📝','📋','📄','📂','📁','🗂️','📚','📖','🔑','🔒','🔓',
    '🌚','🌝','🫠','🫡','🦄','👻','⛄','🎄','🎅','👑','🍑','🍷',
    '😀','🤣','😂','😭','😍','🥰','😎','🤩','🥳','😈','🤬','😱','🤮','💩','🤡','💀',
  ],
  'Лица': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘',
    '😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
    '😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
    '🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯',
    '😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩',
    '😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    '🫠','🫡','🫣','🫢','🫥','🥹','🫤','🫨',
  ],
  'Жесты': [
    '👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','🤏',
    '👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤙',
    '💪','🦾','🖕','✍️','🤳','💅','👂','👃','👣','👀','👁','🧠',
    '🤷‍♂️','🤷‍♀️','🙅‍♂️','🙅‍♀️','🙆‍♂️','🙆‍♀️','💁‍♂️','💁‍♀️','🙋‍♂️','🙋‍♀️','👩‍❤️‍👨','💑',
  ],
  'Символы': [
    '✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤',
    '🔺','🔻','🔸','🔹','🔶','🔷','💠','🔘','🔲','🔳','⬛','⬜',
    '▪️','▫️','◾','◽','◼️','◻️','🏁','🚩','🎌','🏴','🏳️',
    '©️','®️','™️','#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
    '🔠','🔡','🔢','🔣','🔤','🅰️','🅱️','🆎','🆑','🆒','🆓','🆔','🆕','🆖','🆗','🆘','🆙','🆚',
  ],
  'Стрелки': [
    '➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↩️','↪️',
    '⤴️','⤵️','🔃','🔄','🔙','🔚','🔛','🔜','🔝',
  ],
  'Природа': [
    '🌈','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌪️','🌫️','🌬️','🌀','🌊',
    '🌸','💮','🏵️','🌺','🌻','🌼','🌷','🌹','🥀','🌾','🍀','☘️','🍃','🍂','🍁','🌿','🌱','🌲','🌳','🌴',
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
    '🦅','🦆','🦉','🐝','🦋','🐌','🐞','🐜','🐛',
  ],
  'Еда': [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝',
    '🍅','🍆','🥑','🥦','🥬','🌶️','🫑','🌽','🥕','🧄','🧅','🥔',
    '🍞','🥐','🥖','🫓','🥨','🧀','🥚','🍳','🧈','🥞','🧇',
    '🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥗',
    '☕','🍵','🫖','🍶','🍺','🍻','🥂','🍷','🥃','🍹','🧃','🥤','🧋',
  ],
  'Объекты': [
    '📱','💻','🖥️','⌨️','🖨️','🖱️','💾','💿','📀',
    '📷','📸','📹','🎥','📽️','🎞️','📺','📻','🎙️','🎤','🎧',
    '📞','☎️','📟','📠','📧','📨','📩','📮','📬','📭','📪',
    '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭',
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','✈️','🚀','🛸',
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒',
  ],
};

// Flat list for backward compat
const EMOJIS = Object.values(EMOJI_CATEGORIES).flat();

const CATEGORY_ICONS = {
  'Часто': '⭐', 'Лица': '😀', 'Жесты': '👋', 'Символы': '✅',
  'Стрелки': '➡️', 'Природа': '🌿', 'Еда': '🍕', 'Объекты': '📱',
};

function getTextLength(html) {
  if (!html) return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent.length;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 5, showEmoji = false, maxLength, hasFile }) {
  const effectiveMax = maxLength || (hasFile ? 1024 : 4096);
  const editorRef = useRef(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('Часто');
  const savedSelection = useRef(null);
  const isInternalUpdate = useRef(false);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== (value || '')) {
        editorRef.current.innerHTML = value || '';
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (savedSelection.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  };

  const handleMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0 && editorRef.current?.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();
        setToolbarPos({
          top: rect.top - editorRect.top - 44,
          left: Math.max(0, Math.min(rect.left - editorRect.left + rect.width / 2 - 100, editorRect.width - 200)),
        });
        setShowToolbar(true);
        saveSelection();
      } else {
        setShowToolbar(false);
      }
    }, 10);
  };

  const handleKeyUp = (e) => {
    if (e.key === 'Shift' || e.shiftKey) {
      handleMouseUp();
    }
  };

  const execCommand = (cmd, val = null) => {
    if (cmd === 'createLink') {
      // Save selection BEFORE prompt (prompt causes focus loss)
      saveSelection();
      const url = prompt('URL:', 'https://');
      if (url) {
        restoreSelection();
        editorRef.current?.focus();
        // If no text selected, insert url as link text
        const sel = window.getSelection();
        if (sel && sel.toString().trim().length === 0) {
          document.execCommand('insertHTML', false, `<a href="${url}">${url}</a>`);
        } else {
          document.execCommand('createLink', false, url);
        }
      }
    } else {
      restoreSelection();
      editorRef.current?.focus();
      document.execCommand(cmd, false, val);
    }
    handleInput();
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length === 0) setShowToolbar(false);
    }, 50);
  };

  const insertEmoji = (emoji) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('insertText', false, emoji);
    handleInput();
    setShowEmojiPicker(false);
  };

  const handleBlur = () => {
    saveSelection();
    setTimeout(() => {
      if (!editorRef.current?.contains(document.activeElement)) {
        setShowToolbar(false);
      }
    }, 200);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // Remove <style> blocks (CSS from copied pages/emails)
      tmp.querySelectorAll('style, meta, link, title, script').forEach(el => el.remove());
      // Convert <img> emoji (from messengers) back to their alt text
      tmp.querySelectorAll('img').forEach(img => {
        const alt = img.getAttribute('alt');
        if (alt) {
          img.replaceWith(document.createTextNode(alt));
        } else {
          img.remove();
        }
      });
      // Convert block-level closing tags to <br> before stripping
      let clean = tmp.innerHTML;
      // <br> -> preserve
      clean = clean.replace(/<br\s*\/?>/gi, '\n');
      // Block closing tags -> newline
      clean = clean.replace(/<\/(?:div|p|li|h[1-6]|blockquote|tr)>/gi, '\n');
      // Remove opening block tags (with any attributes/styles)
      clean = clean.replace(/<(?:div|p|li|ul|ol|h[1-6]|blockquote|tr|td|th|table|thead|tbody|section|article|header|footer|nav|figure|figcaption|span)(?:\s[^>]*)?\s*>/gi, '');
      // Strip remaining non-allowed tags but keep content
      clean = clean.replace(/<(?!\/?(b|i|u|s|strong|em|a|br|code|pre)(\s|>|\/))([^>]*)>/gi, '');
      // Convert newlines back to <br>
      clean = clean.replace(/\n/g, '<br>');
      // Collapse 3+ <br> to 2
      clean = clean.replace(/(<br\s*\/?>){3,}/gi, '<br><br>');
      document.execCommand('insertHTML', false, clean);
    } else if (text) {
      // Plain text: preserve line breaks as <br>
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const withBreaks = escaped.replace(/\n/g, '<br>');
      document.execCommand('insertHTML', false, withBreaks);
    }
    handleInput();
  };

  const minH = Math.max(80, rows * 22);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onMouseUp={handleMouseUp}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        onPaste={handlePaste}
        className="form-input rich-editor"
        data-placeholder={placeholder || ''}
        style={{ minHeight: `${minH}px`, whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: '300px', lineHeight: '1.5' }}
      />

      {/* Floating toolbar */}
      {showToolbar && (
        <div className="rich-toolbar" style={{ top: toolbarPos.top, left: toolbarPos.left }}>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('bold'); }} title="Жирный"><b>B</b></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('italic'); }} title="Курсив"><i>I</i></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('underline'); }} title="Подчёркнутый"><u>U</u></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('strikeThrough'); }} title="Зачёркнутый"><s>S</s></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('createLink'); }} title="Ссылка">&#128279;</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); execCommand('formatBlock', 'pre'); }} title="Код">&lt;/&gt;</button>
        </div>
      )}

      {/* Emoji button + picker */}
      {showEmoji && (
        <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 10 }}>
          <button type="button" className="emoji-toggle-btn"
            onClick={() => { saveSelection(); setShowEmojiPicker(!showEmojiPicker); }}
            title="Эмодзи">
            &#128522;
          </button>
          {showEmojiPicker && (
            <div style={{
              position: 'fixed', bottom: '80px', right: '40px',
              width: '340px', height: '380px',
              background: 'var(--bg-primary, #fff)', border: '1px solid var(--border, #ddd)',
              borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              zIndex: 10000,
            }}>
              {/* Category tabs */}
              <div style={{
                display: 'flex', gap: '0', borderBottom: '1px solid var(--border, #eee)',
                background: 'var(--bg-secondary, #f8f8f8)', flexShrink: 0,
              }}>
                {Object.keys(EMOJI_CATEGORIES).map(cat => (
                  <button key={cat} type="button"
                    style={{
                      flex: 1, padding: '10px 0', fontSize: '18px',
                      border: 'none', cursor: 'pointer',
                      background: emojiCategory === cat ? 'var(--bg-primary, #fff)' : 'transparent',
                      borderBottom: emojiCategory === cat ? '2px solid var(--primary, #2AABEE)' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    title={cat}
                    onClick={() => setEmojiCategory(cat)}
                  >{CATEGORY_ICONS[cat] || cat[0]}</button>
                ))}
              </div>
              {/* Emoji grid */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '8px',
                display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '2px', alignContent: 'start',
              }}>
                {(EMOJI_CATEGORIES[emojiCategory] || []).map((e, i) => (
                  <button key={i} type="button"
                    style={{
                      width: '36px', height: '36px', fontSize: '22px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: 'none', borderRadius: '8px', cursor: 'pointer',
                      background: 'transparent', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.target.style.background = 'var(--bg-secondary, #f0f0f0)'}
                    onMouseLeave={e => e.target.style.background = 'transparent'}
                    onClick={() => insertEmoji(e)}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '0.72rem', marginTop: '4px', color: 'var(--text-secondary, #999)',
      }}>
        <span style={{ color: getTextLength(value) > effectiveMax ? 'var(--error, #e63946)' : undefined }}>
          {getTextLength(value) > effectiveMax
            ? `Превышен лимит на ${getTextLength(value) - effectiveMax} симв.`
            : hasFile !== undefined
              ? (hasFile ? 'С вложением: до 1024 симв.' : 'Без вложения: до 4096 симв.')
              : ''}
        </span>
        <span style={{ color: getTextLength(value) > effectiveMax ? 'var(--error, #e63946)' : undefined }}>
          {getTextLength(value)} / {effectiveMax}
        </span>
      </div>
    </div>
  );
}
