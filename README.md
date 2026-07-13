# Wyszukiwarka zaburzeń psychicznych (ICD-11 / DSM-5) — wersja offline, bez logowania

Aplikacja webowa, która pozwala wyszukać zaburzenie psychiczne po nazwie, kodzie
ICD-11 lub (przybliżonym) kodzie DSM-5. **Nie wymaga zakładania konta ani
logowania się nigdzie** — wszystkie dane są wbudowane w stronę.

## Dlaczego bez logowania (i co to oznacza)

Poprzednia wersja korzystała z oficjalnego API ICD-11 WHO na żywo, co wymagało
własnego (darmowego, ale osobistego) konta i klucza dostępu. Ta wersja tego nie
robi — i mimo to potrafi pobierać aktualne dane na bieżąco:

- **Pełna lista rozdziału 06 ICD-11** ("Mental, behavioural or
  neurodevelopmental disorders") — 884 pozycje (kody + nazwy + hierarchia) —
  jest pobierana **na żywo, bezpośrednio w przeglądarce użytkownika**, z
  publicznego pliku, który WHO udostępnia bez logowania:
  `https://icdcdn.who.int/static/releasefiles/2024-01/SimpleTabulation-ICD-11-MMS-en.zip`
  (link "Spreadsheet File" na stronie https://icd.who.int/browse/2024-01/mms/en).
  Ten serwer WHO wysyła nagłówek `Access-Control-Allow-Origin: *`, więc
  przeglądarka może pobrać ten plik bezpośrednio z dowolnej domeny — bez
  backendu, bez CORS proxy, bez konta. Plik ZIP jest rozpakowywany w
  przeglądarce (biblioteka [fflate](https://github.com/101arrowz/fflate),
  ok. 8 KB, wczytywana z CDN).
  Ten plik zawiera nazwy **po angielsku** — ICD-11 nie ma jeszcze pełnego
  polskiego tłumaczenia w publicznie dostępnych materiałach.
- Jeśli pobranie na żywo się nie uda (brak internetu, WHO zmieni adres pliku,
  timeout) — strona **automatycznie przełącza się** na wbudowaną kopię
  zapasową `public/data/icd11-chapter06-full.json` (zrzut z wydania 2024-01),
  więc wyszukiwarka działa zawsze, nawet offline. Pasek statusu nad wynikami
  pokazuje, z którego źródła aktualnie korzystasz.
- **95 najczęściej używanych diagnoz** ma dodatkowo: polską nazwę, przybliżony
  kod DSM-5 i krótki, autorski opis kliniczny (patrz niżej) —
  `data/dsm5-icd11-crosswalk.json` (to zawsze wczytywane lokalnie, bo nie
  istnieje publiczne, darmowe API do tych treści).
- Reszta pozycji (spoza tych 95) pokazuje tylko angielski tytuł, kod i link do
  oficjalnej, bezpłatnej przeglądarki ICD-11 (`icd.who.int/browse11`), gdzie
  można sprawdzić pełny, oficjalny opis — też bez logowania.

## Ważne ograniczenie: skąd biorą się opisy

WHO nie udostępnia pełnych definicji/wytycznych diagnostycznych ICD-11 bez
logowania (te dane są dostępne tylko przez API wymagające konta, albo przez
przeglądarkę, która renderuje się w JavaScript i nie da się jej masowo pobrać
bez naruszenia zasad). Dlatego 95 krótkich opisów w tej aplikacji to **mój
własny, autorski skrót** przygotowany na podstawie ogólnodostępnej wiedzy
klinicznej — nie jest to dosłowny cytat z ICD-11 ani DSM-5-TR. Każdy wynik ma
link do oficjalnej przeglądarki, gdzie można zweryfikować pełny, oficjalny
tekst.

Podobnie, kody DSM-5 nie mają publicznego API — to materiał objęty prawami
APA — dlatego mapowanie DSM-5 → ICD-11 jest ręczne i przybliżone.

## Uruchomienie

Potrzebujesz tylko Node.js (wersja 14+, pobierz z https://nodejs.org). Brak
jakichkolwiek kont, kluczy API czy `npm install` — `server.js` nie ma żadnych
zależności.

```bash
node server.js
```

Otwórz w przeglądarce: http://localhost:3000

(Serwer jest wyłącznie po to, żeby przeglądarka mogła wczytać pliki
`data/*.json` — otwarcie `public/index.html` bezpośrednio z dysku przez
podwójne kliknięcie często nie zadziała, bo przeglądarki blokują wczytywanie
lokalnych plików JSON przez `fetch()` z protokołu `file://`.)

## Struktura projektu

- `server.js` — mikroskopijny serwer statyczny (wbudowany moduł `http`,
  zero zależności, zero sieci na zewnątrz).
- `public/index.html`, `public/styles.css`, `public/app.js` — cała logika
  wyszukiwania działa **w przeglądarce**, na wczytanych lokalnie plikach JSON.
  Trzy tryby: nazwa / kod ICD-11 / kod DSM-5.
- `public/data/icd11-chapter06-full.json` — 884 pozycje pełnej listy rozdziału
  06 ICD-11 (kod, tytuł po angielsku, typ węzła, link do oficjalnej
  przeglądarki), z publicznego pliku WHO.
- `public/data/dsm5-icd11-crosswalk.json` — 95 najczęstszych diagnoz z polską
  nazwą, kodem DSM-5 i krótkim autorskim opisem.

## Aktualizacja danych w przyszłości

Jeśli WHO wyda nowszą wersję ICD-11 (np. 2025-01), możesz pobrać nowy plik
`SimpleTabulation-ICD-11-MMS-en.zip` z https://icd.who.int/browse/releases/mms
i podmienić `public/data/icd11-chapter06-full.json` — format kolumn
(Foundation URI, Code, Title, ClassKind, ChapterNo, BrowserLink...) pozostaje
zwykle taki sam.

## Ograniczenia, o których warto wiedzieć

- Pełna lista rozdziału 06 jest po angielsku (WHO nie ma jeszcze kompletnego
  polskiego tłumaczenia w publicznych materiałach bez logowania).
- 95 opisów to autorskie streszczenia, nie oficjalny tekst ICD-11/DSM-5-TR.
- Mapowanie DSM-5 jest przybliżone — DSM-5 koduje się w USA kodami
  ICD-10-CM, nie ma osobnej, publicznej numeracji.
- Pobieranie na żywo zależy od tego, czy WHO utrzyma ten sam publiczny adres
  pliku i te same nagłówki CORS — to ich wewnętrzna infrastruktura, nie
  oficjalnie gwarantowane API, więc może się kiedyś zmienić (stąd wbudowana
  kopia zapasowa jako siatka bezpieczeństwa).
- To projekt edukacyjny, nie narzędzie diagnostyczne.
