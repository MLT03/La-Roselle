/* ---------- La Roselle — Default product catalog ----------
 *
 * Used as a fallback when the Supabase `products` table is empty
 * (e.g. on first boot). Once products exist in Supabase, that data
 * wins. Use the admin → "Reset to defaults" button to (re-)seed.
 *
 * FIELD REFERENCE:
 *   id          unique string
 *   image       cover image URL (legacy — also kept on row for fallback)
 *   images      array of image URLs (up to 8). First is the cover.
 *   price       NUMBER, e.g. 250  (currency comes from shop settings)
 *   stock       integer — inventory count
 *   category.{en,fr,ar}
 *   name.{en,fr,ar}
 *   description.{en,fr,ar}
 */

const DEFAULT_PRODUCTS = [
  {
    id: "rose-serum",
    image: "",
    images: [],
    price: 750,
    stock: 10,
    category: { en: "Skincare", fr: "Soin du visage", ar: "العناية بالبشرة" },
    name:     { en: "Rose Radiance Serum", fr: "Sérum Éclat de Rose", ar: "سيروم إشراقة الورد" },
    description: {
      en: "A luminous serum enriched with rose extract and vitamin C for a glowing, even complexion.",
      fr: "Un sérum lumineux enrichi à l'extrait de rose et vitamine C pour un teint éclatant et unifié.",
      ar: "سيروم مضيء غني بخلاصة الورد وفيتامين C لبشرة متوهجة ومتجانسة."
    }
  },
  {
    id: "lavender-body-oil",
    image: "",
    images: [],
    price: 600,
    stock: 10,
    category: { en: "Wellness", fr: "Bien-être", ar: "الرفاهية" },
    name:     { en: "Lavender Body Oil", fr: "Huile Corporelle Lavande", ar: "زيت الجسم بالخزامى" },
    description: {
      en: "A silky body oil with calming lavender — perfect for evening self-care rituals.",
      fr: "Une huile corporelle soyeuse à la lavande apaisante — parfaite pour vos rituels du soir.",
      ar: "زيت جسم حريري بالخزامى المهدئة، مثالي لطقوس العناية المسائية."
    }
  },
  {
    id: "intimate-wash",
    image: "",
    images: [],
    price: 350,
    stock: 10,
    category: { en: "Intimate care", fr: "Soin intime", ar: "العناية الحميمة" },
    name:     { en: "Gentle Intimate Wash", fr: "Soin Lavant Intime Doux", ar: "غسول حميمي لطيف" },
    description: {
      en: "A pH-balanced, fragrance-free wash formulated for daily gentle hygiene.",
      fr: "Un soin lavant à pH équilibré, sans parfum, pour une hygiène douce au quotidien.",
      ar: "غسول متوازن درجة الحموضة وخالٍ من العطور للنظافة اليومية اللطيفة."
    }
  },
  {
    id: "silk-hair-mask",
    image: "",
    images: [],
    price: 680,
    stock: 10,
    category: { en: "Haircare", fr: "Cheveux", ar: "العناية بالشعر" },
    name:     { en: "Silk Repair Hair Mask", fr: "Masque Capillaire Soie Réparateur", ar: "قناع الحرير لإصلاح الشعر" },
    description: {
      en: "A deep-conditioning mask with silk proteins to restore softness and shine.",
      fr: "Un masque nourrissant aux protéines de soie pour retrouver douceur et brillance.",
      ar: "قناع مغذٍ ببروتينات الحرير لاستعادة النعومة واللمعان."
    }
  },
  {
    id: "rose-mist",
    image: "",
    images: [],
    price: 450,
    stock: 10,
    category: { en: "Fragrance", fr: "Parfum", ar: "العطور" },
    name:     { en: "Rose Water Mist", fr: "Brume à l'Eau de Rose", ar: "بخاخ ماء الورد" },
    description: {
      en: "A refreshing facial mist of pure rose water to soothe and hydrate throughout the day.",
      fr: "Une brume visage rafraîchissante à l'eau de rose pure pour apaiser et hydrater.",
      ar: "بخاخ منعش للوجه بماء الورد النقي لتهدئة وترطيب البشرة."
    }
  },
  {
    id: "silk-scrunchie",
    image: "",
    images: [],
    price: 250,
    stock: 10,
    category: { en: "Accessories", fr: "Accessoires", ar: "الإكسسوارات" },
    name:     { en: "Silk Scrunchie Set", fr: "Lot de Chouchous en Soie", ar: "طقم ربطات شعر حريرية" },
    description: {
      en: "A set of three silk scrunchies that are gentle on your hair and beautifully finished.",
      fr: "Un lot de trois chouchous en soie, doux pour les cheveux et délicatement finis.",
      ar: "طقم من ثلاث ربطات شعر حريرية، لطيفة على الشعر وبتشطيب أنيق."
    }
  }
];
