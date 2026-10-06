/**
 * Robust CSV parser — handles quoted fields, embedded commas, newlines and BOM.
 * Returns an array of plain objects keyed by header row.
 */
export function parseCSV(src) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  src = src.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];

  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))
  );
}

/**
 * Escape a value for CSV output.
 */
function csvCell(v) {
  v = v == null ? '' : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/**
 * Build a CSV string from an array of prediction objects.
 */
export function predictionsToCSV(predictions) {
  const cols = [
    'ticket_id', 'category', 'secondary_category', 'team',
    'is_urgent', 'confidence', 'needs_human_review', 'model_version',
  ];
  const header = cols.join(',');
  const lines = predictions.map(p =>
    cols.map(c => csvCell(p[c])).join(',')
  );
  return '\uFEFF' + [header, ...lines].join('\n');
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCSV(csvString, filename = 'routed_tickets.csv') {
  const blob = new Blob([csvString], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Generate a realistic sample CSV with multilingual tickets for testing.
 */
export function generateSampleCSV(count = 50) {
  const baseTemplates = [
    { channel: 'chat', subject: 'කෑම ඇනවුම තවම ලැබුනේ නැත', text: 'මගේ කෑම එක තවම ආවෙ නෑ, පැයක් ගියා. රයිඩර් කෝල් එක ආන්සර් කරන්නෙ නෑ. කරුණාකරලා ඉක්මනින් බලන්න.', category: 'delivery_delay' },
    { channel: 'chat', subject: 'உணவு விடுபட்டுள்ளது', text: 'என் ஆர்டரில் ஜூஸ் பாக்கெட் விடுபட்டுள்ளது. ஹோட்டல் காரங்க சேர்க்க மறந்துட்டாங்க, உடனே ரீபண்ட் தாங்க.', category: 'order_missing_wrong' },
    { channel: 'email', subject: 'Double charge on card during checkout', text: 'Card eken 2 times charge wela thiyenne checkout eke glitch ekak nisa. Pls refund excess deduction asap bro.', category: 'payment_refund' },
    { channel: 'call_transcript', subject: 'Driver verbal altercation', text: 'Driver was aggressive during ride dropoff, shouted at me and refused to move vehicle. Need urgent help.', category: 'safety_conduct' },
    { channel: 'chat', subject: 'Car ekata bag eka amathaka una', text: 'Car eke ape luggage bag eka amathaka wela thibba, driver wa contact karala denna puluwanda?', category: 'lost_item' },
    { channel: 'chat', subject: 'Wrong dish received', text: 'I ordered cheese kottu but got vegetable fried rice instead. The bag had another customer name on it.', category: 'order_missing_wrong' },
    { channel: 'email', subject: 'Cold food delivered', text: 'Food was delivered completely cold and spilled all over the container bag. Soup leaked everywhere.', category: 'food_quality' },
    { channel: 'chat', subject: 'Promo code issue', text: 'promo code apply aagala, checkout la discount varala. enna problem?', category: 'account_promo' },
    { channel: 'chat', subject: 'App crashes at checkout', text: 'Whenever I click place order the app crashes back to home screen on iOS 17.', category: 'app_technical' },
    { channel: 'email', subject: 'Restaurant partnership query', text: 'How do I register my cafe as an official restaurant partner on the RideEat merchant platform?', category: 'general_inquiry' }
  ];

  const lines = ['ticket_id,channel,subject,text,category'];
  for (let i = 0; i < count; i++) {
    const tmpl = baseTemplates[i % baseTemplates.length];
    const ticketId = `TK-${8000 + i + 1}`;
    lines.push([
      ticketId,
      csvCell(tmpl.channel),
      csvCell(tmpl.subject),
      csvCell(tmpl.text),
      csvCell(tmpl.category)
    ].join(','));
  }

  return '\uFEFF' + lines.join('\n');
}
