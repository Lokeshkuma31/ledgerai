/**
 * Mock Gmail message fixtures — stand in for a real Gmail API/OAuth fetch.
 * Every required test scenario (Amazon Receipt, Flipkart Invoice, Credit
 * Card Statement, Salary Slip, Utility Bill, Refund, Subscription Renewal,
 * Unknown Email, Malformed Email) has a fixture here; "Duplicate Email" is
 * exercised by fetching the same fixture twice (see
 * lib/email/__tests__/), not a separate fixture. Attachments reference
 * plugins/document-intelligence/mock-documents.ts's own fixture keys
 * directly — this file never invents document text of its own.
 */
import type { RawEmail } from "@/lib/email/types";

export const GMAIL_PROVIDER_ID = "gmail";

export const MOCK_EMAIL_BODIES: Record<string, string> = {
  "amazon-receipt": `Amazon.in — Order Confirmation

Order ID: 402-1234567-8901234
Date: 2026-07-12
Item: Wireless Mouse
Total: 799.00

Thank you for your order! Your receipt has been delivered and is attached for your records.`,

  "flipkart-invoice": `Flipkart

Invoice Number: FA-2026-778812
Bill To: Customer
Total: 2499.00
GST: 18%

Thank you for shopping with Flipkart.`,

  "subscription-renewal": `Netflix

Your subscription renewal is complete.
Amount Charged: 649.00
Next Billing Date: 2026-08-14

Thanks for being a member!`,

  refund: `Amazon.in

This confirms your return processed on 2026-07-16 — your refund is complete.
Order ID: 402-9988776-6543210
Refund Amount: 499.00
Date: 2026-07-16

The money back will reflect in your account within 3-5 business days.`,

  "salary-slip": `Globex Corporation

Your payslip for July 2026 is ready.
Gross Pay: 60000.00
Net Pay: 56200.00
Pay Period: 2026-07-01 to 2026-07-31

Your salary has been credited to your account.`,

  "utility-bill": `BESCOM

Your utility bill is ready. This is your electricity bill for the month.
Amount Due: 1450.00
Due Date: 2026-07-15
Meter Reading: 4521 units

Pay before the due date to avoid late fees.`,

  "credit-card-statement": `ICICI Bank

Your credit card statement is ready.
Statement Date: 2026-07-05
Statement Period: 2026-06-06 to 2026-07-05
Total Due: 9450.00
Minimum Payment Due: 950.00
Due Date: 2026-07-25
Card ending 9081

View the attached PDF for full transaction details.`,

  "bank-statement": `HDFC Bank

Your account statement is ready.
Opening Balance: 50000.00
Closing Balance: 62150.75
Statement Period: 2026-06-01 to 2026-06-30

View the attached PDF for full transaction details.`,

  "flight-booking": `IndiGo

Your flight booking confirmation.
PNR: X7K9QP
Total Fare: 5460.00
Date: 2026-08-02

Boarding closes 45 minutes before departure.`,

  "hotel-booking": `OYO Rooms

Your hotel reservation confirmed for your upcoming stay.
Booking ID: OYO-88213321
Total Amount: 3200.00
Date: 2026-08-10

Check-in: 2026-08-10
Check-out: 2026-08-12`,

  insurance: `LIC of India

Your insurance premium payment receipt.
Policy Number: POL-882134
Premium Amount: 12500.00
Sum Assured: 500000.00
Date: 2026-07-08`,

  loan: `HDFC Bank

Your personal loan EMI statement is ready.
Statement Period: 2026-06-01 to 2026-06-30
EMI Amount: 8500.00
Principal Outstanding: 245000.00
Interest Rate: 11.5%
Due Date: 2026-07-05`,

  "investment-report": `Groww

Your mutual fund portfolio report for the month.
Folio Number: FOL-337612
NAV: 45.32
Statement Period: 2026-06-01 to 2026-06-30

View the full report in your Groww account.`,

  "tax-document": `Globex Corporation Payroll

Your Form 16 tax certificate for FY 2025-26.
Reference Number: F16-2026-04471
TDS: 45000.00
Assessment Year: 2026-27

Download the attached document for your records.`,

  unknown: `Foodblog Weekly Newsletter

Top 10 recipes to try this week! Check out our latest recipe roundup,
curated just for you.`,

  malformed: `QuickMart

Thank you for your purchase! We hope to see you again soon.`,

  empty: "",
};

function email(
  externalId: string,
  subject: string,
  sender: string,
  receivedAt: string,
  bodyKey: keyof typeof MOCK_EMAIL_BODIES,
  attachments: RawEmail["attachments"] = [],
): RawEmail {
  return { externalId, providerId: GMAIL_PROVIDER_ID, subject, sender, receivedAt, body: MOCK_EMAIL_BODIES[bodyKey], attachments };
}

/** The framework's own "no dynamic loading" built-in fixture list — every
 * message fetchEmails("full"/"manual") returns. Attachments that carry a
 * `mockTextKey` reuse Document Intelligence's own mock-documents.ts fixture
 * keys ("credit-card-statement", "salary-slip", "utility-bill",
 * "bank-statement") so no document text is duplicated here. */
export function getAllMockEmails(): RawEmail[] {
  return [
    email("gmail-msg-001", "Your Amazon.in Order Confirmation and Receipt", "auto-confirm@amazon.in", "2026-07-12T09:15:00.000Z", "amazon-receipt"),
    email("gmail-msg-002", "Invoice for Your Flipkart Order — Bill To You", "invoice@flipkart.com", "2026-07-13T11:30:00.000Z", "flipkart-invoice"),
    email("gmail-msg-003", "Your Netflix Subscription Has Been Renewed", "info@netflix.com", "2026-07-14T06:00:00.000Z", "subscription-renewal"),
    email("gmail-msg-004", "Your Refund Has Been Processed", "returns@amazon.in", "2026-07-16T14:20:00.000Z", "refund"),
    email("gmail-msg-005", "Your Payslip for July 2026 — Salary Credited", "hr@globex.com", "2026-07-31T05:00:00.000Z", "salary-slip", [
      { id: "att-payslip-001", fileName: "payslip-july-2026.pdf", mimeType: "application/pdf", sizeBytes: 98_700, kind: "pdf", mockTextKey: "salary-slip" },
    ]),
    email("gmail-msg-006", "Your Utility Bill — Electricity Bill for July", "billing@bescom.org", "2026-07-01T08:00:00.000Z", "utility-bill", [
      { id: "att-utility-001", fileName: "bescom-bill-july.jpg", mimeType: "image/jpeg", sizeBytes: 65_100, kind: "image", mockTextKey: "utility-bill" },
    ]),
    email(
      "gmail-msg-007",
      "Your ICICI Bank Credit Card Statement — Statement Date 2026-07-05",
      "statements@icicibank.com",
      "2026-07-05T07:00:00.000Z",
      "credit-card-statement",
      [{ id: "att-cc-001", fileName: "icici-cc-statement.pdf", mimeType: "application/pdf", sizeBytes: 198_300, kind: "pdf", mockTextKey: "credit-card-statement" }],
    ),
    email("gmail-msg-008", "Your Monthly Account Statement is Ready", "statements@hdfcbank.com", "2026-06-30T07:00:00.000Z", "bank-statement", [
      { id: "att-bank-001", fileName: "hdfc-statement-june.pdf", mimeType: "application/pdf", sizeBytes: 210_500, kind: "pdf", mockTextKey: "bank-statement" },
    ]),
    email("gmail-msg-009", "Your IndiGo Flight Booking Confirmation — PNR X7K9QP", "noreply@goindigo.in", "2026-07-20T10:00:00.000Z", "flight-booking"),
    email("gmail-msg-010", "Your OYO Hotel Reservation Confirmed", "bookings@oyorooms.com", "2026-07-22T12:00:00.000Z", "hotel-booking"),
    email("gmail-msg-011", "Your LIC Insurance Premium Receipt — Policy Number POL-882134", "service@licindia.in", "2026-07-08T09:00:00.000Z", "insurance"),
    email("gmail-msg-012", "Your HDFC Bank Loan EMI Statement", "loans@hdfcbank.com", "2026-06-30T07:00:00.000Z", "loan"),
    email("gmail-msg-013", "Your Monthly Portfolio Report — Mutual Fund Folio Number FOL-337612", "reports@groww.in", "2026-06-30T07:00:00.000Z", "investment-report"),
    email("gmail-msg-014", "Your Form 16 Tax Certificate is Ready", "payroll@globex.com", "2026-07-25T07:00:00.000Z", "tax-document"),
    email("gmail-msg-015", "Foodblog Weekly Newsletter", "newsletter@foodblog.com", "2026-07-10T06:00:00.000Z", "unknown"),
    email("gmail-msg-016", "Receipt from QuickMart", "noreply@quickmart.example", "2026-07-11T10:00:00.000Z", "malformed"),
    email("gmail-msg-017", "(no subject)", "mailer-daemon@mail.example", "2026-07-09T00:00:00.000Z", "empty"),
  ];
}

/** Incremental sync returns only the most recently received messages —
 * the same "tail of the feed" pattern lib/banks/providers.ts uses for its
 * demo connectors' incremental fixtures. */
export function getIncrementalMockEmails(): RawEmail[] {
  return getAllMockEmails().slice(-4);
}
