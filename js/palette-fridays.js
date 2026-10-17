// Palette Fridays (/friday.html). Port of the live js/fridays.js of 16/10/2026 (same logic, same visible strings):
// - a note is shown only once its date (UTC, toISOString) has come; #YYYY-MM-DD deep-links a note that is open, and
//   a note that is not open yet says when it opens while today's note stays below;
// - "Available now · Next feature: <date>" until the last date, then "The four-week series is complete…";
// - share: navigator.share, else the clipboard ("Return link copied ✓"), else a plain instruction.
// Added on the port: swatches carry role="img" so their label is read; a note change settles in (CSS class .swap).
(function () {
  var data = document.querySelector('#notes-data');
  if (!data) return;
  var notes = JSON.parse(data.textContent);
  var $ = function (s) { return document.querySelector(s); };
  var first = true;

  function render() {
    var today = new Date().toISOString().slice(0, 10);
    var requested = location.hash.slice(1);
    var available = notes.filter(function (n) { return n.date <= today; });
    var candidate = notes.find(function (n) { return n.date === requested; });
    var note = candidate && candidate.date <= today ? candidate : available[available.length - 1] || notes[0];
    var changed = $('#note-title').textContent !== note.title;

    $('#note-title').textContent = note.title;
    $('#note-deck').textContent = note.deck;
    $('#note-text').textContent = note.text;
    $('#note-question').textContent = note.question;
    $('#note-image').src = note.image;
    $('#note-image').alt = note.title + ' — companion image';
    $('#note-cta').href = note.url;
    $('#note-cta').textContent = note.cta + ' →';
    $('#note-palette').replaceChildren.apply($('#note-palette'), (note.palette || []).map(function (color) {
      var s = document.createElement('span');
      s.className = 'swatch';
      s.setAttribute('role', 'img');
      s.style.backgroundColor = color;
      s.title = color;
      s.setAttribute('aria-label', 'Suggested color ' + color);
      return s;
    }));
    var next = notes.find(function (n) { return n.date > today; });
    $('#note-availability').textContent = candidate && candidate.date > today
      ? 'That feature opens on ' + candidate.date + '. Today’s note is ready below.'
      : next ? 'Available now · Next feature: ' + next.date
        : 'The four-week series is complete. Every feature is now in the archive.';

    var article = $('#note');
    if (article && changed && !first) {
      article.classList.remove('swap'); void article.offsetWidth; article.classList.add('swap');
    }
    first = false;
  }

  render();
  addEventListener('hashchange', render);

  var button = $('#save-return');
  button.addEventListener('click', async function () {
    var url = location.href, title = $('#note-title').textContent;
    try {
      if (navigator.share) { await navigator.share({ title: title, url: url }); }
      else {
        await navigator.clipboard.writeText(url);
        button.textContent = 'Return link copied ✓';
        $('#save-note').textContent = 'You can paste this public link wherever you want to keep or share it.';
      }
    } catch (e) {
      $('#save-note').textContent = 'Use your browser’s Share command, or copy this page’s address.';
    }
  });
})();
