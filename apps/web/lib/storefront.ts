/**
 * The storefront switch: ONE place that decides whether the public site shows
 * prices.
 *
 * OFF (the default, and the owner's choice): every product reads "Contact for
 * pricing", the Product JSON-LD carries no offers, and the action on a product
 * page is "Request a quote" with the chosen unit and quantity filled in.
 *
 * ON: each unit of sale shows its retail price from the POS export, and the
 * Product JSON-LD includes offers (price, USD, availability, unit). The action
 * is still a quote request: there is no cart or checkout. Taking card payments
 * is a separate decision with its own PCI scope; the place to wire a hosted
 * checkout in later is components/catalog/PurchaseAction.tsx.
 */
export const SHOW_PRICES: boolean = false;

/** What every product shows while prices are off. */
export const CONTACT_FOR_PRICING = "Contact for pricing";
