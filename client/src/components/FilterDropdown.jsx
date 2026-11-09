import { useEffect, useId, useRef, useState } from 'react';

export default function FilterDropdown({ id, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selectedLabel = options[selectedIndex]?.label || '';

  useEffect(() => {
    if (!open) return undefined;

    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const option = menu?.children[activeIndex];
    if (!menu || !option) return;

    // Keep active options visible without moving the page itself.
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
  }, [activeIndex, open]);

  function selectIndex(index) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else {
        setActiveIndex(previous =>
          event.key === 'ArrowDown'
            ? Math.min(previous + 1, options.length - 1)
            : Math.max(previous - 1, 0)
        );
      }
    } else if (open && event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (open && event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) selectIndex(activeIndex);
      else {
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
    }
  }

  return (
    <>
      <div className={`pj-filter-dropdown${open ? ' is-open' : ''}`} ref={rootRef}>
        <button
          id={id}
          ref={triggerRef}
          type="button"
          role="combobox"
          className="pj-filter-dropdown-trigger"
          aria-label={`${label}: ${selectedLabel}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-option-${activeIndex}` : undefined}
          onClick={() => {
            setActiveIndex(selectedIndex);
            setOpen(previous => !previous);
          }}
          onKeyDown={handleKeyDown}
        >
          <span className="pj-filter-dropdown-text">{selectedLabel}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div id={listId} ref={menuRef} className="pj-filter-dropdown-menu"
            role="listbox" aria-label={label}>
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                className={`pj-filter-dropdown-option${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectIndex(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <select
        id={`${id}-native`}
        aria-label={label}
        className="pj-filter-native-select"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </>
  );
}
