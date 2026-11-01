/**
 * Gõ chữ trong game bằng một ô `<input>` ẩn: bộ gõ tiếng Việt (Telex/VNI), dán chữ và bàn phím
 * ảo trên điện thoại đều dùng được; chữ đang gõ được vẽ lại trong canvas qua `onChange`.
 * Phím gõ không lọt ra ngoài (nhân vật không chạy khi đang gõ tên).
 */
export interface TextPrompt {
  /** Kết thúc (true: giữ chữ đã gõ). */
  close(commit: boolean): void;
}

export function promptText(opts: {
  initial: string;
  maxLength: number;
  label: string;
  onChange: (text: string) => void;
  onDone: (text: string | null) => void;
}): TextPrompt {
  const el = document.createElement('input');
  el.value = opts.initial;
  el.maxLength = opts.maxLength * 2;
  el.setAttribute('aria-label', opts.label);
  el.setAttribute('autocomplete', 'off');
  Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '1px', opacity: '0' });
  document.body.appendChild(el);
  el.focus();
  el.select();
  let done = false;
  const clip = () => [...el.value].slice(0, opts.maxLength).join('');
  const close = (commit: boolean) => {
    if (done) return;
    done = true;
    const text = clip().trim();
    el.remove();
    opts.onDone(commit && text ? text : null);
  };
  el.addEventListener('input', () => opts.onChange(clip()));
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) close(true);
    else if (e.key === 'Escape') close(false);
  });
  el.addEventListener('keyup', (e) => e.stopPropagation());
  el.addEventListener('blur', () => close(true));
  return { close };
}
