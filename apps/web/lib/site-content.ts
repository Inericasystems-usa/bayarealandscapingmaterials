/**
 * Shared media + content pulled from the current live site
 * (bayarealandscapingmaterials.com). All assets are on the CloudFront CDN.
 */
export const CDN =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663521319543/GbZEVBzVkRmts6C6tGgLns";

export const HERO_IMAGES = {
  main: `${CDN}/hero-yard-clean-v2-7cRf8UsDfzAsgJECsiLFXu.webp`,
  about: `${CDN}/hero-yard-clean-v3-WC4QMGdoV7AzDozu6fDBq4.webp`,
  delivery: `${CDN}/hero-branded-delivery-GbJADgDyq2tB33dHUMacEL.webp`,
  calculator: `${CDN}/hero-branded-truck-ZHLUFV58QpBf76yecmKRUi.webp`,
  contact: `${CDN}/hero-yard-aerial-b3A5VzmcpecRdb7VEDAwnG.webp`,
  videoPoster: `${CDN}/keyframe-gravel-f9dPkNYaRswQNZgwbHXkKj.webp`,
  video: `${CDN}/hero-loop-seamless_7102ba48.mp4`,
} as const;

export const STATS = [
  { label: "Mile Delivery Radius", value: "70" },
  { label: "Products Available", value: "150+" },
  { label: "Satisfied Customers", value: "10,000+" },
  { label: "Delivery Fleet", value: "25+ Vehicles" },
] as const;

export const SERVICES = [
  { title: "Bulk Delivery", description: "Fast, reliable delivery of bulk materials throughout the Bay Area" },
  { title: "Custom Soil Blends", description: "Specialized soil mixes tailored to your project needs" },
  { title: "Material Calculator", description: "Precise quantity estimates for your landscaping projects" },
  { title: "Expert Consultation", description: "Professional guidance from experienced landscaping specialists" },
  { title: "Competitive Pricing", description: "Best prices on premium building materials in the Bay Area" },
  { title: "Same-Day Quotes", description: "Quick turnaround on material quotes and project estimates" },
] as const;

export const YARD_SIZE_GUIDE_IMAGES = [
  { url: `${CDN}/yard-1yd-EFBm5gHfJUDRjqC52NEySG.webp`, label: "1 Yard" },
  { url: `${CDN}/yard-2yd-Ke46u7iPY2e75gtFWiwr9F.webp`, label: "2 Yards" },
  { url: `${CDN}/yard-3yd-X6foiZMK3T8By9hFjYbehh.webp`, label: "3 Yards" },
  { url: `${CDN}/yard-5yd-fmzj2vpm4nX8StAxtsT6EB.webp`, label: "5 Yards" },
  { url: `${CDN}/yard-8yd-jV5uPi9Sv9hWa3ia53Nwqu.webp`, label: "8 Yards" },
  { url: `${CDN}/yard-10yd-ac2dHeQv3vHSq4AWXDDqDx.webp`, label: "10 Yards" },
] as const;

export const GALLERY_PROJECTS = [
  { label: "Driveway Renewal", before: `${CDN}/gallery-driveway-before-8MrPTaRebYR4pRAsgUxALG.webp`, after: `${CDN}/gallery-driveway-after-XMh7L7C2NeUeTDc7nWXqfJ.webp` },
  { label: "Backyard Patio", before: `${CDN}/gallery-patio-before-AW2r5P3PN3CdkwwfyxKccn.webp`, after: `${CDN}/gallery-patio-after-de4czK5Mq3yAUV2bNuCG3m.webp` },
  { label: "Garden Beds", before: `${CDN}/gallery-garden-before-CQHuSZLJgv4Y6KtSteBBsz.webp`, after: `${CDN}/gallery-garden-after-oTVB2ozwG2ysmBBD9JUFUg.webp` },
  { label: "Retaining Wall", before: `${CDN}/gallery-retwall-before-HewkfVW8QMCxanvF3QJ9Kd.webp`, after: `${CDN}/gallery-retwall-after-6CNmUSFPx6j7u7dhWWDwUe.webp` },
  { label: "Stone Pathway", before: `${CDN}/gallery-pathway-before-9rug6hRMfbzbfEAWPHHT5E.webp`, after: `${CDN}/gallery-pathway-after-YrW5XMS7pZ54rNggvSLJfv.webp` },
  { label: "Fire Pit Lounge", before: `${CDN}/gallery-firepit-before-Em87iQSSfrTLqN2tAGqfPn.webp`, after: `${CDN}/gallery-firepit-after-eNmyDUY7Si5bJFbwPGwPPN.webp` },
  { label: "Front Yard Refresh", before: `${CDN}/gallery-frontyard-before-NfgXyp5cKRuHCF9zJBuiU9.webp`, after: `${CDN}/gallery-frontyard-after-iQhkKk22pUJtK9rhk7M6y8.webp` },
  { label: "Drainage Fix", before: `${CDN}/gallery-drainage-before-MiF9a2LX5t8dS9iPVzahXL.webp`, after: `${CDN}/gallery-drainage-after-DojqTQywvJH6m6k44LGtVE.webp` },
  { label: "Pool Surround", before: `${CDN}/gallery-poolarea-before-ZifBo8AXXw26J6MgEu3Mx9.webp`, after: `${CDN}/gallery-poolarea-after-Vrf7kHhd6w88nPTW7SxgJn.webp` },
  { label: "Playground Base", before: `${CDN}/gallery-playground-before-cFttpc6jPWbzRCaN5Ynp7a.webp`, after: `${CDN}/gallery-playground-after-fuLWx8tucneJ9TEYda8wgp.webp` },
  { label: "Raised Beds", before: `${CDN}/gallery-raisedbeds-before-Zc2n4R29mduqRVjVuwthwr.webp`, after: `${CDN}/gallery-raisedbeds-after-hgEKWnJUSy4ZzE27KkAJ2S.webp` },
  { label: "Zen Garden", before: `${CDN}/gallery-zengarden-before-TUHKLCNvqvkYLhNShAJbHp.webp`, after: `${CDN}/gallery-zengarden-after-CK7Da8btZfHzyR6Gyt6BUB.webp` },
] as const;
