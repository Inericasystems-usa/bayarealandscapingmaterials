R&S Tire Sales - POS (Inerica POS)
===================================

A self-contained, offline point-of-sale for R&S Tire Sales. Runs entirely on
this PC - no internet connection or monthly subscription required. Pre-loaded
with the R&S tire catalog (retail + wholesale pricing).

HOW TO START
------------
  Double-click  "Start R&S Tire POS.bat"
  The POS opens in its own window after a few seconds.

SIGN IN
-------
  There is no built-in sign-in. The first start creates the owner's admin
  account, and for that one start it needs ADMIN_EMAIL and ADMIN_PASSWORD
  (12+ characters, with letters and numbers). Click this folder's address
  bar, type  cmd  and press Enter, then run these three lines with your own
  e-mail and password in place of the <...> parts:

    set "ADMIN_EMAIL=<your e-mail>"
    set "ADMIN_PASSWORD=<your password>"
    "Start R&S Tire POS.bat"

  Use a password without the characters  %  or  "  (the cmd window would
  change them).

  Sign in with that e-mail and password, then add your staff in
  Settings > Employees. Afterwards, close the POS (that cmd window shows your
  password) and start it again with a plain double-click: the two values
  are not saved anywhere, and later starts never need them.

  If the first start ran without them (or with a shorter password), nobody
  can sign in yet: close the POS and start it again as above.

WHOLESALE vs RETAIL
-------------------
  - Walk-in / retail sales ring up at the retail price automatically.
  - For a DEALER/WHOLESALE sale: pick the customer first (set their type to
    "Wholesale" or "Contractor") - then every tire you add is billed at its
    WHOLESALE price, and a "Wholesale pricing" badge shows on the order.
  - Wholesale/dealer accounts can also be billed "On account" (accounts
    receivable) and paid off later from the Customers screen.

WHAT'S INCLUDED
---------------
  - 228 tires (commercial, passenger, SUV/light-truck, used) with retail +
    wholesale pricing, sold each.
  - Register/checkout (cash, card, on-account), inventory, customers & A/R,
    orders, purchasing, vendors, reports, time clock.
  - Everything offline; your data stays on this PC.

YOUR DATA
---------
  Saved under:  %LOCALAPPDATA%\InericaPOS-RS\data
  Kept even if you replace this folder with an updated version. Back it up.

TO STOP
-------
  Close the "R&S Tire POS" window.

NOTES
-----
  - Card payments work once the card reader is set up; until then card sales
    are off. Text features activate once provider keys are added.
  - AI features are not included in this edition.
  - Support: Inerica Systems.
