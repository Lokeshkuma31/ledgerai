/**
 * Mock SMS & notification fixtures — stands in for what a real Android
 * SmsManager / NotificationListenerService would hand this plugin in a
 * future milestone (see README.md's "Future Proofing" section). Every
 * message here is realistic, hand-authored text; nothing is fetched or
 * generated at runtime.
 *
 * Deliberately includes: every supported source type, every transaction
 * type, a handful of malformed/unsupported-format messages (so the Import
 * Preview always has something to show for those states), and a few
 * intentional duplicates/near-duplicates (so duplicate detection has
 * something real to catch).
 */
import type { RawSmsMessage } from "@/plugins/android-sms/types";

export const MOCK_SMS_MESSAGES: RawSmsMessage[] = [
  // --- UPI payments (debit) ------------------------------------------------
  {
    id: "msg-001",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹450.00 paid to Swiggy using UPI.",
    receivedAt: "2026-07-25T13:12:00Z",
  },
  {
    id: "msg-002",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹250.00 paid to Zomato via UPI on 12-05-2026.",
    receivedAt: "2026-05-12T19:40:00Z",
  },
  {
    id: "msg-003",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹99.00 paid to Netflix using UPI. UPI Ref No 987654321012.",
    receivedAt: "2026-07-05T09:00:00Z",
  },
  {
    id: "msg-004",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹1,200.00 paid to BigBasket using UPI on 20-07-2026. UPI Ref No 456123789045.",
    receivedAt: "2026-07-20T08:15:00Z",
  },
  {
    id: "msg-005",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹599.00 paid to BookMyShow using UPI.",
    receivedAt: "2026-06-18T20:05:00Z",
  },
  {
    id: "msg-006",
    sender: "Paytm",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹180.00 paid to Chai Point via UPI on 25-07-2026.",
    receivedAt: "2026-07-25T17:20:00Z",
  },
  {
    id: "msg-007",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹75.00 sent to Uber using UPI.",
    receivedAt: "2026-07-24T22:10:00Z",
  },
  {
    id: "msg-008",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹340.00 paid to Dominos using UPI. UPI Ref No 741852963001.",
    receivedAt: "2026-06-30T21:00:00Z",
  },

  // --- UPI received (credit) ----------------------------------------------
  {
    id: "msg-009",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "You have received ₹1,200.00 via UPI from Rahul Sharma. UPI Ref No 456789123456.",
    receivedAt: "2026-07-22T11:05:00Z",
  },
  {
    id: "msg-010",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "You have received ₹500.00 via UPI from Priya Nair.",
    receivedAt: "2026-07-10T16:30:00Z",
  },
  {
    id: "msg-011",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "You have received ₹2,000.00 via UPI from Amit Verma. UPI Ref No 998877665544.",
    receivedAt: "2026-05-28T14:00:00Z",
  },
  {
    id: "msg-012",
    sender: "Paytm",
    channel: "notification",
    sourceType: "upi-notification",
    body: "You have received ₹150.00 via UPI from Sneha Iyer on 15-06-2026.",
    receivedAt: "2026-06-15T10:20:00Z",
  },

  // --- Bank SMS: debit to a UPI VPA ----------------------------------------
  {
    id: "msg-013",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.5,000.00 debited from A/c XX1234 on 03-07-2026 to VPA amazon@ybl. Avl Bal Rs.45,230.10",
    receivedAt: "2026-07-03T12:00:00Z",
  },
  {
    id: "msg-014",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.899.00 debited from A/c XX7788 on 18-07-2026 to VPA flipkart@icici. Avl Bal Rs.12,340.55",
    receivedAt: "2026-07-18T10:45:00Z",
  },
  {
    id: "msg-015",
    sender: "AXISBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.220.00 debited from A/c XX3456 on 10-05-2026 to VPA myntra@axb. Avl Bal Rs.8,760.00",
    receivedAt: "2026-05-10T09:30:00Z",
  },
  {
    id: "msg-016",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.1,050.00 debited from A/c XX9081 on 22-07-2026 to VPA irctc@sbi. Avl Bal Rs.30,500.20",
    receivedAt: "2026-07-22T07:50:00Z",
  },

  // --- Salary credited ------------------------------------------------------
  {
    id: "msg-017",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Salary of $4,500 credited.",
    receivedAt: "2026-07-01T06:00:00Z",
  },
  {
    id: "msg-018",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "INR 55,000.00 credited to A/c XX5678 towards SALARY on 01-07-2026. Avl Bal INR 78,340.00",
    receivedAt: "2026-07-01T06:05:00Z",
  },
  {
    id: "msg-019",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your account has been credited with Rs.62,000.00 - Salary for July. Avl Bal Rs.95,400.00",
    receivedAt: "2026-06-01T06:00:00Z",
  },

  // --- Bill payments ---------------------------------------------------------
  {
    id: "msg-020",
    sender: "AXISBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your electricity bill payment of Rs.1,850.00 to BESCOM was successful.",
    receivedAt: "2026-07-15T18:00:00Z",
  },
  {
    id: "msg-021",
    sender: "Paytm",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "Your mobile bill payment of Rs.499.00 to Reliance Jio was successful using UPI.",
    receivedAt: "2026-07-19T09:10:00Z",
  },
  {
    id: "msg-022",
    sender: "KOTAKB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your broadband bill payment of Rs.1,200.00 to Airtel was successful.",
    receivedAt: "2026-06-05T08:30:00Z",
  },
  {
    id: "msg-023",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your water bill payment of Rs.350.00 to BWSSB was successful.",
    receivedAt: "2026-07-08T08:00:00Z",
  },

  // --- Card transactions -------------------------------------------------
  {
    id: "msg-024",
    sender: "VISA",
    channel: "sms",
    sourceType: "credit-card-sms",
    body: "Your card ending 4321 was used for $85.50 at Amazon.",
    receivedAt: "2026-07-23T15:22:00Z",
  },
  {
    id: "msg-025",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "credit-card-sms",
    body: "Your HDFC Credit Card XX9012 was used for Rs.1,499.00 at Myntra on 15-07-2026.",
    receivedAt: "2026-07-15T14:10:00Z",
  },
  {
    id: "msg-026",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Your ICICI Debit Card XX3345 was used for Rs.799.00 at Croma on 05-07-2026.",
    receivedAt: "2026-07-05T11:40:00Z",
  },
  {
    id: "msg-027",
    sender: "Mastercard",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Your card ending 5567 was used for Rs.2,499.00 at Decathlon on 12-06-2026.",
    receivedAt: "2026-06-12T17:05:00Z",
  },
  {
    id: "msg-028",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Your SBI Debit Card XX1122 was used for Rs.350.00 at Starbucks.",
    receivedAt: "2026-07-21T09:45:00Z",
  },
  {
    id: "msg-029",
    sender: "AXISBK",
    channel: "sms",
    sourceType: "credit-card-sms",
    body: "Your Axis Credit Card XX8899 was used for Rs.4,200.00 at MakeMyTrip on 01-07-2026.",
    receivedAt: "2026-07-01T13:00:00Z",
  },

  // --- ATM withdrawals ---------------------------------------------------
  {
    id: "msg-030",
    sender: "VISA",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "$100 withdrawn from ATM.",
    receivedAt: "2026-07-26T10:00:00Z",
  },
  {
    id: "msg-031",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Rs.2,000.00 withdrawn from ATM using Debit Card XX4321 on 10-07-2026. Avl Bal Rs.8,000.00",
    receivedAt: "2026-07-10T19:15:00Z",
  },
  {
    id: "msg-032",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Rs.5,000.00 withdrawn from ATM on 22-06-2026. Avl Bal Rs.15,200.00",
    receivedAt: "2026-06-22T12:30:00Z",
  },
  {
    id: "msg-033",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "debit-card-sms",
    body: "Rs.1,500.00 withdrawn from ATM using Card XX7766 on 03-07-2026.",
    receivedAt: "2026-07-03T20:40:00Z",
  },

  // --- Transfers -----------------------------------------------------------
  {
    id: "msg-034",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "$800 transferred to John.",
    receivedAt: "2026-07-19T13:00:00Z",
  },
  {
    id: "msg-035",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.10,000.00 transferred to Priya Singh via IMPS on 20-07-2026. Ref No 778899001122.",
    receivedAt: "2026-07-20T15:30:00Z",
  },
  {
    id: "msg-036",
    sender: "AXISBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.3,500.00 transferred to Ramesh Kumar on 14-06-2026.",
    receivedAt: "2026-06-14T18:20:00Z",
  },
  {
    id: "msg-037",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.25,000.00 transferred to Landlord via NEFT on 01-07-2026.",
    receivedAt: "2026-07-01T09:00:00Z",
  },

  // --- Refunds ---------------------------------------------------------------
  {
    id: "msg-038",
    sender: "AmazonPay",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "Refund of Rs.499.00 for your Amazon order has been credited to your account.",
    receivedAt: "2026-07-17T10:00:00Z",
  },
  {
    id: "msg-039",
    sender: "Paytm",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "₹250.00 refunded for your Swiggy order. Order ID SWGY998877.",
    receivedAt: "2026-07-12T20:00:00Z",
  },
  {
    id: "msg-040",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Refund of Rs.1,200.00 for your Flipkart order has been processed.",
    receivedAt: "2026-06-25T11:30:00Z",
  },
  {
    id: "msg-041",
    sender: "Zepto",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "₹90.00 refund issued for your Zepto order.",
    receivedAt: "2026-07-14T16:45:00Z",
  },

  // --- Failed / declined transactions ------------------------------------
  {
    id: "msg-042",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "Your transaction of Rs.500.00 to Swiggy has failed. Amount will be reversed within 3-5 business days.",
    receivedAt: "2026-07-16T13:20:00Z",
  },
  {
    id: "msg-043",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your payment of Rs.1,200.00 to Amazon has been declined due to insufficient balance.",
    receivedAt: "2026-07-09T21:10:00Z",
  },
  {
    id: "msg-044",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "Your UPI payment of Rs.250.00 to Ola has failed. Please try again.",
    receivedAt: "2026-06-28T08:55:00Z",
  },
  {
    id: "msg-045",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your transaction of Rs.3,000.00 to Flipkart was unsuccessful.",
    receivedAt: "2026-07-11T10:15:00Z",
  },

  // --- Wallets ---------------------------------------------------------------
  {
    id: "msg-046",
    sender: "Paytm",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "You paid ₹120.00 to Chai Point using Paytm Wallet. Order ID PYTM123456.",
    receivedAt: "2026-07-24T08:10:00Z",
  },
  {
    id: "msg-047",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "You paid ₹60.00 to Metro Card Recharge using PhonePe Wallet.",
    receivedAt: "2026-07-13T07:30:00Z",
  },
  {
    id: "msg-048",
    sender: "AmazonPay",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "You paid ₹899.00 to Big Bazaar using Amazon Pay Wallet. Order ID AMZP741852.",
    receivedAt: "2026-05-20T19:00:00Z",
  },
  {
    id: "msg-049",
    sender: "Mobikwik",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "You paid ₹40.00 to Parking Fee using Mobikwik Wallet.",
    receivedAt: "2026-07-26T18:45:00Z",
  },

  // --- Subscriptions (still UPI-paid debits, just a recognizable flavor) ---
  {
    id: "msg-050",
    sender: "GPay",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹499.00 paid to Netflix using UPI. UPI Ref No 852963741025.",
    receivedAt: "2026-07-05T00:05:00Z",
  },
  {
    id: "msg-051",
    sender: "PhonePe",
    channel: "notification",
    sourceType: "upi-notification",
    body: "₹119.00 paid to Spotify using UPI on 20-06-2026.",
    receivedAt: "2026-06-20T00:10:00Z",
  },

  // --- Generic bank credit/debit — no identifiable merchant ("Unknown
  // Merchant" scenario) ----------------------------------------------------
  {
    id: "msg-052",
    sender: "KOTAKB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.15,000.00 credited to your account from Freelance Client Ltd.",
    receivedAt: "2026-07-06T10:00:00Z",
  },
  {
    id: "msg-053",
    sender: "AXISBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.3,200.00 credited to your account. Avl Bal Rs.20,100.00",
    receivedAt: "2026-06-08T09:30:00Z",
  },
  {
    id: "msg-054",
    sender: "HDFCBK",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.1,250.00 debited from A/c XX2211 on 08-07-2026. Avl Bal Rs.9,800.00",
    receivedAt: "2026-07-08T14:00:00Z",
  },
  {
    id: "msg-055",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.4,500.00 debited from A/c XX6677 on 19-06-2026 towards NEFT charges. Avl Bal Rs.22,000.00",
    receivedAt: "2026-06-19T16:20:00Z",
  },
  {
    id: "msg-056",
    sender: "ICICIB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.99.00 debited from A/c XX4433 on 25-07-2026 towards annual maintenance charges. Avl Bal Rs.5,600.00",
    receivedAt: "2026-07-25T09:05:00Z",
  },

  // --- Malformed — not a transaction message at all -----------------------
  {
    id: "msg-057",
    sender: "VM-OTPSMS",
    channel: "sms",
    sourceType: "bank-sms",
    body: "123456 is your OTP for login. Do not share this with anyone.",
    receivedAt: "2026-07-27T08:00:00Z",
  },
  {
    id: "msg-058",
    sender: "AD-SWIGGY",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Get 50% off on your next Swiggy order! Use code SAVE50 today.",
    receivedAt: "2026-07-20T12:00:00Z",
  },
  {
    id: "msg-059",
    sender: "AD-CLINIC",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your appointment with Dr. Mehta is confirmed for tomorrow at 5 PM.",
    receivedAt: "2026-07-26T20:00:00Z",
  },
  {
    id: "msg-060",
    sender: "AD-JIO",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Recharge your Jio number before it expires to continue services.",
    receivedAt: "2026-07-22T06:00:00Z",
  },

  // --- Unsupported format — clearly financial, no matching template -------
  {
    id: "msg-061",
    sender: "CoinDCX",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "You bought 0.001 BTC for $45.00 on CoinDCX.",
    receivedAt: "2026-07-15T22:00:00Z",
  },
  {
    id: "msg-062",
    sender: "KOTAKB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Your investment of ₹10,000.00 in Mutual Fund XYZ has been processed.",
    receivedAt: "2026-07-02T10:30:00Z",
  },
  {
    id: "msg-063",
    sender: "AuctionApp",
    channel: "notification",
    sourceType: "wallet-notification",
    body: "Bid placed: $250.00 on Vintage Watch - Auction ends in 2 hours.",
    receivedAt: "2026-07-21T14:00:00Z",
  },

  // --- Intentional duplicates / near-duplicates ---------------------------
  // The same UPI payment relayed through both the SMS and notification
  // channel (shares a UPI reference number, so the ref-based signature
  // catches it regardless of channel or wording).
  {
    id: "msg-064",
    sender: "BigBasket-Bank",
    channel: "sms",
    sourceType: "bank-sms",
    body: "Rs.1,200.00 debited from A/c XX7788 on 20-07-2026 to VPA bigbasket@ybl. UPI Ref No 456123789045.",
    receivedAt: "2026-07-20T08:16:00Z",
  },
  // A resend of the salary credit (msg-018) four minutes later, with no
  // reference number at all — exercises the fallback (non-reference)
  // duplicate signature plus its time-tolerance window.
  {
    id: "msg-065",
    sender: "SBIINB",
    channel: "sms",
    sourceType: "bank-sms",
    body: "INR 55,000.00 credited to A/c XX5678 towards SALARY on 01-07-2026. Avl Bal INR 78,340.00",
    receivedAt: "2026-07-01T06:09:00Z",
  },
  // A resend of the Myntra card transaction (msg-025) via the bank's push
  // notification channel a minute later, again with no reference number.
  {
    id: "msg-066",
    sender: "HDFC Bank",
    channel: "notification",
    sourceType: "credit-card-sms",
    body: "Your HDFC Credit Card XX9012 was used for Rs.1,499.00 at Myntra on 15-07-2026.",
    receivedAt: "2026-07-15T14:11:00Z",
  },
];
