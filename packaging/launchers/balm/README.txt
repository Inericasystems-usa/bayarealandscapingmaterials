Inerica POS - Bay Area Landscaping Materials
=============================================

This is a self-contained, offline point-of-sale system. It runs entirely on
this PC - no internet connection or monthly subscription is required.

HOW TO START
------------
  Double-click  "Start Inerica POS.bat"

  The first launch takes a few seconds while the services start. The POS then
  opens in its own window.

SIGN IN
-------
  There is no built-in sign-in. The first start creates the owner's admin
  account, and for that one start it needs ADMIN_EMAIL and ADMIN_PASSWORD
  (12+ characters, with letters and numbers). Click this folder's address
  bar, type  cmd  and press Enter, then run these three lines with your own
  e-mail and password in place of the <...> parts:

    set "ADMIN_EMAIL=<your e-mail>"
    set "ADMIN_PASSWORD=<your password>"
    "Start Inerica POS.bat"

  Use a password without the characters  %  or  "  (the cmd window would
  change them).

  Sign in with that e-mail and password, then add your staff from
  Settings > Employees. Afterwards, close the POS (that cmd window shows your
  password) and start it again with a plain double-click: the two values
  are not saved anywhere, and later starts never need them.

  If the first start ran without them (or with a shorter password), nobody
  can sign in yet: close the POS and start it again as above.

WHAT'S INCLUDED
---------------
  - Register / checkout (cash, card terminal, on-account)
  - Inventory, customers & accounts receivable
  - Orders, purchasing, vendors
  - Dispatch & deliveries, reports, time clock
  - Everything runs offline; your data is stored on this PC.

YOUR DATA
---------
  Saved under:  %LOCALAPPDATA%\InericaPOS\data
  Because it lives outside this folder, it is kept even if you replace this
  folder with an updated version. Back that folder up regularly.

TO STOP
-------
  Close the "Inerica POS" window (the one that says "Inerica POS is running").

NOTES
-----
  - Card payments work once the card reader is set up; until then card sales
    are off. Text-message features activate once you add your provider keys.
  - AI features are not included in this edition.
  - Support: Inerica Systems.
