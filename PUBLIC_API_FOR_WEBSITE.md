# Kratos CRM — Public API 

## Base

```
https://<API_HOST>/api/v1
```

Replace `<API_HOST>` with the deployed CRM API host. All paths below are relative to this base.

### Response envelope

Every response is JSON in one of these shapes:

```jsonc
// success (single object)
{ "success": true, "data": { ... } }

// success (list) — includes pagination meta
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }

// error
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "…", "details": { ... } } }
```

### Pagination (list endpoints)

| Query param | Default | Max | Notes |
|---|---|---|---|
| `page` | `1` | — | 1-based |
| `limit` | `20` | `100` | items per page |

Prices are strings (`Decimal`) except computed fields (`finalPrice`, `componentsTotal`,
`displayPrice`), which are numbers.

---

## 1. Products

```
GET /public/products
```

Active products only. Sorted by category, then brand.

**Query params:** `page`, `limit`, `category` (exact, case-insensitive — e.g. `Battery`).

**Send:** nothing (no body, no headers).

**Response:**

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "3b789103-53cc-49cf-9db9-731b07fba788",
      "category": "Battery",
      "brandName": "Tesla Powerwall 3",
      "capacity": "13.5kWh",
      "stock": 8,
      "basePrice": "11900",        // Decimal string
      "stateRebate": "1600",       // Decimal string
      "federalRebate": "0",        // Decimal string
      "imageUrl": null,
      "officialUrl": null,
      "isActive": true,
      "createdAt": "2026-07-02T07:00:56.715Z",
      "updatedAt": "2026-07-02T07:00:56.715Z",
      "deletedAt": null,
      "finalPrice": 10300          // number = basePrice - stateRebate - federalRebate (floored at 0)
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

> Display price to visitors = `finalPrice`. `stock` is a display attribute, not live inventory.
> `imageUrl` is a **400×400 WebP** (square, cropped) when set, else `null`.

---

## 2. Packages

```
GET /public/packages
```

Published packages only, newest first. Each package embeds its component products.

**Query params:** `page`, `limit`.

**Send:** nothing.

**Response:**

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "95e3aca6-35da-40dc-bf75-8b6776e1fe50",
      "name": "6.6kW Residential System",
      "slug": "residential-6-6kw",
      "description": "15x 440W panels + 5kW inverter, fully installed.",
      "power": "6.6kW System",
      "estimatedPrice": "4990",      // Decimal string; 0 means "no override"
      "imageUrl": null,
      "isPublished": true,
      "createdAt": "2026-07-02T07:00:57.218Z",
      "updatedAt": "2026-07-02T07:01:04.400Z",
      "deletedAt": null,
      "products": [
        {
          "productId": "4b6af93f-4215-4270-9be5-7468606d2944",
          "quantity": 15,
          "sortOrder": 0,
          "product": { /* full Product object incl. finalPrice */ }
        }
      ],
      "componentsTotal": 3950,       // number = Σ (product.finalPrice × quantity)
      "displayPrice": 4990           // number = estimatedPrice if > 0, else componentsTotal
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

> Show `displayPrice` as the headline package price.
> `imageUrl` is a **400×400 WebP** (square, cropped) when set, else `null`.

### Single package by slug

```
GET /public/packages/:slug
```

**Send:** nothing. `:slug` from the list response (e.g. `residential-6-6kw`).

**Response:** `{ "success": true, "data": { /* one package object, same shape as above */ } }`
404 if the slug is unknown or unpublished.

---

## 3. Hero images

```
GET /public/hero-images
```

Active hero images grouped by variant. Response is cached 5 minutes (`Cache-Control: public, max-age=300`).

**Send:** nothing.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "desktop": [
      { "url": "https://…/optimized.webp", "originalUrl": "https://…/original.jpg", "width": 2400, "height": 1350 }
    ],
    "mobile": [
      { "url": "https://…/optimized.webp", "originalUrl": "https://…/original.jpg", "width": 1200, "height": 1600 }
    ]
  }
}
```

- `url` — optimized WebP, serve this to visitors.
- `originalUrl` — untouched original (fallback / high-res).
- Desktop variant is 16:9 (min 2400×1350), mobile is 3:4 (min 1080×1440).
- Arrays may be empty if none uploaded for that variant.

---

## 4. Lead form (home + contact pages)

A single shared, CRM-managed form. Fields are configured in the CRM
(Website Settings → Lead Form) and change without a website deploy.

> **One simple contract.** Render every field in `fieldsSchema` and submit all
> values inside `customFields` (keyed by `field_name`) — nothing else needed.
> Fields carry an optional **`maps_to`** telling the server to route that value
> onto a core lead column (`firstName`, `email`, `phone`, …). The CRM guarantees
> the form always includes a required **First name** field and an **Email or
> Phone** field, so a `customFields`-only submit is enough to create a lead.
> (Top-level `firstName`/`email`/`phone` are still accepted and win over mapped
> values if you prefer to send them explicitly.)

### 4a. Fetch the form schema (to render it)

```
GET /public/lead-form
```

**Send:** nothing.

**Response** (`data` is `null` if no form is configured yet):

```jsonc
{
  "success": true,
  "data": {
    "id": "1ea61e74-…",
    "formTitle": "Get in touch",
    "submitButtonText": "Send enquiry",
    "version": 2,
    "fieldsSchema": [
      {
        "field_name": "name",           // key you submit under (in customFields)
        "label": "Your name",
        "type": "text",
        "required": true,
        "order": 0,
        "maps_to": "firstName"          // → routed onto the lead's firstName column
      },
      {
        "field_name": "email",
        "label": "Email",
        "type": "email",
        "required": true,
        "order": 1,
        "maps_to": "email"              // → lead.email
      },
      {
        "field_name": "enquiry_type",   // no maps_to → stored as a custom response
        "label": "Enquiry type",
        "type": "select",
        "required": true,
        "order": 2,
        "options": ["Residential", "Commercial"],  // present for select/multiselect/radio
        "placeholder": "…",             // optional
        "help_text": "…",               // optional
        "validation": { "min": 0, "max": 100, "pattern": "…" } // optional
      }
    ]
  }
}
```

**Render each field by `type`:**

| `type` | Input | Value to send |
|---|---|---|
| `text`, `textarea` | text / multiline | string |
| `email` | email | string (validated) |
| `phone` | tel | string |
| `number` | number | number |
| `select`, `radio` | single choice from `options` | string (one of `options`) |
| `multiselect` | multi choice from `options` | string[] |
| `checkbox` | checkbox | boolean |
| `date` | date | string `YYYY-MM-DD` |

**`maps_to`** (optional, per field): when present the server routes the value onto that
core lead column instead of the custom responses. Possible values: `firstName`,
`lastName`, `email`, `phone`, `suburb`, `state`, `postcode`. Fields without `maps_to`
are stored as custom responses. You don't need to treat mapped fields specially when
rendering — just submit their values in `customFields` like any other field.

### 4b. Submit the form (creates a lead)

```
POST /leads/submit
Content-Type: application/json
```

**Body — put every field's value in `customFields`, keyed by `field_name`:**

```jsonc
{
  "customFields": {
    "name": "Jane Doe",             // maps_to firstName  → lead.firstName
    "email": "jane@example.com",    // maps_to email      → lead.email
    "enquiry_type": "Residential"   // no maps_to         → custom response
  },

  // Attribution (optional — pass through whatever you have)
  "utmSource": "google", "utmMedium": "cpc", "utmCampaign": "spring",
  "gclid": "…", "fbclid": "…", "referrerUrl": "https://…",

  "website": ""                     // HONEYPOT — must stay empty; bots that fill it are dropped
}
```

**What to send / notes:**
- Submit **all** field values in `customFields` (keyed by `field_name`). Mapped fields
  are routed onto the lead automatically.
- `customFields` is validated server-side against the current form schema. A missing
  `required` field → `400` with per-field errors. Unknown keys are dropped silently.
- After mapping, the lead still needs a name and an email **or** phone — the CRM form
  guarantees these fields exist, so a valid submission always satisfies it.
- Include the hidden `website` honeypot input in your form and leave it empty.
- Optional: you may also send `firstName`/`email`/`phone` (and `lastName`, `suburb`,
  `state`, `postcode`, `message`, `consentMarketing`) as **top-level** keys — these win
  over mapped values if both are present.

**Success:**

```jsonc
{
  "success": true,
  "data": { "message": "Thank you, we will be in touch shortly.", "reference": "2391029f-…" }
}
```

A honeypot trip or a duplicate contact also returns a generic success (no data leaked to bots).

**Validation error:**

```jsonc
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Form validation failed",
    "details": { "fields": [ { "field": "enquiry_type", "message": "Enquiry type is required" } ] }
  }
}
```

Behind the scenes each submission is deduped by email/phone, auto-assigned to a sales rep
(round-robin), and attributed (first/last touch). Repeat contacts enrich the existing lead
rather than creating a duplicate.

---

## Quick reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/public/products` | none | Active products (paginated, `?category=`) |
| GET | `/public/packages` | none | Published packages + components (paginated) |
| GET | `/public/packages/:slug` | none | One package by slug |
| GET | `/public/hero-images` | none | Hero images `{ desktop[], mobile[] }` |
| GET | `/public/lead-form` | none | Global form schema (or `null`) |
| POST | `/leads/submit` | none | Submit form → creates a lead |
