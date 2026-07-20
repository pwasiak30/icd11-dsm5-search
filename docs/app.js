(function () {
  const modeButtons = document.querySelectorAll('.mode-btn');
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const hint = document.getElementById('search-hint');
  const resultsEl = document.getElementById('results');
  const detailEl = document.getElementById('detail');
  const statusEl = document.getElementById('status-line');

  const HINTS = {
    name: 'Wpisz fragment nazwy, np. "depresja", "lek", "schizofrenia" (po polsku) albo "anxiety", "psychotic" (po angielsku - pelna lista 884 pozycji rozdzialu 06 ICD-11 jest w oryginale anglojezyczna).',
    icd11: 'Wpisz kod ICD-11, np. 6A70, 6B00, 6D10.',
    icd10: 'Wpisz kod ICD-10-CM, np. F32.9, F41.1, F90.0. Wyszukiwanie w recznie zweryfikowanej tabeli mapowania (95 diagnoz).',
    dsm5: 'Wpisz kod DSM-5, np. 296.2x, 300.02, 309.81. Wyszukiwanie w recznie przygotowanej tabeli mapowania (95 diagnoz).',
  };

  let currentMode = 'name';
  let crosswalk = null;
  let chapter06 = null;
  let dataReady = false;

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      hint.textContent = HINTS[currentMode];
      resultsEl.innerHTML = '';
      detailEl.hidden = true;
    });
  });

  hint.textContent = HINTS[currentMode];

  // Publiczny, nie wymagajacy logowania eksport WHO (ICD-11 MMS, "Spreadsheet File" ze strony
  // https://icd.who.int/browse/2024-01/mms/en). Serwer WHO wysyla naglowek
  // "Access-Control-Allow-Origin: *", wiec przegladarka moze pobrac ten plik bezposrednio - bez
  // backendu i bez konta. Jesli WHO wyda nowsze wydanie, wystarczy zmienic numer wersji ponizej.
  const WHO_RELEASE = '2024-01';
  const WHO_ZIP_URL = `https://icdcdn.who.int/static/releasefiles/${WHO_RELEASE}/SimpleTabulation-ICD-11-MMS-en.zip`;
  const WHO_CHAPTER_MENTAL = '06';
  const LIVE_FETCH_TIMEOUT_MS = 15000;

  function parseWhoTabulationTxt(txt) {
    const lines = txt.split(/\r?\n/).filter((l) => l.length > 0);
    const entries = [];
    let versionLabel = '';
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (cols.length < 10) continue;
      const [foundationUri, , code, blockId, rawTitle, classKind, depth, , chapterNo, browserLink] = cols;
      if (chapterNo.trim() !== WHO_CHAPTER_MENTAL) continue;
      let browserUrl = '';
      const bIdx = browserLink.indexOf('https://icd.who.int');
      if (bIdx !== -1) {
        const end = browserLink.indexOf('"', bIdx);
        browserUrl = end !== -1 ? browserLink.slice(bIdx, end) : browserLink.slice(bIdx);
      }
      entries.push({
        code: code.trim(),
        blockId: blockId.trim(),
        title: rawTitle.trim().replace(/^"|"$/g, '').replace(/^[-\s]+/, ''),
        classKind: classKind.trim(),
        depth: parseInt(depth, 10) || null,
        isLeaf: cols[10] ? cols[10].trim() === 'True' : false,
        browserUrl,
        foundationUri: foundationUri.trim(),
      });
      if (!versionLabel && cols[17]) versionLabel = cols[17].trim();
    }
    return { entries, versionLabel };
  }

  async function fetchLiveChapter06() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(WHO_ZIP_URL, { signal: controller.signal });
      if (!resp.ok) throw new Error(`WHO odpowiedzialo statusem ${resp.status}`);
      const buf = new Uint8Array(await resp.arrayBuffer());
      const unzipped = await new Promise((resolve, reject) => {
        window.fflate.unzip(buf, (err, files) => (err ? reject(err) : resolve(files)));
      });
      const fileName = Object.keys(unzipped).find((n) => n.endsWith('.txt') && !n.toLowerCase().includes('readme'));
      if (!fileName) throw new Error('Brak pliku .txt w archiwum WHO.');
      const txt = window.fflate.strFromU8(unzipped[fileName]);
      const { entries, versionLabel } = parseWhoTabulationTxt(txt);
      if (entries.length === 0) throw new Error('Sparsowano 0 pozycji - format pliku mogl sie zmienic.');
      return { count: entries.length, entries, source: 'live', versionLabel, release: WHO_RELEASE };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadData() {
    statusEl.textContent = 'Probuje pobrac aktualna baze na zywo z WHO (bez logowania)...';

    const cwPromise = fetch('data/dsm5-icd11-crosswalk.json').then((r) => r.json());

    try {
      const [live, cw] = await Promise.all([fetchLiveChapter06(), cwPromise]);
      chapter06 = live;
      crosswalk = cw;
      dataReady = true;
      statusEl.textContent =
        `Na zywo z WHO (wydanie ${live.release}${live.versionLabel ? ', ' + live.versionLabel : ''}): ` +
        `${live.entries.length} pozycji rozdzialu 06 ICD-11 + ${crosswalk.entries.length} dopasowan DSM-5.`;
      return;
    } catch (liveErr) {
      console.warn('Nie udalo sie pobrac danych na zywo z WHO, przelaczam na wbudowana kopie zapasowa:', liveErr);
    }

    try {
      const [chRes, cw] = await Promise.all([
        fetch('data/icd11-chapter06-full.json').then((r) => r.json()),
        crosswalk || cwPromise,
      ]);
      chapter06 = { ...chRes, source: 'bundled' };
      crosswalk = crosswalk || cw;
      dataReady = true;
      statusEl.textContent =
        `Nie udalo sie pobrac danych na zywo (brak internetu lub WHO zmienilo adres pliku) - uzywam wbudowanej ` +
        `kopii zapasowej z wydania 2024-01: ${chapter06.entries.length} pozycji + ${crosswalk.entries.length} dopasowan DSM-5.`;
    } catch (fallbackErr) {
      statusEl.textContent = 'Nie udalo sie wczytac zadnych danych (ani na zywo, ani z kopii lokalnej).';
    }
  }
  loadData();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || !dataReady) return;
    detailEl.hidden = true;

    if (currentMode === 'name') {
      renderNameResults(searchByName(q));
    } else if (currentMode === 'icd11') {
      renderIcd11Results(searchByIcd11Code(q));
    } else if (currentMode === 'icd10') {
      renderIcd10Results(searchByIcd10Code(q));
    } else if (currentMode === 'dsm5') {
      renderDsm5Results(searchByDsm5Code(q));
    }
  });

  function norm(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function searchByName(q) {
    const nq = norm(q);
    const fromCrosswalk = crosswalk.entries
      .filter((e) => norm(e.icd11Name).includes(nq) || norm(e.dsm5Name).includes(nq) || norm(e.category).includes(nq))
      .map((e) => ({ title: e.icd11Name, code: e.icd11Code, source: 'crosswalk', entry: e }));

    const fromChapter = chapter06.entries
      .filter((e) => e.classKind === 'category' && norm(e.title).includes(nq))
      .slice(0, 60)
      .map((e) => ({ title: e.title, code: e.code, source: 'chapter06', entry: e }));

    const seenCodes = new Set(fromCrosswalk.map((r) => r.code));
    const merged = [...fromCrosswalk, ...fromChapter.filter((r) => !seenCodes.has(r.code))];
    return merged.slice(0, 80);
  }

  function searchByIcd11Code(q) {
    const nq = q.trim().toUpperCase();
    const fromCrosswalk = crosswalk.entries.filter((e) => e.icd11Code.toUpperCase().includes(nq));
    const fromChapter = chapter06.entries.filter((e) => e.code && e.code.toUpperCase().includes(nq));
    const seenCodes = new Set(fromCrosswalk.map((r) => r.icd11Code));
    const merged = [
      ...fromCrosswalk.map((e) => ({ title: e.icd11Name, code: e.icd11Code, source: 'crosswalk', entry: e })),
      ...fromChapter.filter((e) => !seenCodes.has(e.code)).map((e) => ({ title: e.title, code: e.code, source: 'chapter06', entry: e })),
    ];
    return merged.slice(0, 80);
  }

  function searchByDsm5Code(q) {
    const nq = q.toLowerCase().replace(/\s/g, '');
    return crosswalk.entries
      .filter((e) => e.dsm5Code.toLowerCase().replace(/\s/g, '').includes(nq))
      .map((e) => ({ title: e.dsm5Name, code: e.dsm5Code, source: 'crosswalk', entry: e }));
  }

  function searchByIcd10Code(q) {
    const nq = q.trim().toLowerCase().replace(/\s/g, '');
    return crosswalk.entries
      .filter((e) => e.icd10Code && e.icd10Code.toLowerCase().replace(/\s/g, '').includes(nq))
      .map((e) => ({ title: e.icd11Name, code: e.icd10Code, source: 'crosswalk', entry: e }));
  }

  function renderNameResults(items) {
    renderGenericList(items, (e) => e.category ? `${escapeHtml(e.category)} - ICD-11: ${escapeHtml(e.icd11Code || '(bez kodu)')}` : `ICD-11: ${escapeHtml(e.code || '(bez kodu)')}`);
  }

  function renderIcd11Results(items) {
    renderGenericList(items, (e, item) => item.source === 'crosswalk' ? `DSM-5: ${escapeHtml(e.dsm5Code)}` : 'Pelna lista WHO (bez polskiego tlumaczenia i bez opisu skroconego)');
  }

  function renderIcd10Results(items) {
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<p class="empty">Brak wynikow w tabeli mapowania ICD-10-CM.</p>';
      return;
    }
    renderGenericList(items, (e) => `ICD-11: ${escapeHtml(e.icd11Code)} | DSM-5: ${escapeHtml(e.dsm5Code)}`);
  }

  function renderDsm5Results(items) {
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<p class="empty">Brak wynikow w tabeli mapowania DSM-5. Sprobuj innego zapisu kodu (np. bez "x" na koncu).</p>';
      return;
    }
    renderGenericList(
      items.map((i) => ({ ...i, title: `${i.entry.dsm5Name} (DSM-5: ${i.entry.dsm5Code})` })),
      (e) => `ICD-11: ${escapeHtml(e.icd11Code)} - ${escapeHtml(e.icd11Name)}`
    );
  }

  function renderGenericList(items, metaFn) {
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<p class="empty">Brak wynikow.</p>';
      return;
    }
    resultsEl.innerHTML = '';
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <div class="title">${escapeHtml(item.title || '(bez nazwy)')}</div>
        <div class="meta">${metaFn(item.entry, item)}</div>
      `;
      div.addEventListener('click', () => {
        resultsEl.querySelectorAll('.result-item').forEach((el) => el.classList.remove('active'));
        div.classList.add('active');
        renderDetail(item);
      });
      resultsEl.appendChild(div);
    });
  }

  function renderDetail(item) {
    detailEl.hidden = false;
    const e = item.entry;

    if (item.source === 'crosswalk') {
      detailEl.innerHTML = `
        <h2>${escapeHtml(e.icd11Name)}</h2>
        <div class="codes">
          <span class="badge">ICD-11: ${escapeHtml(e.icd11Code)}</span>
          ${e.icd10Code ? `<span class="badge">ICD-10-CM: ${escapeHtml(e.icd10Code)}</span>` : ''}
          <span class="badge">DSM-5: ${escapeHtml(e.dsm5Code)}</span>
          <span class="badge">Kategoria: ${escapeHtml(e.category)}</span>
        </div>
        <section>
          <h3>Opis</h3>
          <p>${escapeHtml(e.opis || 'Brak przygotowanego opisu dla tej pozycji.')}</p>
        </section>
        <section>
          <h3>Nazwa w DSM-5</h3>
          <p>${escapeHtml(e.dsm5Name)}</p>
        </section>
        <p class="small-note">Opis przygotowany autorsko na podstawie ogolnodostepnej wiedzy klinicznej - nie jest doslownym cytatem z ICD-11 ani DSM-5-TR.
        Pelny, oficjalny tekst mozesz sprawdzic bezplatnie (bez logowania) w
        <a class="browser-link" href="https://icd.who.int/browse11/l-m/en" target="_blank" rel="noopener">oficjalnej przegladarce ICD-11 WHO</a>, wpisujac kod ${escapeHtml(e.icd11Code)}.</p>
      `;
    } else {
      detailEl.innerHTML = `
        <h2>${escapeHtml(e.title)}</h2>
        <div class="codes">
          ${e.code ? `<span class="badge">ICD-11: ${escapeHtml(e.code)}</span>` : ''}
          <span class="badge">Typ: ${escapeHtml(e.classKind)}</span>
        </div>
        <section>
          <p>Ta pozycja pochodzi z pelnej, oficjalnej listy rozdzialu 06 ICD-11 (publiczny eksport WHO, bez logowania), ale nie ma jeszcze przygotowanego polskiego opisu skroconego w tej aplikacji.</p>
        </section>
        ${e.browserUrl ? `<p><a class="browser-link" href="${escapeAttr(e.browserUrl)}" target="_blank" rel="noopener">Zobacz pelny, oficjalny opis w przegladarce ICD-11 -></a></p>` : ''}
      `;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
