/**
 * Mock document fixtures — stand in for a real OCR provider's text output.
 * Every scenario the milestone asks to be testable (Receipt, Invoice, Bank
 * Statement, Credit Card Statement, Utility Bill, Salary Slip, Insurance
 * Receipt, Investment Statement, Loan Statement, Malformed Receipt,
 * Unknown Document, Empty Document, Multiple Receipts) has a fixture here,
 * keyed by `mockTextKey` — ocr.ts's MockOCRProvider does nothing but look
 * one of these up, exactly where a real provider's actual OCR call would
 * go instead.
 */

export const MOCK_OCR_TEXT: Record<string, string> = {
  receipt: `FreshMart Supermarket
Receipt #RC-58231
Date: 2026-07-10
Payment Method: UPI

Item                Qty   Price
Bread                1     45.00
Milk                 2     60.00
Eggs                 1     72.00

Subtotal: 177.00
Tax: 8.85
Discount: 5.00
Total: 180.85

Thank you for shopping with us!`,

  invoice: `Acme Consulting Services
INVOICE

Invoice Number: INV-2026-0042
Issue Date: 2026-07-01
Due Date: 2026-07-15
Bill To: John Doe

Description                 Amount
Consulting Services         15000.00
Tax (18% GST)                2700.00

Total: 17700.00
Payment Method: Bank Transfer
Reference Number: REF-88213`,

  "bank-statement": `HDFC Bank
Statement of Account
Account Number: XXXX2210
Statement Period: 2026-06-01 to 2026-06-30
Opening Balance: 50000.00

Date        Description          Debit      Credit
2026-06-02  Salary Credit                    55000.00
2026-06-05  Rent Payment         25000.00
2026-06-10  Electricity Bill      1850.00
2026-06-20  Interest Credit                    780.00

Closing Balance: 62150.75`,

  "credit-card-statement": `ICICI Bank Credit Card Statement
Card Number: XXXX9081
Statement Date: 2026-07-05
Statement Period: 2026-06-06 to 2026-07-05
Credit Limit: 100000.00
Minimum Payment Due: 950.00

Date        Description    Amount
2026-06-12  Myntra         3299.00
2026-06-18  Dominos        1200.00

Total Due: 9450.00
Due Date: 2026-07-25`,

  "utility-bill": `BESCOM Electricity Board
Utility Bill
Account Number: XXXX7734
Bill Date: 2026-07-01
Due Date: 2026-07-15
Meter Reading: 4521 units

Amount Due: 1450.00
Payment Method: Net Banking
Reference Number: UTIL-99213`,

  "salary-slip": `Globex Corporation
Payslip for July 2026
Employee ID: EMP-1042
Pay Period: 2026-07-01 to 2026-07-31

Earnings                Amount
Basic Salary            45000.00
HRA                      15000.00
Gross Pay                60000.00

Deductions               Amount
Provident Fund             3600.00
Professional Tax            200.00
Total Deductions            3800.00

Net Pay: 56200.00`,

  "insurance-receipt": `LIC of India
Premium Payment Receipt
Policy Number: POL-882134
Receipt Number: RC-INS-4471
Payment Date: 2026-07-08
Premium Amount: 12500.00
Sum Assured: 500000.00
Payment Method: UPI`,

  "investment-statement": `HDFC Mutual Fund
Portfolio Statement
Folio Number: FOL-337612
Statement Period: 2026-06-01 to 2026-06-30
NAV: 45.32
Units Held: 1250.500
Portfolio Value: 56672.66`,

  "loan-statement": `HDFC Bank Personal Loan
Loan Account Number: XXXX5643
Statement Period: 2026-06-01 to 2026-06-30
EMI Amount: 8500.00
Principal Outstanding: 245000.00
Interest Rate: 11.5%
Due Date: 2026-07-05`,

  "malformed-receipt": `QuickMart
Receipt
Date: 2026-07-11
Thank you for visiting!`,

  "unknown-document": `Dear Resident,

This is a reminder about the upcoming society meeting scheduled for
Saturday at 6 PM in the community hall. Please bring your ID card.

Regards,
Society Management`,

  "empty-document": "",

  "multiple-receipts": `FreshMart Supermarket
Receipt #RC-58231
Date: 2026-07-10
Total: 180.85

--- PAGE BREAK ---

Cafe Coffee Day
Receipt #RC-58232
Date: 2026-07-10
Total: 240.00`,
};

export interface SampleDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mockTextKey: string;
}

/** The dashboard's "Upload" picker offers these — since no real file
 * upload/OCR happens in this milestone, "uploading" means selecting one of
 * these fixtures to run through the pipeline. */
export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  { id: "sample-receipt", fileName: "freshmart-receipt.jpg", mimeType: "image/jpeg", sizeBytes: 84_200, mockTextKey: "receipt" },
  { id: "sample-invoice", fileName: "acme-invoice.pdf", mimeType: "application/pdf", sizeBytes: 132_400, mockTextKey: "invoice" },
  { id: "sample-bank-statement", fileName: "hdfc-statement-june.pdf", mimeType: "application/pdf", sizeBytes: 210_500, mockTextKey: "bank-statement" },
  { id: "sample-credit-card-statement", fileName: "icici-cc-statement.pdf", mimeType: "application/pdf", sizeBytes: 198_300, mockTextKey: "credit-card-statement" },
  { id: "sample-utility-bill", fileName: "bescom-bill-july.jpg", mimeType: "image/jpeg", sizeBytes: 65_100, mockTextKey: "utility-bill" },
  { id: "sample-salary-slip", fileName: "payslip-july-2026.pdf", mimeType: "application/pdf", sizeBytes: 98_700, mockTextKey: "salary-slip" },
  { id: "sample-insurance-receipt", fileName: "lic-premium-receipt.jpg", mimeType: "image/jpeg", sizeBytes: 54_000, mockTextKey: "insurance-receipt" },
  { id: "sample-investment-statement", fileName: "hdfc-mf-portfolio.pdf", mimeType: "application/pdf", sizeBytes: 175_200, mockTextKey: "investment-statement" },
  { id: "sample-loan-statement", fileName: "hdfc-loan-statement.pdf", mimeType: "application/pdf", sizeBytes: 143_800, mockTextKey: "loan-statement" },
  { id: "sample-malformed-receipt", fileName: "faded-receipt.jpg", mimeType: "image/jpeg", sizeBytes: 41_000, mockTextKey: "malformed-receipt" },
  { id: "sample-unknown-document", fileName: "society-notice.jpg", mimeType: "image/jpeg", sizeBytes: 38_500, mockTextKey: "unknown-document" },
  { id: "sample-empty-document", fileName: "blank-scan.jpg", mimeType: "image/jpeg", sizeBytes: 12_000, mockTextKey: "empty-document" },
  { id: "sample-multiple-receipts", fileName: "two-receipts-scan.jpg", mimeType: "image/jpeg", sizeBytes: 91_400, mockTextKey: "multiple-receipts" },
];
