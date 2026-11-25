// Feature switches.
//
// TIMED_AUCTIONS_ENABLED
//   false = the app is a live-video-auction-only product (current go-live scope).
//           Bidders see only the "next live auction" screen; Search, Watchlist
//           and My Bids tabs are hidden; admins can only schedule live auctions.
//   true  = switches all the timed-auction screens back on. All the timed code
//           is still in the app, so this is the only change needed when the
//           timed-auction module is sold to the client as an add-on.
export const TIMED_AUCTIONS_ENABLED = false;
