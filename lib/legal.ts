// Legal wording and numbers in ONE place. Change them here and every page updates.
// IMPORTANT: this text is a sound starting point, not legal advice. HT Auctions' attorney
// should review it before the first public auction, and set the contact details below.

export const LEGAL = {
  company: 'HT Auctions West Coast',
  // Bump this whenever the terms change, so we know which version each bidder agreed to.
  termsVersion: '2026-11-26',
  privacyVersion: '2026-11-26',
  updated: '26 November 2026',

  buyerCommissionPct: 10,   // buyer's commission added to the hammer price
  vatNote: 'plus VAT where it applies',
  paymentDays: 2,           // business days to pay after the auction

  // Fill these in (they are shown on the pages only when not empty).
  contactEmail: '',
  contactPhone: '',
  informationOfficer: '', // name of the person registered with the Information Regulator
};

export type LegalSection = { heading: string; body: string[] };

export const TERMS: LegalSection[] = [
  {
    heading: '1. About these terms',
    body: [
      `These are the Conditions of Sale and Bidder Terms of ${LEGAL.company} ("we", "us"). They apply to every person who registers to bid, watches, or bids in our live auctions, in the room or online. By registering you agree to them.`,
      'Nothing in these terms takes away any right you have under South African law that cannot lawfully be excluded, including the Consumer Protection Act.',
    ],
  },
  {
    heading: '2. Registering and approval',
    body: [
      'You must be 18 or older and legally able to enter into a binding contract.',
      'The details you give us (name, surname, cell number and email) must be true and complete. You may have one account only.',
      'Your account can bid once you have confirmed your email address. We may refuse, block or close an account at our discretion, for example if details are false or you have not paid for goods before.',
      'Keep your password private. Everything done through your account is treated as done by you.',
    ],
  },
  {
    heading: '3. Every bid is binding',
    body: [
      'A bid is an offer to buy. By placing a bid you promise to buy the lot at that price if it is the highest bid accepted by the auctioneer.',
      'Online bids are treated in the same way as bids made in the room. A bid cannot be withdrawn once it is placed, except where the auctioneer agrees or the law requires otherwise.',
      'You are responsible for every bid placed through your account, including bids placed by mistake.',
    ],
  },
  {
    heading: '4. When a sale is made',
    body: [
      'Subject to any reserve price, a sale is made when the auctioneer accepts the highest bid and announces that the lot is sold. The highest bidder at that moment is the buyer.',
      'The auctioneer decides which bid is highest, may refuse any bid, may withdraw a lot, and may re-offer a lot if there is a dispute. The auctioneer’s record of the bids is final, subject to the law.',
    ],
  },
  {
    heading: '5. What you pay',
    body: [
      `You pay the price you bid (the hammer price), plus buyer's commission of ${LEGAL.buyerCommissionPct}% of the hammer price, ${LEGAL.vatNote}, plus any other charges shown in the lot description.`,
      'These amounts are added to the price on your invoice. Please include them when you decide how high to bid.',
    ],
  },
  {
    heading: '6. Payment and collection',
    body: [
      `Payment in full is due within ${LEGAL.paymentDays} business days after the auction, by the method shown on your invoice.`,
      'Goods are released only after payment has cleared. You collect at your own cost and risk unless we agree otherwise in writing.',
    ],
  },
  {
    heading: '7. If you do not pay',
    body: [
      'If you win a lot and do not pay on time, we may cancel the sale and offer the lot again. You remain responsible for any shortfall in the price, our reasonable costs, and any deposit you paid may be kept to the extent the law allows.',
      'We may also suspend or ban you from future auctions.',
    ],
  },
  {
    heading: '8. Reserve prices and corrections',
    body: [
      'A lot may have a reserve price that is not disclosed. If bidding does not reach it, the lot may be passed in.',
      'We may correct obvious errors in a description, price or result.',
    ],
  },
  {
    heading: '9. The goods',
    body: [
      'Photographs and descriptions are given in good faith. Please inspect goods before the auction where you can. Goods are sold in the condition they are in, subject to your rights under the Consumer Protection Act.',
    ],
  },
  {
    heading: '10. Live video and technology',
    body: [
      'The live video and sound can be a second or two behind the room. A bid counts when our system receives it, not when you see it on screen.',
      'We are not responsible for loss of connection, delays, or interruptions outside our control. If something goes wrong with the stream or the website, the auctioneer may pause the auction, repeat a lot, or continue in the room.',
    ],
  },
  {
    heading: '11. Your personal information',
    body: [
      'We handle your personal information as set out in our Privacy notice.',
    ],
  },
  {
    heading: '12. General',
    body: [
      'These terms are governed by the laws of South Africa. If any part of them cannot be enforced, the rest stays in force.',
      'We may update these terms. The version you accepted when you registered is recorded.',
    ],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    heading: 'Who is responsible',
    body: [
      `${LEGAL.company} is the responsible party for the personal information you give us on this website, under the Protection of Personal Information Act (POPIA).`,
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'Your first name, surname, cell number, email address and password (stored securely, never in plain text).',
      'Your bids and the lots you win, the time of each bid, and a record of when you accepted our terms.',
      'Basic technical information needed to run the site, such as your browser and connection.',
      'We do not ask for your bank account or card details on this website.',
    ],
  },
  {
    heading: 'Why we collect it',
    body: [
      'To register you, confirm your email address, and let you bid.',
      'To run the auction, contact you if you win, invoice you and handle payment.',
      'To prevent fraud and enforce our terms, and to keep the records the law requires.',
    ],
  },
  {
    heading: 'Who sees it',
    body: [
      'Our authorised staff see your registration details. Other bidders see only a display name (your screen name, or your first name and the initial of your surname) next to your bids.',
      'We use trusted service providers to run the website, store data, deliver live video, and send notifications. They may only use your information to provide those services to us.',
      'Some of these providers process information outside South Africa. We use providers that protect personal information to a standard comparable to POPIA.',
      'We do not sell your information.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'We keep your account details while your account is active. We keep records of bids and sales for as long as the law and our accounting needs require, and then delete or anonymise them.',
    ],
  },
  {
    heading: 'How we protect it',
    body: [
      'We take reasonable technical and organisational steps to keep your information safe, including encrypted connections, restricted access to personal details, and limiting what we collect. No system is completely risk-free, and we will tell you and the Information Regulator if a breach affects you, as the law requires.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You may ask to see the information we hold about you, to correct it, or to have it deleted where we no longer need it. You may also object to how we use it.',
      'If you are unhappy with how we handle your information you may complain to the Information Regulator at inforegulator.org.za.',
    ],
  },
];
