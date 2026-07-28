# Document Intelligence Plugin

Classifies financial documents deterministically, extracts structured fields
through a pluggable parser architecture, validates the result, prevents
duplicate imports, and maps extracted transactions into the existing
Ingestion Pipeline — **mock OCR and rule-based classification only**. No
cloud OCR provider, no LLM-based extraction, and no real file upload/storage
is implemented; see [OCR Interface](#ocr-interface) for exactly where a real
provider replaces the mock layer.

## Architecture

```
plugins/document-intelligence/
  types.ts            All shared types (DocumentType, ExtractedFields, DocumentRecord, ...).
  ocr.ts                OCR Interface (OCRProvider) + MockOCRProvider, the only implementation shipped.
  mock-documents.ts      Fixture OCR text for every supported document type + edge-case scenarios.
  classifier.ts          Document Classifier — deterministic, weighted-keyword rule scoring.
  parsers.ts              Parser Selection + per-type Structured Field Extraction (pure regex/scanning).
  validation.ts           Field-level Validation — amounts, dates, currency codes, required fields.
  engine.ts               The Parsing Engine — composes ocr.ts + classifier.ts + parsers.ts.
  registry.ts             Document Registry — persisted metadata, extraction status, duplicate lookup, statistics.
  pipeline.ts             Orchestrator — Validation -> Duplicate Detection -> Transaction Mapping -> Ingestion -> Workflow Engine.
  plugin.ts               Plugin Framework registration; Feed/Search/Coach contributions.
  __tests__/              Vitest suite covering every required mock scenario.
```

`classifier.ts`, `ocr.ts`, `parsers.ts`, `validation.ts`, and `registry.ts`
never import each other or React — each is independently testable and
usable standalone. `engine.ts` composes the first three into analysis;
`pipeline.ts` composes `engine.ts`, `validation.ts`, and `registry.ts` into
the full business process; `plugin.ts` is the only file that talks to the
Plugin Framework, Feed Engine, Semantic Index, or AI Coach.

## Pipeline order

```
Document (RawDocumentFile)
  -> ocr.ts's OCRProvider.extractText()        [OCR/Text Extraction — mock]
  -> classifier.ts's classifyDocument()        [type + confidence + matchedRules]
  -> parsers.ts's getParser(type)              [Parser Selection]
  -> the selected parser                        [Structured Fields Extraction]
       (the three steps above together are engine.ts's analyzeDocument())
  -> validation.ts's validateFields()          [Validation]
  -> registry.ts's findDuplicate()             [Duplicate Detection]
       (the two steps above, plus persisting the DocumentRecord, are
        pipeline.ts's processDocument() — no storage/workflow side effects yet)
  -> pipeline.ts's Transaction Mapping          [ExtractedTransactionLine -> IngestInput]
  -> lib/ingestion/pipeline.ts's ingestTransaction()
       -> Merchant Intelligence -> AI Memory -> Classifier   (automatic)
  -> lib/storage.ts's addTransactions()
  -> lib/workflows/engine.ts's runWorkflowsForTrigger("transaction-imported", ...)
       (the four steps above are pipeline.ts's importDocument() — never bypassed)
  -> Feed / Search / Coach — plugin.ts's contributors read registry.ts directly
  -> lib/intelligence/orchestrator.ts's buildFinancialState() picks all of this up
     automatically — no orchestrator-level code needed for this plugin.
```

**Note on ordering**: the spec's stage list places the Classifier before OCR/
Text Extraction. Since classification and parser selection both need the
document's text to run against, this implementation — like any real OCR
pipeline — extracts text first, then classifies. Every stage the spec names
still runs, in the same relative order relative to each other (Classifier
before Parser Selection before Structured Fields before Validation before
Duplicate Detection before Transaction Mapping before Ingestion).

## OCR Interface

```ts
export interface OCRProvider {
  readonly id: string;
  readonly name: string;
  extractText(file: RawDocumentFile): Promise<OCRResult>;
}
```

`MockOCRProvider` (the only implementation shipped) looks up
`mock-documents.ts`'s fixture text by `file.mockTextKey` instead of running
real OCR. A real provider — Tesseract, Apple Vision, Google ML Kit, Azure
Document Intelligence, AWS Textract, Google Document AI, or a batch/
multi-page/multi-language pipeline — implements the same interface and is
passed to `engine.ts`'s `analyzeDocument(file, provider)` instead; nothing in
`classifier.ts`, `parsers.ts`, `validation.ts`, `registry.ts`, or `pipeline.ts`
needs to change.

## Document Classifier

Deterministic, weighted-keyword scoring — no LLM, no ML model. Every
document type has a fixed list of regex rules with a weight; the type
whose matched rules sum to the highest score wins, and `confidence` is that
score normalized against the winning type's own total possible weight.
A document matching nothing scores 0 for every type and is classified
`unknown` rather than guessed at. `matchedRules` names every rule that fired,
shown in the Upload Preview for transparency.

## Structured Field Extraction

Extracted when available: Merchant, Amount, Currency, Tax, Discount, Total,
Invoice Number, Receipt Number, Account Number (already masked), Statement
Period, Transaction List, Payment Method, Reference Number, Due Date, Issue
Date, Balance, Raw Text, and a 0–1 extraction Confidence (OCR confidence ×
field-completeness ratio). A scanned page containing more than one document
back to back (see the "Multiple Receipts" fixture) is split on a page-break
marker and each sub-document contributes its own transaction line.

## Validation

`validation.ts`'s `validateFields(documentType, fields)` checks: amounts are
non-negative numbers and at least one of amount/total/balance is present
(except for `unknown` documents), dates are valid calendar dates, currency is
a recognized code, and each document type's own identifying field(s) (e.g. an
Invoice needs an `invoiceNumber`; a Bank Statement needs an `accountNumber`
and `statementPeriod`) are present. Empty extracted text short-circuits to a
single `malformed-document` error. Only `missing-amount` and
`malformed-document` block Import outright — a missing identifying field is
reported but doesn't prevent Import Anyway/Edit Fields from resolving it.

## Duplicate Detection

`registry.ts`'s `findDuplicate()` keys a document on its own invoice/receipt/
reference number when one was extracted (the strongest signal), or a
fallback fingerprint of merchant + amount + date, always prefixed by document
type so a Receipt and an Invoice sharing a number never collide. A flagged
duplicate is still recorded (visible in Document History) but
`pipeline.ts`'s `importDocument()` refuses to import it unless the caller
passes `{ force: true }` — an explicit override, never silent.

## Document Registry

`registry.ts` persists every `DocumentRecord` (original file metadata,
classification/extraction outcome, validation errors, duplicate flag, status,
parser used, linked transaction ids) in `localStorage`, queryable by id or
status, plus `computeStatistics()` for the dashboard. This is also what
`plugin.ts`'s Search contributor indexes.

## Plugin Framework integration

- **Registration**: `plugin.ts` exports `documentIntelligencePlugin`, added
  to `lib/plugins/loader.ts`'s built-in plugin list.
- **Feed**: registers a Feed contributor producing `"<Type> Imported"` (e.g.
  "Receipt Imported", "Bank Statement Imported"), `"Duplicate <Type>"`,
  `"Extraction Failed"`, and `"New Transactions Found"` (alongside a
  successful import that produced at least one transaction) — covering
  every event the spec names, generalized across document type.
- **Search**: registers an Index contributor (`registerIndexContributor`)
  indexing every document under a new `"document"` `IndexObjectType`, with
  invoice/receipt/reference numbers, statement period, and linked
  transaction ids in its metadata.
- **Coach**: registers via `lib/coach/contributors.ts`'s existing
  `registerCoachImportSummaryContributor` (the same extension point
  `plugins/account-aggregator/plugin.ts` uses) — structured counts only
  (documents processed, imported, duplicates prevented, failures, last
  import time). The Coach only narrates these; it never re-runs OCR,
  classification, or extraction itself. A richer narrative ("one recurring
  utility payment and one new merchant were detected") would need a
  dedicated extension point cross-referencing the Recurring Transaction and
  Merchant Registry engines — deliberately out of scope here rather than
  fabricated.
- **Workflow Engine**: `pipeline.ts`'s `importDocument()` fires the existing
  `"transaction-imported"` trigger via `runWorkflowsForTrigger` for every
  transaction it maps — the same trigger every other transaction source
  already traces through. Never bypassed.

## Dashboard

`/documents` (`app/documents/page.tsx`, backed by
`components/DocumentIntelligenceDashboard.tsx`): Upload (pick a mock sample
document), Upload Preview (`DocumentPreview.tsx` — detected type, confidence,
`ExtractionSummary.tsx`'s field grid and transaction list, validation errors,
and Import/Edit Fields/Skip/Reject actions), `DocumentStatistics.tsx`, and
`DocumentHistory.tsx` (every document ever processed, with status, extraction
confidence via `OCRConfidenceBadge.tsx`, transactions extracted, duplicate
flag, and error count). The generic `/plugins` page links here via a
"Manage" button on this plugin's card.

## Statistics

`registry.ts`'s `computeStatistics()`: Documents Imported, OCR Success Rate
(non-empty extracted text ÷ total processed), Parser Accuracy (classified as
a known type, not `unknown`, ÷ total processed), Average Extraction Time,
Duplicates Prevented, Transactions Extracted, and Unknown Documents Count.

## Testing

`npm test` runs the Vitest suite in `__tests__/`: every document type
classifies and extracts its expected fields (Receipt, Invoice, Bank
Statement, Credit Card Statement, Utility Bill, Salary Slip, Insurance
Receipt, Investment Statement, Loan Statement), plus Malformed Receipt
(missing amount blocks Import), Duplicate Receipt (flagged, blocked without
`force`, importable with it), Unknown Document (classified but not blindly
importable), Empty Document (`malformed-document`, blocked), Multiple
Receipts (one page, two transaction lines), and `editDocumentFields` turning
a blocked import into a successful one. `classifier.test.ts` and
`validation.test.ts` cover the Classifier and Validation modules in
isolation, with no OCR/registry/pipeline involved.

## Explicitly out of scope for this milestone

Real OCR APIs (Google ML Kit, Azure, AWS Textract, OpenAI/Gemini Vision,
etc.), LLM-based extraction or classification, cloud uploads, authentication,
backend services, external storage, bank integrations, and any
credit-consuming external call.
