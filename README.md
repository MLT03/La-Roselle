# La Roselle — Shop website

An elegant, floral, feminine boutique website for **La Roselle** with a customer-facing shop and a password-protected admin panel.

## Features

- **Customer site** ([index.html](index.html)) — floral, multilingual (English, French, Arabic with RTL), product catalogue, shopping cart, Bankily checkout with proof-of-payment upload, cash-on-delivery option, and WhatsApp order sharing.
- **Admin site** ([admin.html](admin.html)) — password-protected back office where you can add / edit / remove products (including photos uploaded from your device), change prices and descriptions, review orders, view Bankily payment proofs, update order status, configure shop settings, and change your admin password.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Customer shop |
| `admin.html` | Admin panel |
| `styles.css` | Shared styling |
| `admin.css` | Admin-specific styling |
| `translations.js` | All UI text (EN / FR / AR) |
| `products.js` | **Built-in default products** (used as a fallback) |
| `storage.js` | Shared data layer (localStorage) |
| `script.js` | Customer logic (cart, checkout, i18n) |
| `admin.js` | Admin logic (login, products, orders, settings) |
| `images/` | Optional folder for product photos shipped with the site |

## How to run

Open `index.html` in your browser. No build step, no server required.

For local development with a proper URL (needed if you want admin and customer tabs to talk to each other):

```bash
cd site_la_roselle
python3 -m http.server 8000
```

Then visit:
- Customer shop → http://localhost:8000/
- Admin panel → http://localhost:8000/admin.html

## Admin — first login

1. Visit `admin.html` in your browser.
2. On first use, the default password is: **`laroselle`**
3. Go to the **Settings** tab and:
   - Update the shop details, **Bankily number**, **Bankily recipient name**, **currency**, and your **WhatsApp number** (international format, digits only, e.g. `22200000000`).
   - **Change the password** from the "Change password" card. This is important — do it right after your first login.

## Managing products (admin)

In the **Products** tab you can:
- **+ New product** — upload a photo, set a unique ID, a numeric price, and translations (EN / FR / AR). If you only have one language, leave the others blank — they fall back to English automatically.
- **Edit** / **Delete** each product.
- **⬇ Export** — download your full product list as a JSON file.
- **⬆ Import** — upload a previously exported JSON file (replaces the current list).
- **Reset to defaults** — restore the built-in starter products from `products.js`.

### Publishing product changes to the live site

Products are stored in the browser's local storage, which means changes you make in the admin are visible **on your own browser**. To share them with all visitors (once the site is uploaded to a real host):

1. In the admin, click **Export** to download a JSON file.
2. Open `products.js` in a text editor and replace the `DEFAULT_PRODUCTS` array with the exported JSON.
3. Re-upload the file to your host. Every visitor will now see the new products.

> For a simple shop this works well. If you later want real-time updates without re-deploying, you'll need a proper backend (Firebase, Supabase, or a Node/PHP server). The current code is structured so you can swap `storage.js` for API calls when that time comes.

## Orders & Bankily

When a customer places an order:

1. They fill in name, phone, delivery address, and optional notes.
2. They choose **Bankily** or **Cash on delivery**.
3. If Bankily: they see your Bankily number and recipient name, must upload a **screenshot / proof of payment**, and only then can submit.
4. After submitting, they get a confirmation with the order number and a **"Send this order on WhatsApp"** button that pre-fills a message to your WhatsApp number.

Orders appear in the admin **Orders** tab with a badge count of pending ones. Click an order to:
- See full customer info and items.
- **View the proof of payment** (with download / open-in-new-tab buttons).
- **Change the status**: `awaiting verification → accepted → shipped → completed` (or `cancelled`).
- Delete the order.

> **Important limitation (no backend):** Orders and proofs are stored in the customer's own browser. For them to reach you, they must use the **"Send this order on WhatsApp"** button. That sends the order details (customer info, items, total, payment method) directly to your WhatsApp — for Bankily orders, the customer should then also forward the proof-of-payment screenshot they have on their phone. When you install a real backend later, you can replace this with automatic server-side orders.

## Customizing the design

- **Brand colors** — edit the CSS variables at the top of [styles.css](styles.css) (the `:root` block). Change `--blush-*`, `--rose-deep`, `--gold`, `--leaf`, etc.
- **UI text** (menu, hero, buttons, etc.) — edit [translations.js](translations.js).
- **Shop name**, **currency**, **contact info**, **Bankily number**, **WhatsApp number** — all configurable in the admin **Settings** tab.

## Security notes

- The admin password is hashed (SHA-256) and stored in localStorage. Anyone who has physical access to your browser profile could bypass it — treat this as a convenience lock, not real auth.
- For a production shop with real orders, add a real server-side authentication layer.
- Do not commit exported product JSON to a public repository if it contains private photos you don't want public.
