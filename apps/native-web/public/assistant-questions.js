import { renderChatMarkdown } from './chat-markdown.js';
import { t } from './i18n.js';

/** "方案 A（推荐）" / "Plan A (Recommended)" → label + recommended flag; the answer keeps the original label. */
export function parseRecommendedLabel(label) {
  const match = /\s*[（(]\s*(推荐|Recommended)\s*[)）]\s*$/i.exec(String(label));
  return match ? { label: label.slice(0, match.index), recommended: true } : { label: String(label), recommended: false };
}

/**
 * Renders a native DSH question set in the conversation, one question per page
 * (DeepSeek Harness QuestionFlow): a single choice advances to the next
 * question, multi-select and free text wait for 下一题, the last page submits.
 * No modal or second chat; answered sets collapse to a Q → A summary.
 */
export function mountAssistantQuestion(host, initial, settle) {
  const card = document.createElement('article');
  card.className = 'assistant-question-card';
  host.append(card);
  let current, signature, busy = false, index = 0, minimized = false, drafts = [], error = '';
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const answered = draft => draft.selected.length > 0 || draft.custom.trim() !== '';
  // The Host accepts custom answers up to 8000 characters. Never clip silently:
  // an over-long answer is refused with its length and the attachment route.
  const MAX_CUSTOM = 8000;
  const overLimit = () => drafts.findIndex(draft => draft.custom.trim().length > MAX_CUSTOM);
  const tooLongMessage = draft => t('这条回答有 {n} 字，超过 {max} 字上限。请精简，或把完整材料用输入框左侧的 + 作为附件发送。', { n: draft.custom.trim().length, max: MAX_CUSTOM });
  const completed = draft => answered(draft) || draft.skipped;
  const answerPayload = () => ({ answers: current.questions.map((question, i) => {
    const draft = drafts[i];
    if (draft.skipped) return { id: question.id, selected: [] };
    const custom = draft.custom.trim();
    return { id: question.id, selected: custom && !question.multiSelect ? [] : draft.selected, ...(custom ? { custom } : {}) };
  }) });

  async function send(action, answer) {
    if (busy || current.status !== 'pending') return false;
    busy = true; error = ''; paint();
    try {
      await settle(action, answer);
      busy = false;
      update({ ...current, status: action === 'answer' ? 'answered' : 'cancelled', ...(answer ? { answer } : {}) });
      return true;
    } catch (cause) {
      busy = false; error = cause instanceof Error ? cause.message : String(cause); paint();
      return false;
    }
  }
  function submit() {
    const long = overLimit();
    if (long >= 0) { index = long; error = tooLongMessage(drafts[long]); paint(); return; }
    const missing = drafts.findIndex(draft => !completed(draft));
    if (missing >= 0) { index = missing; error = t('请先完成这道问题。'); paint(); return; }
    void send('answer', answerPayload());
  }
  function next() {
    if (!answered(drafts[index])) { error = t('请选择一个选项或填写自定义答案。'); paint(); return; }
    error = '';
    if (index < drafts.length - 1) { index += 1; paint({ focus: true }); } else submit();
  }
  function skip() {
    drafts[index] = { selected: [], custom: '', skipped: true };
    error = '';
    if (index < drafts.length - 1) { index += 1; paint({ focus: true }); } else submit();
  }
  function choose(question, label) {
    const draft = drafts[index];
    if (question.multiSelect) {
      draft.selected = draft.selected.includes(label) ? draft.selected.filter(item => item !== label) : [...draft.selected, label];
      draft.skipped = false; error = ''; paint(); return;
    }
    drafts[index] = { selected: [label], custom: '', skipped: false };
    error = '';
    if (index < drafts.length - 1) { index += 1; paint({ focus: true }); } else paint();
  }

  function paintSettled(request) {
    const summary = node('div', '', 'assistant-question-summary');
    for (const question of request.questions) {
      const row = node('div', '', 'assistant-question-settled');
      row.append(node('p', question.question, 'assistant-question-asked'));
      const answer = request.answer?.answers.find(item => item.id === question.id);
      const text = request.status === 'answered'
        ? (answer ? [...(answer.selected || []).map(label => parseRecommendedLabel(label).label), answer.custom].filter(Boolean).join('；') || t('已跳过') : t('已跳过'))
        : request.status === 'interrupted' ? t('连接已中断，请在对话中继续。') : t('已取消');
      row.append(node('p', text, 'assistant-question-answer'));
      summary.append(row);
    }
    card.replaceChildren(summary);
  }

  function paint({ focus = false } = {}) {
    if (!current || current.status !== 'pending') return;
    const total = current.questions.length;
    const question = current.questions[index];
    const draft = drafts[index];
    const feedback = node('p', busy ? t('正在发送…') : error, 'assistant-question-feedback');
    feedback.setAttribute('role', error ? 'alert' : 'status');
    let syncPrimary = () => {};
    card.classList.toggle('is-minimized', minimized);
    const section = node('section', '', 'assistant-question-page');
    const titleId = `question-${current.id}-${index}`;
    section.setAttribute('aria-labelledby', titleId);

    const header = node('header', '', 'assistant-question-header');
    const heading = node('div', '', 'assistant-question-heading');
    const eyebrow = [total > 1 ? t('问题 {a}/{b}', { a: index + 1, b: total }) : '', question.header || ''].filter(Boolean).join(' · ');
    if (eyebrow) heading.append(node('div', eyebrow, 'assistant-question-eyebrow'));
    const title = node('h3', question.question, 'assistant-question-title');
    title.id = titleId; title.tabIndex = -1;
    heading.append(title);
    const actions = node('div', '', 'assistant-question-tools');
    const collapse = node('button', minimized ? t('展开') : t('收起'), 'assistant-question-icon');
    collapse.type = 'button'; collapse.disabled = busy;
    collapse.setAttribute('aria-expanded', String(!minimized));
    collapse.setAttribute('aria-label', minimized ? t('展开问题卡片') : t('收起问题卡片'));
    collapse.addEventListener('click', () => { minimized = !minimized; paint(); });
    const cancel = node('button', '×', 'assistant-question-icon assistant-question-cancel');
    cancel.type = 'button'; cancel.disabled = busy; cancel.dataset.control = 'chrome.workspace.assistant.question';
    cancel.setAttribute('aria-label', t('放弃整组问题')); cancel.title = t('放弃整组问题');
    cancel.addEventListener('click', () => void send('cancel'));
    actions.append(collapse, cancel);
    header.append(heading, actions);
    section.append(header);

    if (!minimized) {
      const body = node('div', '', 'assistant-question-body');
      if (question.detail) { const detail = node('div', '', 'md-body assistant-question-detail'); detail.innerHTML = renderChatMarkdown(question.detail); body.append(detail); }
      const hasOptions = (question.options?.length || 0) > 0;
      const list = node('div', '', 'assistant-question-options');
      list.setAttribute('role', question.multiSelect ? 'group' : 'radiogroup');
      list.setAttribute('aria-labelledby', titleId);
      (question.options || []).forEach((option, optionIndex) => {
        const selected = draft.selected.includes(option.label);
        const display = parseRecommendedLabel(option.label);
        const button = node('button', '', `assistant-question-option${selected ? ' is-selected' : ''}`);
        button.type = 'button'; button.disabled = busy;
        button.setAttribute('role', question.multiSelect ? 'checkbox' : 'radio');
        button.setAttribute('aria-checked', String(selected));
        button.setAttribute('aria-label', display.label);
        const mark = node('span', question.multiSelect ? (selected ? '✓' : '') : String(optionIndex + 1), question.multiSelect ? 'assistant-question-check' : 'assistant-question-number');
        mark.setAttribute('aria-hidden', 'true');
        const copy = node('span', '', 'assistant-question-copy');
        const line = node('span', '', 'assistant-question-line');
        line.append(node('span', display.label, 'assistant-question-label'));
        if (display.recommended) line.append(node('span', t('推荐'), 'assistant-question-badge'));
        copy.append(line);
        if (option.description) {
          const description = node('span', option.description, 'assistant-question-description');
          description.id = `${titleId}-o${optionIndex}`;
          button.setAttribute('aria-describedby', description.id);
          copy.append(description);
        }
        button.append(mark, copy);
        button.addEventListener('click', () => choose(question, option.label));
        list.append(button);
      });
      const custom = node('textarea', '', 'assistant-question-custom');
      custom.rows = hasOptions ? 1 : 2; custom.value = draft.custom; custom.disabled = busy;
      custom.placeholder = hasOptions ? t('也可以输入你的答案') : t('输入你的答案');
      custom.setAttribute('aria-label', `${question.question}：${t('自定义回答')}`);
      custom.addEventListener('input', () => {
        draft.custom = custom.value; draft.skipped = false;
        if (!question.multiSelect && custom.value.trim() && draft.selected.length) {
          draft.selected = [];
          list.querySelectorAll('[aria-checked="true"]').forEach(item => { item.setAttribute('aria-checked', 'false'); item.classList.remove('is-selected'); });
        }
        if (error) { error = ''; feedback.textContent = ''; }
        syncPrimary();
      });
      custom.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        event.preventDefault(); next();
      });
      if (hasOptions) {
        const row = node('label', '', `assistant-question-custom-row${draft.custom ? ' is-active' : ''}`);
        const mark = node('span', '✎', 'assistant-question-number'); mark.setAttribute('aria-hidden', 'true');
        row.append(mark, custom); list.append(row);
        body.append(list);
      } else {
        body.append(custom);
      }
      section.append(body);

      const footer = node('footer', '', 'assistant-question-footer');
      const pager = node('div', '', 'assistant-question-pager');
      if (total > 1) {
        const prev = node('button', '‹', 'assistant-question-icon'); prev.type = 'button';
        prev.setAttribute('aria-label', t('上一题')); prev.disabled = busy || index === 0;
        prev.addEventListener('click', () => { index -= 1; error = ''; paint({ focus: true }); });
        const position = node('span', `${index + 1} / ${total}`, 'assistant-question-position');
        const forward = node('button', '›', 'assistant-question-icon'); forward.type = 'button';
        forward.setAttribute('aria-label', t('下一题')); forward.disabled = busy || index === total - 1;
        forward.addEventListener('click', () => { index += 1; error = ''; paint({ focus: true }); });
        pager.append(prev, position, forward);
      }
      const buttons = node('div', '', 'assistant-question-actions');
      const skipButton = node('button', t('跳过本题'), 'assistant-question-skip'); skipButton.type = 'button';
      skipButton.disabled = busy; skipButton.addEventListener('click', skip);
      const primary = node('button', index === total - 1 ? t('提交') : t('下一题'), 'question-continue');
      primary.type = 'button'; primary.dataset.control = 'chrome.workspace.assistant.question';
      primary.addEventListener('click', next);
      buttons.append(skipButton, primary);
      footer.append(pager, buttons);
      section.append(footer);
      // Like DeepSeek Harness, the primary stays enabled and explains what is missing.
      syncPrimary = () => { primary.disabled = busy; };
      syncPrimary();
    }
    section.append(feedback);
    card.replaceChildren(section);
    if (focus && !minimized) (card.querySelector('.assistant-question-option, .assistant-question-custom') || title).focus({ preventScroll: true });
  }

  function update(request) {
    const nextSignature = JSON.stringify([request.id, request.status, request.answer]);
    if (signature === nextSignature) return;
    // A delayed poll cannot reopen an already acknowledged answer.
    if (current?.id === request.id && current.status !== 'pending' && request.status === 'pending') return;
    const fresh = current?.id !== request.id;
    signature = nextSignature; current = request;
    if (fresh) { index = 0; minimized = false; error = ''; drafts = request.questions.map(() => ({ selected: [], custom: '', skipped: false })); }
    card.classList.toggle('is-settled', request.status !== 'pending');
    if (request.status !== 'pending') { card.classList.remove('is-minimized'); paintSettled(request); return; }
    paint();
  }

  update(initial);
  return {
    update,
    /**
     * Text sent from the chat input answers the current question as a custom
     * answer (options or not, like DeepSeek Harness): it moves to the next
     * question, or submits the set on the last one. Resolves true once the
     * text has been taken, so the chat box can clear it.
     */
    answerText: text => {
      if (!current || current.status !== 'pending' || busy) return Promise.resolve(false);
      if (text.trim().length > MAX_CUSTOM) {
        error = tooLongMessage({ custom: text }); paint();
        return Promise.resolve(false);
      }
      drafts[index] = { selected: [], custom: text, skipped: false };
      // Keep focus in the chat box the user is typing in.
      if (index < drafts.length - 1) { index += 1; paint(); return Promise.resolve(true); }
      if (drafts.every(completed)) return send('answer', answerPayload());
      submit();
      return Promise.resolve(true);
    },
  };
}
