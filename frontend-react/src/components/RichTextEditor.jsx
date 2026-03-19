import { useState, useRef, useEffect, useCallback } from 'react';

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘',
  '😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
  '😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
  '🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯',
  '😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩',
  '😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽',
  '👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙',
  '💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','✨',
  '⚡','🔥','💥','🎉','🎊','🎁','🏆','🥇','🥈','🥉','🎯','🎪','🎭','🎨','🎬','🎤',
  '🎧','🎵','🎶','🎹','🎸','🎺','🎻','🥁','👍','👎','👏','🙌','🤝','🙏','✌️','🤞',
  '🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤙',
  '💪','🦾','🖕','✍️','🤳','💅','👂','👃','👣','👀','👁','🧠','🦷','👅','👄','💋',
];

export default function RichTextEditor({ value, onChange, placeholder, rows = 5, showEmoji = false }) {
  const editorRef = useRef(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
    restoreSelection();
    editorRef.current?.focus();
    if (cmd === 'createLink') {
      const url = prompt('URL:', 'https://');
      if (url) document.execCommand('createLink', false, url);
    } else {
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
      // Sanitize: only keep basic formatting
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // Strip all but allowed tags
      const clean = tmp.innerHTML
        .replace(/<(?!\/?(b|i|u|s|strong|em|a|br|code|pre)(\s|>|\/))([^>]*)>/gi, '')
        .replace(/<br\s*\/?>/gi, '<br>');
      document.execCommand('insertHTML', false, clean);
    } else {
      document.execCommand('insertText', false, text);
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
        <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
          <button type="button" className="emoji-toggle-btn"
            onClick={() => { saveSelection(); setShowEmojiPicker(!showEmojiPicker); }}
            title="Эмодзи">
            &#128522;
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker">
              {EMOJIS.map((e, i) => (
                <button key={i} type="button" className="emoji-item" onClick={() => insertEmoji(e)}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
