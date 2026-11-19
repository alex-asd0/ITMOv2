// Static mock data and minimal interactions; no backend calls.
const EMOJIS = [
  { glyph: '🔥', unlocked: true },
  { glyph: '⭐', unlocked: true },
  { glyph: '❤️', unlocked: true },
  { glyph: '🚀', unlocked: false },
  { glyph: '🎯', unlocked: true },
  { glyph: '💡', unlocked: false },
  { glyph: '🍀', unlocked: false },
  { glyph: '🏆', unlocked: false },
];

const PRIZES = ['Промо-код на кофе', 'Участие в розыгрыше', '🔥', 'Скидка на задачи', 'Улыбка от тимлида', '⭐', 'Бессмысленный диплом', 'Multi-Emoji Perk'];

const tasks = [
  { id: 1, title: 'Подготовить отчёт', time: 'Пн 16.11 · весь день', day: 0, done: false, emojis: ['🔥'] },
  { id: 2, title: 'Созвон с командой', time: 'Вт 17.11 · 15:00', day: 1, done: true, emojis: ['⭐'] },
  { id: 3, title: 'Ревью pull request', time: 'Чт 19.11 · 11:00–12:00', day: 3, done: false, emojis: [] },
  { id: 4, title: 'Купить подарок', time: 'Чт 19.11 · весь день', day: 3, done: false, emojis: ['❤️'] },
  { id: 5, title: 'Спланировать спринт', time: 'Пт 20.11 · 10:00', day: 4, done: false, emojis: ['🎯'] },
  { id: 6, title: 'Task 1', time: '', day: null, done: false, emojis: [] },
  { id: 7, title: 'Разобрать почту', time: '', day: null, done: false, emojis: ['⭐'] },
  { id: 8, title: 'Прочитать документацию', time: '', day: null, done: true, emojis: [] },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const $ = (id) => document.getElementById(id);
let spins = 5;

function emojiStack(list) {
  const wrap = document.createElement('span');
  wrap.className = 'emoji-stack';
  list.forEach((g) => {
    const chip = document.createElement('span');
    chip.className = 'emoji-chip';
    chip.textContent = g;
    wrap.append(chip);
  });
  return wrap;
}

function taskRow(task) {
  const li = document.createElement('li');
  li.className = 'task';
  li.addEventListener('click', () => openEdit(task));

  const left = document.createElement('div');
  left.className = 'task-left';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = task.done;
  check.setAttribute('aria-label', `Выполнено: ${task.title}`);
  check.addEventListener('click', (e) => e.stopPropagation());
  check.addEventListener('change', () => {
    task.done = check.checked;
    render();
  });
  const title = document.createElement('span');
  title.className = 'task-title' + (task.done ? ' done' : '');
  title.textContent = task.title;
  left.append(check, emojiStack(task.emojis), title);

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  if (task.time) {
    const time = document.createElement('span');
    time.className = 'task-time';
    time.textContent = task.time;
    actions.append(time);
  }
  const del = document.createElement('button');
  del.className = 'delete';
  del.type = 'button';
  del.textContent = 'Удалить';
  del.addEventListener('click', (e) => e.stopPropagation());
  actions.append(del);

  li.append(left, actions);
  return li;
}

function render() {
  const list = $('task-list');
  list.replaceChildren(...tasks.map(taskRow));

  const cal = $('calendar');
  cal.replaceChildren(
    ...WEEKDAYS.map((name, i) => {
      const day = document.createElement('div');
      day.className = 'cal-day';
      day.innerHTML = `<p class="weekday">${name}</p><p class="daynum">${16 + i}</p>`;
      tasks.filter((t) => t.day === i).forEach((t) => day.append(taskRow(t)));
      return day;
    }),
  );
  $('no-time-list').replaceChildren(...tasks.filter((t) => t.day === null).map(taskRow));
  $('spins-count').textContent = spins;
}

function fillEmojiPanel(panel, onPick) {
  panel.replaceChildren(
    ...EMOJIS.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-option';
      b.textContent = e.glyph;
      b.disabled = !e.unlocked;
      b.title = e.unlocked ? '' : 'Закрыто — выпадает на колесе';
      b.addEventListener('click', () => onPick(e.glyph));
      return b;
    }),
  );
}

function openEdit(task) {
  $('edit-title').value = task.title;
  $('edit-emoji-chips').replaceChildren(emojiStack(task.emojis));
  $('edit-emoji-panel').hidden = true;
  $('edit-modal').hidden = false;
}

function setView(view) {
  const calendar = view === 'calendar';
  $('list-view').hidden = calendar;
  $('calendar-view').hidden = !calendar;
  $('view-list').setAttribute('aria-pressed', String(!calendar));
  $('view-calendar').setAttribute('aria-pressed', String(calendar));
}

function buildWheel() {
  const wheel = $('wheel');
  PRIZES.forEach((label, i) => {
    const el = document.createElement('div');
    el.className = 'wheel-label';
    const angle = i * 45 + 22.5 - 90;
    el.style.transform = `rotate(${angle}deg) translateX(125px)`;
    el.textContent = label;
    wheel.append(el);
  });
  $('wheel-legend').replaceChildren(
    ...PRIZES.map((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      return li;
    }),
  );
}

let rotation = 0;
function spin() {
  if (spins <= 0) {
    $('wheel-overlay').hidden = true;
    $('spins-banner').hidden = false;
    return;
  }
  spins -= 1;
  const index = Math.floor(Math.random() * PRIZES.length);
  rotation += 360 * 4 + (360 - (index * 45 + 22.5));
  $('wheel').style.transform = `rotate(${rotation}deg)`;
  $('wheel-result').textContent = '';
  setTimeout(() => {
    $('wheel-result').textContent = `Выпало: ${PRIZES[index]}`;
    render();
  }, 4000);
}

function showState(state) {
  document.querySelectorAll('.modal, .overlay, .emoji-panel').forEach((el) => (el.hidden = true));
  setView(state === 'calendar' ? 'calendar' : 'list');
  if (state === 'emoji') $('new-emoji-panel').hidden = false;
  if (state === 'edit') openEdit(tasks[0]);
  if (state === 'wheel') $('wheel-overlay').hidden = false;
  if (state === 'banner') $('spins-banner').hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  buildWheel();
  render();
  fillEmojiPanel($('new-emoji-panel'), () => ($('new-emoji-panel').hidden = true));
  fillEmojiPanel($('edit-emoji-panel'), () => ($('edit-emoji-panel').hidden = true));

  $('view-list').addEventListener('click', () => setView('list'));
  $('view-calendar').addEventListener('click', () => setView('calendar'));
  $('new-emoji-btn').addEventListener('click', () => ($('new-emoji-panel').hidden = !$('new-emoji-panel').hidden));
  $('edit-emoji-btn').addEventListener('click', () => ($('edit-emoji-panel').hidden = !$('edit-emoji-panel').hidden));
  $('new-task-form').addEventListener('submit', (e) => e.preventDefault());
  $('play-button').addEventListener('click', () => ($('wheel-overlay').hidden = false));
  $('wheel-spin').addEventListener('click', spin);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ($(b.dataset.close).hidden = true)));
  document.querySelectorAll('[data-state]').forEach((b) => b.addEventListener('click', () => showState(b.dataset.state)));
});
