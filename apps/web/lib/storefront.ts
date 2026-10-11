/**
 * The storefront switch: ONE place that decides whether the public site shows
 * prices.
 *
 * ON (the owner's decision, 11 Oct 2026): each unit of sale shows its retail
 * price from the POS export, the product calculator estimates a material
 * cost, and the Product JSON-LD includes offers (price, USD, availability,
 * unit).
 *
 * OFF: every product reads "Contact for pricing", the JSON-LD carries no
 * offers, and the calculator reports quantities only.
 *
 * Either way the action
 * is still a quote request: there is no cart or checkout. Taking card payments
 * is a separate decision with its own PCI scope; the place to wire a hosted
 * checkout in later is components/catalog/PurchaseAction.tsx.
 */
export const SHOW_PRICES: boolean = true;

/** What a product shows while prices are off, or when it has no price in the POS. */
export const CONTACT_FOR_PRICING = "Contact for pricing";
