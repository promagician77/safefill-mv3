// Popup. Shows the pending request, runs the fill, shows the report.
// It never receives values: the worker sends statuses and reasons only.
const $ = (id) => document.getElementById(id);

const REASONS = {
  filled: 'Filled',
  'reformatted-by-page': 'Filled; the page reformatted it',
  'already-correct': 'Already had this value',
  'no-match': 'No field matched',
  ambiguous: 'More than one field could take it',
  'shared-field': 'The only matching field also fits another value',
  'read-only': 'Field is read-only',
  disabled: 'Field is disabled',
  'already-filled': 'Field already has something in it',
  'would-truncate': 'Value is longer than the field allows',
  'rejected-by-field': 'Field would not accept this value',
  'rejected-by-page': 'Page cleared the value',
  'no-matching-option': 'No option matches',
  'ambiguous-option': 'More than one option matches',
  'date-format-unknown': 'Field does not say which date format it wants',
  'bad-value': 'Value from your records is malformed',
  'empty-value': 'No value in your records',
  'unknown-key': 'This extension has no rule for this value',
  'duplicate-key': 'Value sent twice',
};

const ERRORS = {
  'no-request': 'No fill request. In the app, open the record and choose Fill on portal.',
  'request-expired': 'The fill request expired. Start it again from the app.',
  'no-tab-access': 'SafeFill cannot read this tab. Open the portal page and try again.',
  'wrong-site': 'This request is for a different site. Nothing was filled.',
  'backend-unavailable': 'Could not get the record from your backend. Nothing was filled.',
  'page-not-fillable': 'This page does not allow extensions to fill it. Nothing was filled.',
  internal: 'Something went wrong. Nothing was filled.',
};

function text(el, value) { el.textContent = value; return el; }

function showState(s) {
  const box = $('state');
  box.replaceChildren();
  if (s && s.pending) {
    box.append(text(document.createElement('b'), s.recordLabel));
    box.append(text(document.createElement('p'), 'Ready to fill on ' + s.portalOrigin.replace('https://', '')));
    $('fill').disabled = false;
  } else {
    box.append(text(document.createElement('p'), ERRORS['no-request']));
    box.firstChild.className = 'muted';
    $('fill').disabled = true;
  }
}

function showResult(res) {
  const box = $('state');
  if (!res || !res.ok) {
    box.replaceChildren(text(document.createElement('p'), ERRORS[(res && res.code) || 'internal'] || ERRORS.internal));
    box.firstChild.className = 'err';
    $('fill').disabled = true;
    return;
  }
  const { summary, items } = res.report;
  box.replaceChildren(text(document.createElement('p'), 'Review every field before you submit.'));
  $('fill').disabled = true;
  $('clear').hidden = false;
  $('result').hidden = false;
  text($('totals'), summary.filled + ' filled, ' + summary.skipped + ' skipped' + (summary.unchanged ? ', ' + summary.unchanged + ' unchanged' : '') + (summary.frames ? '. Embedded frames not scanned: ' + summary.frames : ''));
  const list = $('items');
  list.replaceChildren();
  for (const i of items) {
    const li = document.createElement('li');
    const st = text(document.createElement('span'), i.status === 'filled' ? 'Filled' : i.status === 'unchanged' ? 'Unchanged' : 'Skipped');
    st.className = 'st ' + i.status;
    const body = document.createElement('div');
    body.append(text(document.createElement('span'), i.label));
    let why = REASONS[i.reason] || i.reason;
    if (i.reason === 'ambiguous' && i.candidates.length) why += ': ' + i.candidates.join(', ');
    if (i.reason === 'shared-field' && i.sharedWith.length) why += ' (' + i.sharedWith.join(', ') + ')';
    body.append(text(document.createElement('small'), why));
    li.append(st, body);
    list.append(li);
  }
}

chrome.runtime.sendMessage({ type: 'safefill/status' }).then(showState, () => showState(null));

$('fill').addEventListener('click', async () => {
  $('fill').disabled = true;
  showResult(await chrome.runtime.sendMessage({ type: 'safefill/fill' }));
});

$('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'safefill/clear' });
  $('clear').hidden = true;
});
