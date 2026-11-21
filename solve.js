// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Returns exactly csv-reader's {columns, rows, errors} for every {text, header}.
// Single pass, slice-based: fields are extracted with String.slice after a
// delimiter scan, never built character by character. Quoted fields jump with
// indexOf; only fields containing an embedded line break or a doubled quote
// take the segment path. Pure: no clock, no randomness, no state kept.

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (true) {
    // Lines with no characters are no records (LF or CRLF only).
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos++; line++; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; }
      else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = 0; // 0 comma, 1 line break, 2 end
    let lastQuoted = false;
    let value;

    do {
      let quotedClosed = false;
      let prefix = null; // non-null: continue this field with the unquoted scan
      let junkCheck = false;

      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        const openLine = line;
        pos++;
        let parts = null;
        let closed = false;
        while (true) {
          const q = text.indexOf('"', pos);
          if (q === -1) {
            // The quote never closes: literal character, text after it read
            // again as unquoted.
            pos = open + 1;
            line = openLine;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            prefix = '"';
            break;
          }
          // A line break inside the quotes before the next quote?
          const iLF = text.indexOf('\n', pos);
          const iCR = text.indexOf('\r', pos);
          let nl = -1;
          if (iLF !== -1 && iLF < q) nl = iLF;
          if (iCR !== -1 && iCR < q && (nl === -1 || iCR < nl)) nl = iCR;
          if (nl !== -1) {
            if (parts === null) parts = [];
            parts.push(text.slice(pos, nl), '\n');
            line++;
            pos = text.charCodeAt(nl) === 13 && text.charCodeAt(nl + 1) === 10 ? nl + 2 : nl + 1;
            continue;
          }
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: one literal quote.
            if (parts === null) parts = [];
            parts.push(text.slice(pos, q), '"');
            pos = q + 2;
            continue;
          }
          // Closing quote.
          if (parts === null) value = text.slice(pos, q);
          else { parts.push(text.slice(pos, q)); value = parts.join(''); }
          pos = q + 1;
          closed = true;
          break;
        }
        if (closed) {
          if (pos >= n) { ended = 2; quotedClosed = true; }
          else {
            const c = text.charCodeAt(pos);
            if (c === 44) { pos++; ended = 0; quotedClosed = true; }
            else if (c === 10) { pos++; line++; ended = 1; quotedClosed = true; }
            else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; ended = 1; quotedClosed = true; }
            else {
              // What follows the closing quote is appended as it stands.
              prefix = value;
              junkCheck = true;
            }
          }
        }
      } else {
        lastQuoted = false;
        prefix = '';
      }

      if (!quotedClosed) {
        // Unquoted scan from pos, starting from prefix: up to the next comma
        // or line break. A CR not followed by LF is dropped (stray_cr).
        let start = pos;
        let parts = null;
        let done = false;
        while (pos < n) {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            value = parts === null ? prefix + text.slice(start, pos) : prefix + parts.join('') + text.slice(start, pos);
            pos++;
            ended = 0;
            done = true;
            break;
          }
          if (c === 10) {
            value = parts === null ? prefix + text.slice(start, pos) : prefix + parts.join('') + text.slice(start, pos);
            pos++;
            line++;
            ended = 1;
            done = true;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(pos + 1) === 10) {
              value = parts === null ? prefix + text.slice(start, pos) : prefix + parts.join('') + text.slice(start, pos);
              pos += 2;
              line++;
              ended = 1;
              done = true;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (parts === null) parts = [];
            parts.push(text.slice(start, pos));
            pos++;
            start = pos;
            continue;
          }
          pos++;
        }
        if (!done) {
          value = parts === null ? prefix + text.slice(start, pos) : prefix + parts.join('') + text.slice(start, pos);
          ended = 2;
        }
        if (junkCheck && value.length > prefix.length) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }

      fields.push(value);
    } while (ended === 0);

    // A line left with no characters is no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
