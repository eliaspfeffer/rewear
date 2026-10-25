# Verification

## Automated

All 25 Node tests pass. They cover recommendation ranking, price/budget boundaries, retailer URL restrictions and variants, garment grouping and preservation during merge/split, incomplete photo exports, and camera capture/cancellation/track cleanup. JavaScript syntax checks and the Worker build pass.

## Browser and native checks

Checked in an existing Google Chrome profile: discovery, comparison, wishlist, upload validation, local image palette extraction, swipe buttons/keys/touch, undo, filters, import failure states and a live supported retailer import. Native dialogs were checked with keyboard, Escape and outside click. Effective CSS widths 390px and 320px were checked for scrolling, clipping and page overflow.

The actual Mac camera produced a live 1280×960 preview and enabled the shutter. Capture-to-JPEG conversion and cancellation are covered by controlled media/canvas tests; a full real-selfie shutter flow was not independently exercised end to end. No physical phone-camera test or Safari/Firefox test is claimed.

The Swift pipeline compiled and processed real images locally. Local review, grouping, merge/split and private API origin/path restrictions were exercised with separate fixtures. No personal photographs, embeddings, fixture runtime libraries or personal analysis records are included in this repository.

No purchases, checkout, scientific color-typing accuracy, perfect garment identity, or continuous live Apple Photos synchronization were tested or claimed. Retailer requests can be blocked and reference prices can become stale.
